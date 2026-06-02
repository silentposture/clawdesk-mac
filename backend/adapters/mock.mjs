import {
  mapKeygenEventToLicenseMutation,
  mapLemonSqueezyEventToLicenseMutation,
  mapPaddleEventToLicenseMutation,
  summarizeProductionEnv,
} from "../contracts.mjs";

const ssoProviders = [
  { id: "apple", name: "Apple ID", singleSignOn: true },
  { id: "google", name: "Google", singleSignOn: true },
  { id: "microsoft", name: "Microsoft", singleSignOn: true },
  { id: "github", name: "GitHub", singleSignOn: true },
  { id: "okta", name: "Okta", singleSignOn: true },
  { id: "enterprise", name: "SAML/SSO", singleSignOn: true },
];

export function createMockAdapters({ env = process.env } = {}) {
  return {
    mode: "mock",
    readiness: {
      ready: true,
      productionEnv: summarizeProductionEnv(env),
      warnings: ["mock adapters are for local simulation only"],
    },
    paddle: {
      verifyWebhookSignature() {
        return { ok: true, mode: "mock", reason: "signature verification bypassed in mock mode" };
      },
      mapWebhookEvent: mapPaddleEventToLicenseMutation,
    },
    lemonSqueezy: {
      verifyWebhookSignature() {
        return { ok: true, mode: "mock", reason: "signature verification bypassed in mock mode" };
      },
      mapWebhookEvent: mapLemonSqueezyEventToLicenseMutation,
      activateLicenseKey({ licenseKey, instanceName } = {}) {
        const key = String(licenseKey ?? "").trim();
        if (!key) return { ok: false, statusCode: 400, error: "licenseKey is required" };
        return {
          ok: true,
          statusCode: 200,
          activated: true,
          status: "active",
          instanceId: `lsinst_${Buffer.from(`${key}:${instanceName ?? "ClawDesk"}`).toString("base64url").slice(0, 18)}`,
          licenseKeyId: `lskey_${Buffer.from(key).toString("base64url").slice(0, 12)}`,
          activationLimit: 3,
          activationUsage: 1,
          expiresAt: null,
          payload: { activated: true, error: null },
        };
      },
      validateLicenseKey({ licenseKey, instanceId } = {}) {
        const key = String(licenseKey ?? "").trim();
        const instance = String(instanceId ?? "").trim();
        if (!key || !instance) return { ok: false, statusCode: 400, error: "licenseKey and instanceId are required" };
        return {
          ok: true,
          statusCode: 200,
          valid: true,
          status: "active",
          instanceId: instance,
          licenseKeyId: `lskey_${Buffer.from(key).toString("base64url").slice(0, 12)}`,
          activationLimit: 3,
          activationUsage: 1,
          expiresAt: null,
          payload: { valid: true, error: null },
        };
      },
    },
    keygen: {
      mapWebhookEvent: mapKeygenEventToLicenseMutation,
      validateOfflineTicket({ parsed, machineFingerprintHash }) {
        if (!parsed) return { ok: false, statusCode: 400, error: "Invalid offline ticket" };
        if (!parsed.signatureMatch) {
          return { ok: false, statusCode: 400, error: "Ticket signature invalid", faultCode: "CLWD-LIC-1001" };
        }
        const machineMatched =
          !machineFingerprintHash ||
          parsed.payload?.machineFingerprintHash === machineFingerprintHash;
        return {
          ok: true,
          machineMatched,
          tampered: !machineMatched,
          statusCode: machineMatched ? 200 : 426,
        };
      },
    },
    identity: {
      ssoProviders() {
        return ssoProviders;
      },
      validateOidcCallback({ email }) {
        return { ok: typeof email === "string" && email.includes("@") };
      },
    },
  };
}
