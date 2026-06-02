import crypto from "node:crypto";
import {
  mapKeygenEventToLicenseMutation,
  mapLemonSqueezyEventToLicenseMutation,
  mapPaddleEventToLicenseMutation,
  summarizeProductionEnv,
} from "../contracts.mjs";

const DEFAULT_PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;
const DEFAULT_KEYGEN_API_TIMEOUT_MS = 5000;
const DEFAULT_LEMON_SQUEEZY_LICENSE_API_TIMEOUT_MS = 5000;
const KEYGEN_ED25519_SPKI_PREFIX = "302a300506032b6570032100";
const DESTRUCTIVE_KEYGEN_ACTION_PATTERN = /\/actions\/(?:revoke|suspend|reinstate|renew|check-in|check-out|increment-usage|decrement-usage|reset-usage)|\/machines(?:\/|$)|\/licenses\/[^/]+\/(?:users|entitlements|policy|owner|group)/;

function parsePaddleSignatureHeader(header) {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
  if (!parts.ts || !parts.h1) return null;
  return { timestamp: parts.ts, signature: parts.h1 };
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPaddleSignature({
  rawBody,
  signatureHeader,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_PADDLE_SIGNATURE_TOLERANCE_SECONDS,
}) {
  if (!secret) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-PAY-9001", error: "Paddle webhook secret is not configured" };
  }
  if (typeof rawBody !== "string") {
    return { ok: false, statusCode: 400, faultCode: "CLWD-PAY-1002", error: "Raw webhook body is required" };
  }
  const parsed = parsePaddleSignatureHeader(signatureHeader);
  if (!parsed) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1001", error: "Invalid Paddle signature header" };
  }
  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1003", error: "Invalid Paddle signature timestamp" };
  }
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1004", error: "Paddle signature timestamp is outside tolerance" };
  }

  const signedPayload = `${parsed.timestamp}:${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  if (!timingSafeHexEqual(expected, parsed.signature)) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1005", error: "Paddle signature mismatch" };
  }

  return { ok: true, timestamp, signatureStatus: "valid" };
}

export function verifyLemonSqueezySignature({ rawBody, signatureHeader, secret } = {}) {
  if (!secret) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-PAY-9101", error: "Lemon Squeezy webhook secret is not configured" };
  }
  if (typeof rawBody !== "string") {
    return { ok: false, statusCode: 400, faultCode: "CLWD-PAY-1102", error: "Raw webhook body is required" };
  }
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (typeof signature !== "string" || !signature.trim()) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1101", error: "Missing Lemon Squeezy X-Signature header" };
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!timingSafeHexEqual(expected, signature.trim())) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-PAY-1105", error: "Lemon Squeezy signature mismatch" };
  }
  return { ok: true, signatureStatus: "valid" };
}

function base64DecodeToString(value) {
  return Buffer.from(String(value ?? "").replace(/\s+/g, ""), "base64").toString("utf8");
}

function extractKeygenCertificate(licenseFile) {
  const raw = String(licenseFile ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    return { type: "license", json: JSON.parse(raw) };
  }
  const match = raw.match(/-----BEGIN (LICENSE|MACHINE) FILE-----\s*([\s\S]+?)\s*-----END \1 FILE-----/);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    json: JSON.parse(base64DecodeToString(match[2])),
  };
}

function keygenPublicKeyObject(publicKey) {
  const raw = String(publicKey ?? "").trim();
  if (!raw) return null;
  if (raw.includes("BEGIN PUBLIC KEY")) return crypto.createPublicKey(raw);
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  return crypto.createPublicKey({
    key: Buffer.from(`${KEYGEN_ED25519_SPKI_PREFIX}${raw}`, "hex"),
    format: "der",
    type: "spki",
  });
}

function pickMachineFingerprint(payload) {
  return (
    payload?.machineFingerprintHash ??
    payload?.machineFingerprint ??
    payload?.machine?.fingerprintHash ??
    payload?.machine?.fingerprint ??
    payload?.meta?.machineFingerprintHash ??
    payload?.meta?.machineFingerprint ??
    null
  );
}

function pickExpiry(payload) {
  return payload?.meta?.expiry ?? payload?.expiry ?? payload?.expiresAt ?? payload?.ttlExpiresAt ?? null;
}

function normalizeKeygenApiBaseUrl(baseUrl) {
  return String(baseUrl || "https://api.keygen.sh").trim().replace(/\/+$/, "");
}

export function buildKeygenApiUrl({ baseUrl = "https://api.keygen.sh", accountId, path }) {
  const account = encodeURIComponent(String(accountId ?? "").trim());
  if (!account) throw new Error("KEYGEN_ACCOUNT_ID is required");
  const normalizedPath = String(path ?? "").startsWith("/") ? String(path) : `/${path}`;
  return `${normalizeKeygenApiBaseUrl(baseUrl)}/v1/accounts/${account}${normalizedPath}`;
}

function keygenReadonlyPathAllowed(method, path) {
  const normalizedMethod = String(method ?? "GET").toUpperCase();
  const normalizedPath = String(path ?? "");
  if (DESTRUCTIVE_KEYGEN_ACTION_PATTERN.test(normalizedPath)) {
    return normalizedMethod === "GET" && normalizedPath.startsWith("/machines/");
  }
  return normalizedMethod === "GET" || (normalizedMethod === "POST" && /\/licenses\/[^/]+\/actions\/validate$/.test(normalizedPath));
}

function sanitizeKeygenError(message) {
  return String(message ?? "Keygen API request failed")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/key-[A-Za-z0-9._-]+/gi, "key-[REDACTED]");
}

function redactConfiguredSecrets(message, env) {
  let safe = sanitizeKeygenError(message);
  for (const secret of [
    env.KEYGEN_API_TOKEN,
    env.LEMON_SQUEEZY_API_KEY,
    env.LEMON_SQUEEZY_WEBHOOK_SECRET,
  ]) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}

function keygenHeaders(env, hasBody) {
  const headers = {
    Accept: "application/vnd.api+json",
    Authorization: `Bearer ${env.KEYGEN_API_TOKEN}`,
  };
  if (hasBody) headers["Content-Type"] = "application/vnd.api+json";
  return headers;
}

function normalizeLemonSqueezyLicenseApiBaseUrl(baseUrl) {
  return String(baseUrl || "https://api.lemonsqueezy.com").trim().replace(/\/+$/, "");
}

export function buildLemonSqueezyLicenseApiUrl({ baseUrl = "https://api.lemonsqueezy.com", path }) {
  const normalizedPath = String(path ?? "").startsWith("/") ? String(path) : `/${path}`;
  return `${normalizeLemonSqueezyLicenseApiBaseUrl(baseUrl)}${normalizedPath}`;
}

function sanitizeLemonSqueezyError(message) {
  return String(message ?? "Lemon Squeezy License API request failed")
    .replace(/license_key=[^&\s]+/gi, "license_key=[REDACTED]")
    .replace(/instance_id=[^&\s]+/gi, "instance_id=[REDACTED]");
}

function mapLemonSqueezyLicenseStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "active" || normalized === "inactive") return "active";
  if (normalized === "expired") return "expired";
  if (normalized === "disabled") return "revoked";
  return normalized || "unknown";
}

export async function lemonSqueezyLicenseApiRequest({
  env = process.env,
  fetchImpl = globalThis.fetch,
  path,
  form,
  timeoutMs = DEFAULT_LEMON_SQUEEZY_LICENSE_API_TIMEOUT_MS,
}) {
  const url = buildLemonSqueezyLicenseApiUrl({ baseUrl: env.LEMON_SQUEEZY_LICENSE_API_BASE_URL, path });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        faultCode: response.status >= 500 ? "CLWD-LIC-4001" : "CLWD-LIC-4002",
        error: sanitizeLemonSqueezyError(payload?.error ?? "Lemon Squeezy License API returned an error"),
        payload,
      };
    }
    return { ok: true, statusCode: response.status, payload, url };
  } catch (error) {
    return {
      ok: false,
      statusCode: 503,
      faultCode: "CLWD-LIC-4001",
      error: sanitizeLemonSqueezyError(error?.name === "AbortError" ? "Lemon Squeezy License API request timed out" : error?.message),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function activateLemonSqueezyLicenseKey({ env = process.env, fetchImpl, licenseKey, instanceName }) {
  const key = String(licenseKey ?? "").trim();
  const name = String(instanceName ?? "").trim();
  if (!key || !name) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-4002", error: "licenseKey and instanceName are required" };
  }
  const result = await lemonSqueezyLicenseApiRequest({
    env,
    fetchImpl,
    path: "/v1/licenses/activate",
    form: { license_key: key, instance_name: name },
  });
  if (!result.ok) return result;
  const activated = result.payload?.activated === true;
  const status = mapLemonSqueezyLicenseStatus(result.payload?.license_key?.status);
  return {
    ...result,
    ok: activated,
    statusCode: activated ? 200 : 409,
    activated,
    status,
    instanceId: result.payload?.instance?.id ?? null,
    licenseKeyId: result.payload?.license_key?.id ?? null,
    activationLimit: result.payload?.license_key?.activation_limit ?? null,
    activationUsage: result.payload?.license_key?.activation_usage ?? null,
    expiresAt: result.payload?.license_key?.expires_at ?? null,
    error: activated ? null : result.payload?.error ?? "Lemon Squeezy license activation failed",
  };
}

export async function validateLemonSqueezyLicenseKey({ env = process.env, fetchImpl, licenseKey, instanceId }) {
  const key = String(licenseKey ?? "").trim();
  const instance = String(instanceId ?? "").trim();
  if (!key || !instance) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-4002", error: "licenseKey and instanceId are required" };
  }
  const result = await lemonSqueezyLicenseApiRequest({
    env,
    fetchImpl,
    path: "/v1/licenses/validate",
    form: { license_key: key, instance_id: instance },
  });
  if (!result.ok) return result;
  const valid = result.payload?.valid === true;
  const status = mapLemonSqueezyLicenseStatus(result.payload?.license_key?.status);
  return {
    ...result,
    ok: valid && status === "active",
    statusCode: valid && status === "active" ? 200 : 426,
    valid,
    status,
    instanceId: result.payload?.instance?.id ?? instance,
    licenseKeyId: result.payload?.license_key?.id ?? null,
    activationLimit: result.payload?.license_key?.activation_limit ?? null,
    activationUsage: result.payload?.license_key?.activation_usage ?? null,
    expiresAt: result.payload?.license_key?.expires_at ?? null,
    error: valid ? null : result.payload?.error ?? "Lemon Squeezy license validation failed",
  };
}

export async function keygenApiRequest({
  env = process.env,
  fetchImpl = globalThis.fetch,
  method = "GET",
  path,
  body,
  timeoutMs = DEFAULT_KEYGEN_API_TIMEOUT_MS,
}) {
  if (!env.KEYGEN_API_TOKEN) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-LIC-9004", error: "Keygen API token is not configured" };
  }
  if (!keygenReadonlyPathAllowed(method, path)) {
    return { ok: false, statusCode: 405, faultCode: "CLWD-LIC-9005", error: "Keygen API request is not readonly" };
  }

  let url;
  try {
    url = buildKeygenApiUrl({ baseUrl: env.KEYGEN_API_BASE_URL, accountId: env.KEYGEN_ACCOUNT_ID, path });
  } catch (error) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-LIC-9006", error: redactConfiguredSecrets(error.message, env) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: keygenHeaders(env, Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        faultCode: response.status >= 500 ? "CLWD-LIC-3001" : "CLWD-LIC-3002",
        error: "Keygen API returned an error",
        payload,
      };
    }
    return { ok: true, statusCode: response.status, payload, url };
  } catch (error) {
    return {
      ok: false,
      statusCode: 503,
      faultCode: "CLWD-LIC-3001",
      error: redactConfiguredSecrets(error?.name === "AbortError" ? "Keygen API request timed out" : error?.message, env),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchKeygenLicense({ env = process.env, fetchImpl, licenseIdOrKey }) {
  const licenseId = encodeURIComponent(String(licenseIdOrKey ?? "").trim());
  if (!licenseId) return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-3002", error: "licenseIdOrKey is required" };
  return keygenApiRequest({ env, fetchImpl, method: "GET", path: `/licenses/${licenseId}` });
}

export async function fetchKeygenMachine({ env = process.env, fetchImpl, machineId }) {
  const id = encodeURIComponent(String(machineId ?? "").trim());
  if (!id) return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-3002", error: "machineId is required" };
  return keygenApiRequest({ env, fetchImpl, method: "GET", path: `/machines/${id}` });
}

function mapKeygenLicensePayload(payload) {
  const attributes = payload?.data?.attributes ?? {};
  const expiry = attributes.expiry ?? attributes.expiresAt ?? null;
  if (attributes.revoked === true || attributes.status === "REVOKED") return { status: "revoked", faultCode: "CLWD-LIC-3004" };
  if (attributes.suspended === true || attributes.status === "SUSPENDED") return { status: "suspended", faultCode: "CLWD-LIC-3004" };
  if (expiry && Date.parse(expiry) < Date.now()) return { status: "expired", faultCode: "CLWD-LIC-3002" };
  return { status: "active", faultCode: null };
}

function mapKeygenValidationPayload(payload) {
  const meta = payload?.meta ?? {};
  const code = String(meta.code ?? meta.constant ?? "").toUpperCase();
  const valid = meta.valid === true;
  if (valid) return { status: "active", onlineValidationStatus: "valid", keygenStatusCode: code || "VALID", machineMatched: true };
  if (code.includes("SUSPENDED") || code.includes("REVOKED")) {
    return { status: "revoked", onlineValidationStatus: "failed", keygenStatusCode: code || "REVOKED", faultCode: "CLWD-LIC-3004" };
  }
  if (code.includes("EXPIRED")) {
    return { status: "expired", onlineValidationStatus: "failed", keygenStatusCode: code || "EXPIRED", faultCode: "CLWD-LIC-3002" };
  }
  if (code.includes("MACHINE") || code.includes("FINGERPRINT") || code.includes("SCOPE")) {
    return { status: "tampered", onlineValidationStatus: "failed", keygenStatusCode: code || "MACHINE_MISMATCH", faultCode: "CLWD-LIC-3003", machineMatched: false };
  }
  return { status: "tampered", onlineValidationStatus: "failed", keygenStatusCode: code || "INVALID", faultCode: "CLWD-LIC-3002" };
}

export async function validateKeygenLicenseOnline({ env = process.env, fetchImpl, licenseIdOrKey, machineFingerprintHash }) {
  const license = await fetchKeygenLicense({ env, fetchImpl, licenseIdOrKey });
  if (!license.ok) {
    return { ...license, onlineValidationStatus: "unavailable" };
  }

  const licenseState = mapKeygenLicensePayload(license.payload);
  if (licenseState.status !== "active") {
    return {
      ok: false,
      statusCode: 426,
      onlineValidationStatus: "failed",
      keygenStatusCode: licenseState.status.toUpperCase(),
      faultCode: licenseState.faultCode,
      status: licenseState.status,
      revocationCheckedAt: new Date().toISOString(),
      license: license.payload,
    };
  }

  const validation = await keygenApiRequest({
    env,
    fetchImpl,
    method: "POST",
    path: `/licenses/${encodeURIComponent(String(licenseIdOrKey).trim())}/actions/validate`,
    body: {
      meta: {
        scope: machineFingerprintHash ? { fingerprint: machineFingerprintHash } : {},
      },
    },
  });
  if (!validation.ok) {
    return { ...validation, onlineValidationStatus: "unavailable", license: license.payload };
  }

  const mapped = mapKeygenValidationPayload(validation.payload);
  return {
    ok: mapped.onlineValidationStatus === "valid",
    statusCode: mapped.onlineValidationStatus === "valid" ? 200 : 426,
    ...mapped,
    revocationCheckedAt: new Date().toISOString(),
    license: license.payload,
    validation: validation.payload,
  };
}

export function verifyKeygenLicenseFile({
  licenseFile,
  publicKey,
  expectedMachineFingerprintHash,
  now = new Date(),
  expectedAlgorithm = "base64+ed25519",
}) {
  let certificate;
  try {
    certificate = extractKeygenCertificate(licenseFile);
  } catch {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-2001", error: "Invalid Keygen license file JSON" };
  }
  if (!certificate?.json) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-2002", error: "Invalid Keygen license file certificate" };
  }

  const { alg, enc, sig } = certificate.json;
  if (alg !== expectedAlgorithm) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-2003", error: "Unsupported Keygen license file algorithm" };
  }
  if (!enc || !sig) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-2004", error: "Keygen license file is missing enc or sig" };
  }

  let keyObject;
  try {
    keyObject = keygenPublicKeyObject(publicKey);
  } catch {
    return { ok: false, statusCode: 503, faultCode: "CLWD-LIC-9003", error: "Invalid Keygen signing public key" };
  }
  if (!keyObject) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-LIC-9001", error: "Keygen signing public key is not configured" };
  }

  const signature = Buffer.from(String(sig), "base64");
  const signedPayload = Buffer.from(`${certificate.type}/${enc}`, "utf8");
  const signatureValid = crypto.verify(null, signedPayload, keyObject, signature);
  if (!signatureValid) {
    return { ok: false, statusCode: 401, faultCode: "CLWD-LIC-1001", error: "Keygen license file signature mismatch" };
  }

  let payload;
  try {
    payload = JSON.parse(base64DecodeToString(enc));
  } catch {
    return { ok: false, statusCode: 400, faultCode: "CLWD-LIC-2005", error: "Keygen license file payload is not valid JSON" };
  }

  const expiry = pickExpiry(payload);
  if (expiry && Date.parse(expiry) < now.getTime()) {
    return { ok: false, statusCode: 426, faultCode: "CLWD-LIC-2006", error: "Keygen license file is expired" };
  }

  const fileMachineFingerprint = pickMachineFingerprint(payload);
  const machineMatched =
    !expectedMachineFingerprintHash ||
    !fileMachineFingerprint ||
    fileMachineFingerprint === expectedMachineFingerprintHash;
  if (!machineMatched) {
    return {
      ok: false,
      statusCode: 426,
      faultCode: "CLWD-LIC-1002",
      error: "Keygen license file machine fingerprint mismatch",
      signatureStatus: "valid",
      machineMatched: false,
    };
  }

  return {
    ok: true,
    statusCode: 200,
    signatureStatus: "valid",
    machineMatched,
    type: certificate.type,
    payload,
  };
}

function notConfiguredError(service, envSummary) {
  const missing = envSummary.missing.join(", ");
  return {
    ok: false,
    statusCode: 503,
    faultCode: "CLWD-BE-9001",
    error: `${service} production adapter is not configured`,
    missingEnv: envSummary.missing,
    detail: missing ? `Missing env: ${missing}` : "Production credentials are present but implementation is not connected yet",
  };
}

export function createProductionAdapters({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const envSummary = summarizeProductionEnv(env);
  const readiness = {
    ready: envSummary.ready,
    productionEnv: envSummary,
    warnings: envSummary.ready
      ? ["production credentials are present; live API calls are still scaffolded"]
      : ["production credentials are incomplete"],
  };

  return {
    mode: "production",
    readiness,
    paddle: {
      verifyWebhookSignature({ rawBody, signatureHeader } = {}) {
        void rawBody;
        void signatureHeader;
        return { ok: false, statusCode: 410, faultCode: "CLWD-PAY-0001", error: "Paddle payment channel is disabled" };
      },
      mapWebhookEvent: mapPaddleEventToLicenseMutation,
    },
    lemonSqueezy: {
      verifyWebhookSignature({ rawBody, signatureHeader } = {}) {
        if (!envSummary.ready) return notConfiguredError("Lemon Squeezy", envSummary);
        return verifyLemonSqueezySignature({
          rawBody,
          signatureHeader,
          secret: env.LEMON_SQUEEZY_WEBHOOK_SECRET,
        });
      },
      mapWebhookEvent: mapLemonSqueezyEventToLicenseMutation,
      activateLicenseKey({ licenseKey, instanceName } = {}) {
        return activateLemonSqueezyLicenseKey({ env, fetchImpl, licenseKey, instanceName });
      },
      validateLicenseKey({ licenseKey, instanceId } = {}) {
        return validateLemonSqueezyLicenseKey({ env, fetchImpl, licenseKey, instanceId });
      },
    },
    keygen: {
      mapWebhookEvent: mapKeygenEventToLicenseMutation,
      async validateOfflineTicket({ licenseFile, machineFingerprintHash, onlineValidation = false, licenseIdOrKey } = {}) {
        if (!envSummary.ready) return notConfiguredError("Keygen", envSummary);
        const offline = verifyKeygenLicenseFile({
          licenseFile,
          publicKey: env.KEYGEN_SIGNING_PUBLIC_KEY,
          expectedMachineFingerprintHash: machineFingerprintHash,
        });
        if (!offline.ok) return offline;
        if (!onlineValidation) {
          return { ...offline, onlineValidationStatus: "skipped" };
        }

        const online = await validateKeygenLicenseOnline({
          env,
          fetchImpl,
          licenseIdOrKey: licenseIdOrKey ?? offline.payload?.id ?? offline.payload?.key ?? offline.payload?.licenseId,
          machineFingerprintHash,
        });
        if (!online.ok && online.onlineValidationStatus === "unavailable") {
          return {
            ...offline,
            status: "offline-grace",
            onlineValidationStatus: "unavailable",
            keygenStatusCode: online.faultCode,
            offlineGrace: true,
          };
        }
        if (!online.ok) return online;
        return { ...offline, ...online, payload: { ...offline.payload, online: online.validation ?? online.license } };
      },
      fetchLicense({ licenseIdOrKey } = {}) {
        return fetchKeygenLicense({ env, fetchImpl, licenseIdOrKey });
      },
      validateOnline({ licenseIdOrKey, machineFingerprintHash } = {}) {
        return validateKeygenLicenseOnline({ env, fetchImpl, licenseIdOrKey, machineFingerprintHash });
      },
      fetchMachine({ machineId } = {}) {
        return fetchKeygenMachine({ env, fetchImpl, machineId });
      },
    },
    identity: {
      ssoProviders() {
        return [
          { id: "apple", name: "Apple ID", singleSignOn: true },
          { id: "google", name: "Google", singleSignOn: true },
          { id: "microsoft", name: "Microsoft", singleSignOn: true },
          { id: "enterprise", name: "SAML/OIDC SSO", singleSignOn: true },
        ];
      },
      validateOidcCallback() {
        if (!envSummary.ready) return notConfiguredError("OIDC", envSummary);
        return {
          ok: false,
          statusCode: 501,
          faultCode: "CLWD-SSO-9002",
          error: "OIDC production callback validation is scaffolded but not enabled",
        };
      },
    },
  };
}
