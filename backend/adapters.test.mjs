import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBackendAdapters, normalizeBackendAdapterMode } from "./adapters/index.mjs";
import {
  buildKeygenApiUrl,
  keygenApiRequest,
  validateKeygenLicenseOnline,
  verifyKeygenLicenseFile,
  verifyPaddleSignature,
} from "./adapters/production.mjs";

const completeProductionEnv = {
  CLAWDESK_BACKEND_ADAPTER_MODE: "production",
  CLAWDESK_GATEWAY_BASE_URL: "https://gateway.example.test",
  PADDLE_API_KEY: "pdl_secret",
  PADDLE_WEBHOOK_SECRET: "pdl_webhook_secret",
  KEYGEN_ACCOUNT_ID: "acct",
  KEYGEN_PRODUCT_ID: "prod",
  KEYGEN_API_TOKEN: "key_prod_secret",
  KEYGEN_SIGNING_PUBLIC_KEY: "pub",
  KEYGEN_API_BASE_URL: "https://api.keygen.sh",
  CLAWDESK_SSO_ISSUER_URL: "https://issuer.example.test",
  CLAWDESK_SSO_CLIENT_ID: "client",
};

function createSignedKeygenLicenseFile({ payload, type = "license", keyPair, alg = "base64+ed25519" }) {
  const enc = Buffer.from(JSON.stringify(payload)).toString("base64");
  const sig = crypto.sign(null, Buffer.from(`${type}/${enc}`, "utf8"), keyPair.privateKey).toString("base64");
  const body = Buffer.from(JSON.stringify({ alg, enc, sig })).toString("base64");
  const label = type.toUpperCase();
  return `-----BEGIN ${label} FILE-----\n${body}\n-----END ${label} FILE-----`;
}

function tamperKeygenLicenseSignature(licenseFile) {
  const match = licenseFile.match(/-----BEGIN (LICENSE|MACHINE) FILE-----\s*([\s\S]+?)\s*-----END \1 FILE-----/);
  const body = JSON.parse(Buffer.from(match[2].replace(/\s+/g, ""), "base64").toString("utf8"));
  body.sig = Buffer.from("tampered-signature").toString("base64");
  const nextBody = Buffer.from(JSON.stringify(body)).toString("base64");
  return `-----BEGIN ${match[1]} FILE-----\n${nextBody}\n-----END ${match[1]} FILE-----`;
}

describe("backend adapter registry", () => {
  it("defaults to mock mode for local development", () => {
    const adapters = createBackendAdapters({ env: {} });

    expect(normalizeBackendAdapterMode("unknown")).toBe("mock");
    expect(adapters.mode).toBe("mock");
    expect(adapters.readiness.ready).toBe(true);
    expect(adapters.identity.ssoProviders().map((provider) => provider.id)).toContain("github");
  });

  it("creates production adapters with explicit env readiness", () => {
    const adapters = createBackendAdapters({ env: { CLAWDESK_BACKEND_ADAPTER_MODE: "production" } });

    expect(adapters.mode).toBe("production");
    expect(adapters.readiness.ready).toBe(false);
    expect(adapters.readiness.productionEnv.missing).toContain("PADDLE_API_KEY");
  });

  it("does not expose production secret values in readiness output", () => {
    const adapters = createBackendAdapters({ env: completeProductionEnv });
    const serialized = JSON.stringify(adapters.readiness);

    expect(adapters.mode).toBe("production");
    expect(adapters.readiness.ready).toBe(true);
    expect(serialized).not.toContain("pdl_secret");
    expect(serialized).not.toContain("pdl_webhook_secret");
    expect(serialized).not.toContain("key_prod_secret");
  });

  it("keeps Paddle and Keygen event mapping identical across adapter modes", () => {
    const mock = createBackendAdapters({ env: {} });
    const production = createBackendAdapters({ env: completeProductionEnv });

    expect(mock.paddle.mapWebhookEvent("payment_succeeded")).toEqual(production.paddle.mapWebhookEvent("payment_succeeded"));
    expect(mock.keygen.mapWebhookEvent("license.revoked")).toEqual(production.keygen.mapWebhookEvent("license.revoked"));
  });

  it("verifies Paddle production webhook signatures without exposing secrets", () => {
    const rawBody = JSON.stringify({ eventType: "payment_succeeded", licenseKey: "CLWD-PRO-YEARLY-2026-DEV" });
    const timestamp = 1778614000;
    const secret = "pdl_webhook_secret";
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");

    expect(
      verifyPaddleSignature({
        rawBody,
        signatureHeader: `ts=${timestamp};h1=${signature}`,
        secret,
        nowSeconds: timestamp,
      }),
    ).toMatchObject({ ok: true, signatureStatus: "valid" });

    const mismatch = verifyPaddleSignature({
      rawBody,
      signatureHeader: `ts=${timestamp};h1=${"0".repeat(64)}`,
      secret,
      nowSeconds: timestamp,
    });
    expect(mismatch).toMatchObject({ ok: false, statusCode: 401, faultCode: "CLWD-PAY-1005" });
    expect(JSON.stringify(mismatch)).not.toContain(secret);
  });

  it("rejects stale Paddle signatures", () => {
    const rawBody = "{}";
    const timestamp = 1778614000;
    const secret = "pdl_webhook_secret";
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");

    expect(
      verifyPaddleSignature({
        rawBody,
        signatureHeader: `ts=${timestamp};h1=${signature}`,
        secret,
        nowSeconds: timestamp + 301,
      }),
    ).toMatchObject({ ok: false, statusCode: 401, faultCode: "CLWD-PAY-1004" });
  });

  it("verifies Keygen Ed25519 license files and matches machine fingerprints", () => {
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
    const licenseFile = createSignedKeygenLicenseFile({
      keyPair,
      payload: {
        plan: "pro-yearly",
        status: "active",
        machineFingerprintHash: "mfp-prod-1",
        supportUpdatesUntil: "2027-05-13T00:00:00.000Z",
        meta: { expiry: "2026-06-13T00:00:00.000Z" },
      },
    });

    expect(
      verifyKeygenLicenseFile({
        licenseFile,
        publicKey,
        expectedMachineFingerprintHash: "mfp-prod-1",
        now: new Date("2026-05-13T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ok: true,
      signatureStatus: "valid",
      machineMatched: true,
      payload: { plan: "pro-yearly", status: "active" },
    });
  });

  it("rejects tampered Keygen license files and machine mismatches", () => {
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
    const licenseFile = createSignedKeygenLicenseFile({
      keyPair,
      payload: {
        plan: "pro-yearly",
        status: "active",
        machineFingerprintHash: "mfp-prod-1",
        meta: { expiry: "2026-06-13T00:00:00.000Z" },
      },
    });

    expect(
      verifyKeygenLicenseFile({
        licenseFile,
        publicKey,
        expectedMachineFingerprintHash: "mfp-prod-2",
        now: new Date("2026-05-13T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      statusCode: 426,
      faultCode: "CLWD-LIC-1002",
    });

    expect(
      verifyKeygenLicenseFile({
        licenseFile: tamperKeygenLicenseSignature(licenseFile),
        publicKey,
        expectedMachineFingerprintHash: "mfp-prod-1",
        now: new Date("2026-05-13T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      statusCode: 401,
      faultCode: "CLWD-LIC-1001",
    });
  });

  it("rejects expired Keygen license files", () => {
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
    const licenseFile = createSignedKeygenLicenseFile({
      keyPair,
      payload: {
        plan: "pro-yearly",
        status: "active",
        machineFingerprintHash: "mfp-prod-1",
        meta: { expiry: "2026-01-01T00:00:00.000Z" },
      },
    });

    expect(
      verifyKeygenLicenseFile({
        licenseFile,
        publicKey,
        expectedMachineFingerprintHash: "mfp-prod-1",
        now: new Date("2026-05-13T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      statusCode: 426,
      faultCode: "CLWD-LIC-2006",
    });
  });

  it("builds account-scoped Keygen API URLs and rejects destructive paths", async () => {
    expect(
      buildKeygenApiUrl({
        baseUrl: "https://api.keygen.sh/",
        accountId: "clawdesk",
        path: "/licenses/lic_123/actions/validate",
      }),
    ).toBe("https://api.keygen.sh/v1/accounts/clawdesk/licenses/lic_123/actions/validate");

    const blocked = await keygenApiRequest({
      env: completeProductionEnv,
      method: "POST",
      path: "/licenses/lic_123/actions/revoke",
      body: {},
      fetchImpl: async () => {
        throw new Error("destructive request should not run");
      },
    });
    expect(blocked).toMatchObject({ ok: false, statusCode: 405, faultCode: "CLWD-LIC-9005" });
  });

  it("validates Keygen licenses online with Bearer auth and without leaking tokens", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/licenses/lic_123")) {
        return new Response(JSON.stringify({ data: { id: "lic_123", attributes: { status: "ACTIVE", suspended: false } } }), { status: 200 });
      }
      if (url.endsWith("/licenses/lic_123/actions/validate")) {
        return new Response(JSON.stringify({ meta: { valid: true, code: "VALID" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: [{ title: "not found" }] }), { status: 404 });
    };

    const result = await validateKeygenLicenseOnline({
      env: completeProductionEnv,
      fetchImpl,
      licenseIdOrKey: "lic_123",
      machineFingerprintHash: "mfp-prod-1",
    });

    expect(result).toMatchObject({ ok: true, status: "active", onlineValidationStatus: "valid", keygenStatusCode: "VALID" });
    expect(calls).toHaveLength(2);
    expect(calls[0].options.headers.Authorization).toBe("Bearer key_prod_secret");
    expect(JSON.stringify(result)).not.toContain("key_prod_secret");
  });

  it("maps remote revoked/suspended and machine mismatch statuses to safe failure states", async () => {
    const revokedFetch = async () =>
      new Response(JSON.stringify({ data: { id: "lic_123", attributes: { status: "SUSPENDED", suspended: true } } }), { status: 200 });
    const revoked = await validateKeygenLicenseOnline({
      env: completeProductionEnv,
      fetchImpl: revokedFetch,
      licenseIdOrKey: "lic_123",
      machineFingerprintHash: "mfp-prod-1",
    });
    expect(revoked).toMatchObject({ ok: false, status: "suspended", faultCode: "CLWD-LIC-3004" });

    const mismatchFetch = async (url) => {
      if (url.endsWith("/licenses/lic_123")) {
        return new Response(JSON.stringify({ data: { id: "lic_123", attributes: { status: "ACTIVE" } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ meta: { valid: false, code: "FINGERPRINT_SCOPE_MISMATCH" } }), { status: 200 });
    };
    const mismatch = await validateKeygenLicenseOnline({
      env: completeProductionEnv,
      fetchImpl: mismatchFetch,
      licenseIdOrKey: "lic_123",
      machineFingerprintHash: "mfp-prod-2",
    });
    expect(mismatch).toMatchObject({ ok: false, status: "tampered", faultCode: "CLWD-LIC-3003", machineMatched: false });
  });

  it("falls back to offline grace when online Keygen validation is unavailable", async () => {
    const keyPair = crypto.generateKeyPairSync("ed25519");
    const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" });
    const licenseFile = createSignedKeygenLicenseFile({
      keyPair,
      payload: {
        id: "lic_123",
        plan: "pro-yearly",
        status: "active",
        machineFingerprintHash: "mfp-prod-1",
        meta: { expiry: "2026-06-13T00:00:00.000Z" },
      },
    });
    const adapters = createBackendAdapters({
      env: { ...completeProductionEnv, KEYGEN_SIGNING_PUBLIC_KEY: publicKey },
      fetchImpl: async () => {
        throw new Error("network down key_prod_secret");
      },
    });

    const result = await adapters.keygen.validateOfflineTicket({
      licenseFile,
      machineFingerprintHash: "mfp-prod-1",
      onlineValidation: true,
      licenseIdOrKey: "lic_123",
    });

    expect(result).toMatchObject({
      ok: true,
      status: "offline-grace",
      onlineValidationStatus: "unavailable",
      offlineGrace: true,
    });
    expect(JSON.stringify(result)).not.toContain("key_prod_secret");
  });
});
