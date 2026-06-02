import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { BACKEND_CONTRACT_VERSION, validateBackendContractShape } from "../backend/contracts.mjs";
import { createVerifyReportTracker } from "./lib/verify-report.mjs";

const port = 19110;
const root = new URL("file:///");
root.pathname = process.cwd() + "/";
const serviceUrl = `http://127.0.0.1:${port}`;
const stateFile = `${process.cwd()}/.clawdesk-backend/state.test.json`;
const tracker = createVerifyReportTracker();
const checks = tracker.checks;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT_FAIL: ${message}`);
  }
}

async function request(path, options = {}) {
  const url = `${serviceUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function waitForHealth(signal) {
  const timeout = Date.now() + 8000;
  while (Date.now() < timeout) {
    try {
      const { status, body } = await request("/health");
      if (status === 200 && body.version) return;
      await delay(150, signal);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      await delay(150, signal);
    }
  }
  throw new Error("Backend simulator health timeout");
}

function evaluateTestCase(name, contractSurface, assertion) {
  try {
    assertion();
    tracker.pass(name, contractSurface);
    return true;
  } catch (error) {
    tracker.fail(name, error.message, contractSurface);
    return false;
  }
}

const server = spawn(
  "node",
  ["backend/server.mjs"],
  {
    env: {
      ...process.env,
      CLAWDESK_BACKEND_PORT: String(port),
      CLAWDESK_BACKEND_STATE_FILE: stateFile,
      CLAWDESK_LICENSE_HMAC_KEY: "verify-sim-hmac-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));

let exitCode = 0;
server.on("exit", (code) => {
  exitCode = code ?? 0;
});

let success = true;
const controller = new AbortController();

try {
  await waitForHealth(controller.signal);

  const health = await request("/health");
  evaluateTestCase("後端健康檢查", "mixed", () => {
    assert(health.status === 200, "health status should be 200");
    assert(health.body.service.includes("ClawDesk"), "service name should contain ClawDesk");
    assert(health.body.contractVersion === BACKEND_CONTRACT_VERSION, "contract version should match shared contract");
    assert(health.body.paymentProvider === "lemon-squeezy", "payment provider should be configured");
    assert(health.body.licenseProvider === "keygen", "legacy license provider should be configured");
  });

  const contract = await request("/contract");
  evaluateTestCase("正式後端合約 manifest", "mixed", () => {
    assert(contract.status === 200, "contract endpoint should be available");
    const validation = validateBackendContractShape(contract.body);
    assert(validation.ok === true, `contract should validate: ${validation.missingEndpoints.join(", ")}`);
  });

  const email = `verify-${randomUUID().slice(0, 8)}@example.com`;
  const password = "Password123!";
  const register = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName: "Verifier" }),
  });
  evaluateTestCase("Email 註冊流程", "legacy", () => {
    assert(register.status === 200, "register should be ok");
    assert(!!register.body.debugVerificationToken, "verification token should be returned");
  });

  const confirm = await request("/auth/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code: register.body.debugVerificationToken }),
  });
  evaluateTestCase("信箱驗證確認", "legacy", () => {
    assert(confirm.status === 200, "confirm should be ok");
    assert(confirm.body.status === "verified", "status should be verified");
  });

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  evaluateTestCase("帳號登入", "legacy", () => {
    assert(login.status === 200, "login should be ok");
    assert(login.body.session?.token?.length > 10, "session token should exist");
  });

  const token = login.body.session?.token ?? "";
  const session = await request(`/auth/session?token=${token}`);
  evaluateTestCase("Session 查詢", "legacy", () => {
    assert(session.status === 200, "session should be valid");
    assert(session.body.session.email === email, "email should match");
  });

  const me = await request("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  evaluateTestCase("Canonical auth me 查詢", "canonical", () => {
    assert(me.status === 200, "canonical auth me should be valid");
    assert(me.body.session.account.email === email, "canonical email should match");
  });

  const ssoProviders = await request("/auth/sso/providers");
  evaluateTestCase("SSO 提供者清單", "legacy", () => {
    assert(ssoProviders.status === 200, "sso provider list should be available");
    assert(Array.isArray(ssoProviders.body.providers) && ssoProviders.body.providers.length >= 3, "providers should exist");
  });

  const fp = await request("/machine/fingerprint");
  evaluateTestCase("機器雜湊產生", "mixed", () => {
    assert(fp.status === 200, "fingerprint should be available");
    assert(typeof fp.body.fingerprintHash === "string" && fp.body.fingerprintHash.length > 20, "fingerprint hash should be valid");
  });

  const activate = await request("/licenses/activate-key", {
    method: "POST",
    body: JSON.stringify({ licenseKey: "CLWD-PRO-YEARLY-2026-DEV", machineFingerprintHash: fp.body.fingerprintHash }),
  });
  evaluateTestCase("授權啟用", "legacy", () => {
    assert(activate.status === 200, "activate should be ok");
    assert(activate.body.license?.plan === "pro-yearly", "plan should be pro-yearly");
    assert(activate.body.provider === "lemon-squeezy", "activation provider should be configured");
    assert(typeof activate.body.instance?.id === "string" && activate.body.instance.id.length > 8, "payment instance id should be returned");
    assert(activate.body.offlineTicket?.token, "offline ticket should be returned");
  });

  const canonicalActivate = await request("/api/license/activate", {
    method: "POST",
    body: JSON.stringify({
      orderNo: "CLWD-PRO-YEARLY-2026-DEV",
      email,
      hwid: fp.body.fingerprintHash,
      instanceId: "clawdesk-test-instance",
      productKey: "clawdesk",
      appVersion: "0.1.0",
    }),
  });
  evaluateTestCase("Canonical 授權啟用與證書簽發", "canonical", () => {
    assert(canonicalActivate.status === 200, "canonical activate should be ok");
    assert(typeof canonicalActivate.body.license === "string" && canonicalActivate.body.license.includes("\"payload\""), "canonical certificate should be returned");
    assert(canonicalActivate.body.instanceId === "clawdesk-test-instance", "canonical instance id should match");
  });

  const canonicalValidate = await request("/api/license/validate", {
    method: "POST",
    body: JSON.stringify({
      licenseCertificateJson: canonicalActivate.body.license,
      hwid: fp.body.fingerprintHash,
      instanceId: "clawdesk-test-instance",
      productKey: "clawdesk",
      appReleaseDateUtc: "2026-05-16T00:00:00.000Z",
    }),
  });
  evaluateTestCase("Canonical 證書驗證", "canonical", () => {
    assert(canonicalValidate.status === 200, "canonical validate should be ok");
    assert(canonicalValidate.body.data.active === true, "canonical data should be active");
    assert(canonicalValidate.body.data.machineBindingMatched === true, "machine binding should match");
  });

  const entitlements = await request("/api/account/entitlements", {
    headers: { Authorization: `Bearer ${token}` },
  });
  evaluateTestCase("Canonical entitlement 查詢", "canonical", () => {
    assert(entitlements.status === 200, "entitlements should be ok");
    assert(Array.isArray(entitlements.body.entitlements), "entitlements should be array");
    assert(entitlements.body.entitlements.some((item) => item.productKey === "clawdesk"), "clawdesk entitlement missing");
  });

  const validate = await request("/licenses/validate", {
    method: "POST",
    body: JSON.stringify({
      licenseKey: "CLWD-PRO-YEARLY-2026-DEV",
      instanceId: activate.body.instance.id,
      machineFingerprintHash: fp.body.fingerprintHash,
    }),
  });
  evaluateTestCase("授權實例驗證", "legacy", () => {
    assert(validate.status === 200, "validate should be ok");
    assert(validate.body.status === "active", "status should be active");
    assert(validate.body.onlineValidationStatus === "valid", "online validation should be valid");
    assert(validate.body.machineMatched === true, "machine should match");
  });

  const webhook = await request("/webhooks/lemon-squeezy", {
    method: "POST",
    body: JSON.stringify({
      eventId: `verify-backend-sim-${Date.now()}`,
      eventType: "subscription_cancelled",
      licenseKey: "CLWD-PRO-YEARLY-2026-DEV",
      note: "simulate cancellation",
    }),
  });
  evaluateTestCase("Webhook 更新授權", "legacy", () => {
    assert(webhook.status === 200, "webhook should be accepted");
    assert(webhook.body.status === "ok", "webhook status should be ok");
  });

  const legal = await request("/legal/documents");
  const notices = await request("/legal/notices");
  evaluateTestCase("法務文件與通知", "mixed", () => {
    assert(legal.status === 200, "legal docs should be available");
    assert(Array.isArray(legal.body.documents), "documents should be array");
    assert(notices.status === 200, "legal notices should be available");
    assert(Array.isArray(notices.body.notices), "notices should be array");
  });

  const updateCheck = await request("/updates/check");
  const updateManifest = await request("/updates/manifest");
  evaluateTestCase("更新檢查", "mixed", () => {
    assert(updateCheck.status === 200, "update check should be ok");
    assert(typeof updateCheck.body.latestVersion === "string", "latestVersion should be string");
    assert(updateManifest.status === 200, "update manifest should be ok");
    assert(Array.isArray(updateManifest.body.releases), "update manifest releases should be array");
    assert(updateManifest.body.releases[0].downloads.macosUniversal.endsWith(".dmg"), "macOS dmg download should be present");
  });

  const mcpConnectors = await request("/mcp/connectors");
  const mcpConnect = await request("/mcp/connect", {
    method: "POST",
    body: JSON.stringify({ connectorId: "google-workspace", scopes: ["https://www.googleapis.com/auth/drive.readonly"] }),
  });
  const mcpAudit = await request("/mcp/audit");
  const mcpRevoke = await request("/mcp/revoke", {
    method: "POST",
    body: JSON.stringify({ connectorId: "google-workspace" }),
  });
  const microsoftOAuth = await request(`/mcp/microsoft/oauth/start?scopes=${encodeURIComponent("openid profile offline_access User.Read Files.Read")}`);
  const microsoftCallback = await request("/mcp/microsoft/oauth/callback", {
    method: "POST",
    body: JSON.stringify({ code: "", state: "" }),
  });
  evaluateTestCase("MCP scope grant revoke audit", "mixed", () => {
    assert(mcpConnectors.status === 200, "MCP connectors should be available");
    assert(mcpConnect.status === 200, "MCP connect should be ok");
    assert(mcpConnect.body.grant.scopes.includes("https://www.googleapis.com/auth/drive.readonly"), "MCP grant scope missing");
    assert(mcpAudit.status === 200 && mcpAudit.body.events.length > 0, "MCP audit should include events");
    assert(mcpRevoke.status === 200, "MCP revoke should be ok");
    assert(microsoftOAuth.status === 200, "Microsoft OAuth start should be ok");
    assert(microsoftOAuth.body.authorizationUrl.includes("login.microsoftonline.com"), "Microsoft OAuth URL missing");
    assert(microsoftCallback.status === 400, "Microsoft callback without code should fail closed");
  });
} catch (error) {
  success = false;
  tracker.fail("verify-backend-sim", error.message, "mixed");
} finally {
  const report = {
    service: "verify-backend-sim",
    createdAt: new Date().toISOString(),
    result: success ? "PASS" : "FAIL",
    checks,
    surfaces: tracker.summarizeSurfaces(),
    counts: tracker.summarizeCounts(),
  };
  console.log("Backend sim verification:");
  for (const item of checks) {
    if (item.ok) console.log(`PASS ${item.name}`);
    else console.log(`FAIL ${item.name} -> ${item.reason}`);
  }
  console.log(JSON.stringify(report, null, 2));
  controller.abort();
  server.kill("SIGTERM");
  await delay(300);
  if (!success && server.killed === false) {
    server.kill("SIGKILL");
  }
  if (!success || exitCode !== 0) {
    process.exit(1);
  }
}
