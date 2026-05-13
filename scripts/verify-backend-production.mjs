import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.CLAWDESK_PRODUCTION_BACKEND_PORT ?? 19140);
const baseUrl = `http://127.0.0.1:${port}`;
const reportDir = path.join(process.cwd(), "artifacts", "backend-production");
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-report.json`);
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdesk-production-backend-"));
const stateFile = path.join(stateDir, "state.json");

const keyPair = crypto.generateKeyPairSync("ed25519");
const keygenPublicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
const paddleWebhookSecret = "test_paddle_webhook_secret";
const keygenApiToken = "test_keygen_api_token";
const seedLicenseKey = "CLWD-PRO-YEARLY-2026-DEV";
const machineFingerprintHash = "mfp-production-adapter-smoke";

const checks = [];
let backend;

function redact(value) {
  return JSON.stringify(value)
    .replaceAll(paddleWebhookSecret, "[REDACTED:PADDLE_WEBHOOK_SECRET]")
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

function signPaddlePayload(rawBody, timestamp = Math.floor(Date.now() / 1000)) {
  const h1 = crypto.createHmac("sha256", paddleWebhookSecret).update(`${timestamp}:${rawBody}`).digest("hex");
  return `ts=${timestamp};h1=${h1}`;
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
      PADDLE_API_KEY: "test_paddle_api_key",
      PADDLE_WEBHOOK_SECRET: paddleWebhookSecret,
      KEYGEN_ACCOUNT_ID: "clawdesk-test",
      KEYGEN_PRODUCT_ID: "clawdesk-desktop",
      KEYGEN_API_TOKEN: keygenApiToken,
      KEYGEN_SIGNING_PUBLIC_KEY: keygenPublicKey,
      KEYGEN_API_BASE_URL: "https://api.keygen.sh",
      CLAWDESK_SSO_ISSUER_URL: "https://sso.clawdesk.example",
      CLAWDESK_SSO_CLIENT_ID: "clawdesk-desktop",
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

async function check(name, action) {
  try {
    const details = await action();
    checks.push({ name, ok: true, details: safeJson(details ?? {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, ok: false, error: message });
    console.log(`FAIL ${name}: ${message}`);
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
    counts: {
      total: checks.length,
      failed: checks.filter((item) => !item.ok).length,
    },
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

  await check("production backend health is ready and redacted", async () => {
    const { response, payload } = await request("/health");
    if (!response.ok) throw new Error(`health HTTP ${response.status}`);
    if (payload.adapterMode !== "production") throw new Error(`wrong adapter mode: ${payload.adapterMode}`);
    if (payload.adapterReadiness?.ready !== true) throw new Error("production adapter readiness is not ready");
    if (JSON.stringify(payload).includes(paddleWebhookSecret) || JSON.stringify(payload).includes(keygenApiToken)) {
      throw new Error("health leaked production secrets");
    }
    return {
      adapterMode: payload.adapterMode,
      contractVersion: payload.contractVersion,
      ready: payload.adapterReadiness?.ready,
      missingEnv: payload.productionEnv?.missing ?? [],
    };
  });

  await check("backend contract exposes production Paddle Keygen SSO endpoints", async () => {
    const { response, payload } = await request("/contract");
    if (!response.ok) throw new Error(`contract HTTP ${response.status}`);
    const keys = new Set((payload.endpoints ?? []).map((endpoint) => `${endpoint.method}:${endpoint.path}`));
    for (const key of ["POST:/webhooks/paddle", "POST:/webhooks/keygen", "POST:/licenses/validate", "POST:/auth/sso/start", "POST:/auth/sso/finish"]) {
      if (!keys.has(key)) throw new Error(`missing contract endpoint ${key}`);
    }
    return { version: payload.version, endpoints: keys.size };
  });

  await check("Paddle webhook rejects invalid signature and accepts valid signature", async () => {
    const body = JSON.stringify({ eventType: "payment_succeeded", licenseKey: seedLicenseKey });
    const invalid = await request("/webhooks/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json", "paddle-signature": "ts=1;h1=00" },
      body,
    });
    if (invalid.response.status !== 401) throw new Error(`invalid signature should be rejected, got ${invalid.response.status}`);

    const valid = await request("/webhooks/paddle", {
      method: "POST",
      headers: { "Content-Type": "application/json", "paddle-signature": signPaddlePayload(body) },
      body,
    });
    if (!valid.response.ok) throw new Error(`valid signature rejected: ${valid.response.status}`);
    if (valid.payload.license?.status !== "active") throw new Error("Paddle event did not activate license");
    return { invalidStatus: invalid.response.status, validStatus: valid.response.status, licenseStatus: valid.payload.license?.status };
  });

  await check("Keygen offline license file validates and tamper fails closed", async () => {
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

  await check("SSO production callback is scaffolded fail-closed", async () => {
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

  await check("production verification report does not contain secrets", async () => {
    const serialized = redact({ checks });
    if (serialized.includes(paddleWebhookSecret) || serialized.includes(keygenApiToken)) {
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
