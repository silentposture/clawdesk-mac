import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVerifyReportTracker } from "./lib/verify-report.mjs";

const port = Number(process.env.CLAWDESK_PRODUCTION_BACKEND_PORT ?? 19140);
const baseUrl = `http://127.0.0.1:${port}`;
const reportDir = path.join(process.cwd(), "artifacts", "backend-production");
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-report.json`);
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdesk-production-backend-"));
const stateFile = path.join(stateDir, "state.json");

const keyPair = crypto.generateKeyPairSync("ed25519");
const keygenPublicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
const lemonSqueezyWebhookSecret = "test_lemon_squeezy_webhook_secret";
const keygenApiToken = "test_keygen_api_token";
const seedLicenseKey = "CLWD-PRO-YEARLY-2026-DEV";
const machineFingerprintHash = "mfp-production-adapter-smoke";

const tracker = createVerifyReportTracker();
const checks = tracker.checks;
let backend;

function redact(value) {
  return JSON.stringify(value)
    .replaceAll(lemonSqueezyWebhookSecret, "[REDACTED:LEMON_SQUEEZY_WEBHOOK_SECRET]")
    .replaceAll(keygenApiToken, "[REDACTED:KEYGEN_API_TOKEN]")
    .replace(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g, "[REDACTED:KEYGEN_PUBLIC_KEY]");
}

function safeJson(value) {
  return JSON.parse(redact(value));
}

function createSignedKeygenLicenseFile(payload) {
  const enc = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto.sign(null, Buffer.from(`license/${enc}`, "utf8"), keyPair.privateKey).toString("base64");
  const body = Buffer.from(JSON.stringify({ alg: "base64+ed25519", enc, sig })).toString("base64");
  return `-----BEGIN LICENSE FILE-----\n${body}\n-----END LICENSE FILE-----`;
}

function signLemonSqueezyPayload(rawBody) {
  return crypto.createHmac("sha256", lemonSqueezyWebhookSecret).update(rawBody).digest("hex");
}

function spawnBackend() {
  return spawn(process.execPath, ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWDESK_BACKEND_PORT: String(port),
      CLAWDESK_BACKEND_STATE_FILE: stateFile,
      CLAWDESK_BACKEND_ADAPTER_MODE: "production",
      CLAWDESK_GATEWAY_BASE_URL: "https://gateway.clawdesk.example",
      LEMON_SQUEEZY_API_KEY: "test_lemon_squeezy_api_key",
      LEMON_SQUEEZY_WEBHOOK_SECRET: lemonSqueezyWebhookSecret,
      LEMON_SQUEEZY_STORE_ID: "12345",
      KEYGEN_ACCOUNT_ID: "clawdesk-test",
      KEYGEN_PRODUCT_ID: "clawdesk-desktop",
      KEYGEN_API_TOKEN: keygenApiToken,
      KEYGEN_SIGNING_PUBLIC_KEY: keygenPublicKey,
      KEYGEN_API_BASE_URL: "https://api.keygen.sh",
      CLAWDESK_SSO_ISSUER_URL: "https://sso.clawdesk.example",
      CLAWDESK_SSO_CLIENT_ID: "clawdesk-desktop",
      MICROSOFT_GRAPH_TENANT_ID: "common",
      MICROSOFT_GRAPH_CLIENT_ID: "ms-client-id",
      MICROSOFT_GRAPH_CLIENT_SECRET: "ms-client-secret",
      MICROSOFT_GRAPH_REDIRECT_URI: "http://127.0.0.1:19140/mcp/microsoft/oauth/callback",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return { response, payload };
}

async function waitForHealth(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const { response } = await request("/health");
      if (response.ok) return;
    } catch {
      // wait until backend binds the local test port
    }
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  throw new Error(`Timed out waiting for production backend on ${baseUrl}`);
}

async function check(name, contractSurface, action) {
  try {
    const result = await tracker.check(name, contractSurface, action);
    const last = checks[checks.length - 1];
    if (last?.ok) {
      last.details = safeJson(result.details ?? {});
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function stopBackend() {
  if (!backend || backend.exitCode !== null) return;
  backend.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => backend.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  if (backend.exitCode === null) backend.kill("SIGKILL");
}

async function writeReport(status) {
  const report = {
    service: "verify-backend-production",
    createdAt: new Date().toISOString(),
    baseUrl,
    adapterMode: "production",
    status,
    checks,
    surfaces: tracker.summarizeSurfaces(),
    counts: tracker.summarizeCounts(),
  };
  const serialized = redact(report);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportFile, `${serialized}\n`, "utf8");
  console.log(`Production backend report: ${reportFile}`);
  console.log(`Result: ${status}`);
}

try {
  backend = spawnBackend();
  await waitForHealth();

  await check("production backend health is ready and redacted", "mixed", async () => {
    const { response, payload } = await request("/health");
    if (!response.ok) throw new Error(`health HTTP ${response.status}`);
    if (payload.adapterMode !== "production") throw new Error(`wrong adapter mode: ${payload.adapterMode}`);
    if (payload.adapterReadiness?.ready !== true) throw new Error("production adapter readiness is not ready");
    if (JSON.stringify(payload).includes(lemonSqueezyWebhookSecret) || JSON.stringify(payload).includes(keygenApiToken)) {
      throw new Error("health leaked production secrets");
    }
    return {
      adapterMode: payload.adapterMode,
      contractVersion: payload.contractVersion,
      ready: payload.adapterReadiness?.ready,
      missingEnv: payload.productionEnv?.missing ?? [],
    };
  });

  await check("backend contract exposes production payment licensing SSO MCP endpoints", "mixed", async () => {
    const { response, payload } = await request("/contract");
    if (!response.ok) throw new Error(`contract HTTP ${response.status}`);
    const keys = new Set((payload.endpoints ?? []).map((endpoint) => `${endpoint.method}:${endpoint.path}`));
    for (const key of ["POST:/api/webhooks/lemonsqueezy", "POST:/webhooks/keygen", "POST:/api/license/validate", "POST:/auth/sso/start", "POST:/auth/sso/finish", "GET:/mcp/microsoft/oauth/start", "POST:/mcp/microsoft/oauth/callback", "GET:/api/account/entitlements"]) {
      if (!keys.has(key)) throw new Error(`missing contract endpoint ${key}`);
    }
    return { version: payload.version, endpoints: keys.size };
  });

  await check("Microsoft Graph OAuth start builds authorization URL and callback fails closed without code", "mixed", async () => {
    const started = await request(`/mcp/microsoft/oauth/start?scopes=${encodeURIComponent("openid profile offline_access User.Read Files.Read")}`);
    if (!started.response.ok) throw new Error(`Microsoft OAuth start rejected: ${started.response.status}`);
    if (!started.payload.configured) throw new Error("Microsoft OAuth should be configured in production smoke env");
    if (!started.payload.authorizationUrl.includes("login.microsoftonline.com")) throw new Error("Microsoft authorization URL missing");
    if (!started.payload.authorizationUrl.includes("code_challenge_method=S256")) throw new Error("PKCE challenge missing");
    const callback = await request("/mcp/microsoft/oauth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "", state: started.payload.state }),
    });
    if (callback.response.status !== 400) throw new Error(`empty callback should fail closed, got ${callback.response.status}`);
    return { configured: started.payload.configured, callbackStatus: callback.response.status };
  });

  await check("payment webhook rejects invalid signature and issues license on valid signature", "legacy", async () => {
    const body = JSON.stringify({ eventType: "order_created", licenseKey: "CLWD-LEMON-PROD1-SMOKE-00001", plan: "yearly", machineFingerprintHash });
    const invalid = await request("/webhooks/lemon-squeezy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": "00" },
      body,
    });
    if (invalid.response.status !== 401) throw new Error(`invalid payment webhook signature should be rejected, got ${invalid.response.status}`);

    const valid = await request("/webhooks/lemon-squeezy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-signature": signLemonSqueezyPayload(body) },
      body,
    });
    if (!valid.response.ok) throw new Error(`valid payment webhook signature rejected: ${valid.response.status}`);
    if (valid.payload.license?.status !== "active") throw new Error("payment webhook event did not issue active license");
    if (!valid.payload.license?.licenseFile) throw new Error("payment webhook event did not issue offline license file");
    return { invalidStatus: invalid.response.status, validStatus: valid.response.status, licenseStatus: valid.payload.license?.status };
  });

  await check("offline license file validates and tamper fails closed", "legacy", async () => {
    const licenseFile = createSignedKeygenLicenseFile({
      id: "lic_prod_smoke",
      plan: "pro-yearly",
      status: "active",
      machineFingerprintHash,
      supportUpdatesUntil: "2027-05-13T00:00:00.000Z",
      features: ["agents", "workflow-builder", "diagnostics"],
      meta: { expiry: "2027-05-13T00:00:00.000Z" },
    });
    const valid = await request("/licenses/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseFile, machineFingerprintHash }),
    });
    if (!valid.response.ok) throw new Error(`valid license file rejected: ${valid.response.status}`);
    if (valid.payload.status !== "active" || valid.payload.machineMatched !== true) throw new Error("license validation did not return active matched status");

    const mismatch = await request("/licenses/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseFile, machineFingerprintHash: "mfp-other-machine" }),
    });
    if (mismatch.response.status !== 426) throw new Error(`machine mismatch should fail closed, got ${mismatch.response.status}`);
    if (mismatch.payload.faultCode !== "CLWD-LIC-1002") throw new Error("machine mismatch fault code changed");
    return {
      validStatus: valid.response.status,
      mismatchStatus: mismatch.response.status,
      faultCode: mismatch.payload.faultCode,
    };
  });

  await check("SSO production callback is scaffolded fail-closed", "legacy", async () => {
    const providers = await request("/auth/sso/providers");
    if (!providers.response.ok) throw new Error("SSO providers unavailable");
    const providerIds = providers.payload.providers.map((item) => item.id);
    for (const id of ["apple", "google", "microsoft", "enterprise"]) {
      if (!providerIds.includes(id)) throw new Error(`missing SSO provider ${id}`);
    }
    const started = await request("/auth/sso/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google" }),
    });
    if (!started.response.ok) throw new Error("SSO start failed");
    const finished = await request("/auth/sso/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", email: "person@example.test" }),
    });
    if (finished.response.status !== 501) throw new Error(`production OIDC callback should be fail-closed, got ${finished.response.status}`);
    return { providerIds, finishFaultCode: finished.payload.faultCode };
  });

  await check("production verification report does not contain secrets", "mixed", async () => {
    const serialized = redact({ checks });
    if (serialized.includes(lemonSqueezyWebhookSecret) || serialized.includes(keygenApiToken)) {
      throw new Error("report redaction failed");
    }
    return { redacted: true };
  });

  await writeReport("PASS");
} catch (error) {
  await writeReport("FAIL");
  process.exitCode = 1;
} finally {
  await stopBackend();
  await fs.rm(stateDir, { recursive: true, force: true });
}
