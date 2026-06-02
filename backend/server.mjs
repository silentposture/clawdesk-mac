import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import {
  BACKEND_CONTRACT,
  createBackendHealthPayload,
} from "./contracts.mjs";
import { createBackendAdapters } from "./adapters/index.mjs";

const port = Number(process.env.CLAWDESK_BACKEND_PORT ?? 19090);
const host = "127.0.0.1";
const hmacSecret = process.env.CLAWDESK_LICENSE_HMAC_KEY ?? "change-me-please";
const envStateFile = process.env.CLAWDESK_BACKEND_STATE_FILE ?? "";
const stateFilePath = envStateFile
  ? path.resolve(envStateFile)
  : path.resolve(process.cwd(), ".clawdesk-backend", "state.json");
const devBypassEmail = process.env.CLAWDESK_DEV_BYPASS_EMAIL;
const devBypassPassword = process.env.CLAWDESK_DEV_BYPASS_PASSWORD ?? "";
const baseUrl = `http://${host}:${port}`;
const adapters = createBackendAdapters({ env: process.env });
const nowIso = () => new Date().toISOString();
const OWNER_EMAIL = "huangkuoling@gmail.com";
const NAVIA_SESSION_COOKIE_NAME = "__Host-navia_session";
const NAVIA_PUBLIC_KEY_ID = "naviaworks-p256-2026";
const naviaCertificateKeyPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const naviaPublicKeyPem = naviaCertificateKeyPair.publicKey.export({ type: "spki", format: "pem" });

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sign(payload) {
  return crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function redact(value) {
  if (typeof value !== "string") return value;
  if (value.includes("@")) return `hash:${hash(value).slice(0, 16)}`;
  if (value.startsWith("sk-")) return `hash:${hash(value).slice(0, 12)}`;
  return value;
}

function auditTrail(action, detail) {
  const safeDetail = Array.isArray(detail) ? detail : { ...detail };
  if (safeDetail.email) safeDetail.email = redact(safeDetail.email);
  if (safeDetail.accountEmail) safeDetail.accountEmail = redact(safeDetail.accountEmail);
  if (safeDetail.apiKey) safeDetail.apiKey = redact(safeDetail.apiKey);
  if (safeDetail.code) safeDetail.code = "redacted";
  state.audit.unshift({
    id: randomId("aud"),
    at: nowIso(),
    action,
    detail: safeDetail,
  });
  if (state.audit.length > 250) state.audit.length = 250;
}

function fingerprint() {
  const cpus = os.cpus();
  const raw = `${os.platform()}|${os.arch()}|${os.hostname()}|${cpus[0]?.model ?? "unknown"}|${cpus.length}`;
  return {
    fingerprintHash: hash(raw),
    hardwareSources: ["platform", "arch", "hostname", "cpu-model", "cpu-count"],
    platform: os.platform(),
    confidence: 0.85,
    createdAt: nowIso(),
  };
}

function supportUntil(plan, issuedAt) {
  const base = new Date(issuedAt);
  if (plan === "lifetime-local") {
    base.setUTCMonth(base.getUTCMonth() + 12);
    return base.toISOString();
  }
  if (plan === "pro-yearly") {
    base.setUTCFullYear(base.getUTCFullYear() + 1);
    return base.toISOString();
  }
  if (plan === "pro-monthly") {
    base.setUTCMonth(base.getUTCMonth() + 1);
    return base.toISOString();
  }
  return null;
}

const seedLicenses = {
  "CLWD-HOBBY-OPEN-CLAW-0000": {
    keyId: "k-lcl-hobby-0",
    plan: "hobby",
    status: "free",
    deviceLimit: 1,
    supportUpdatesUntil: null,
    expiresAt: null,
    features: ["chat", "chat-history", "permissions"],
  },
  "CLWD-PRO-MONTHLY-2026-DEV": {
    keyId: "k-lcl-pro-m01",
    plan: "pro-monthly",
    status: "active",
    deviceLimit: 3,
    supportUpdatesUntil: supportUntil("pro-monthly", new Date().toISOString()),
    expiresAt: supportUntil("pro-monthly", new Date().toISOString()),
    features: ["chat", "permission-advanced", "workflows", "agents", "diagnostics-basic", "updates"],
  },
  "CLWD-PRO-YEARLY-2026-DEV": {
    keyId: "k-lcl-pro-y01",
    plan: "pro-yearly",
    status: "active",
    deviceLimit: 3,
    supportUpdatesUntil: supportUntil("pro-yearly", new Date().toISOString()),
    expiresAt: supportUntil("pro-yearly", new Date().toISOString()),
    features: ["chat", "permission-advanced", "workflows", "agents", "diagnostics", "ergo", "updates"],
  },
  "CLWD-LIFETIME-LOCAL-2026": {
    keyId: "k-lcl-lf-01",
    plan: "lifetime-local",
    status: "active",
    deviceLimit: 3,
    supportUpdatesUntil: supportUntil("lifetime-local", new Date().toISOString()),
    expiresAt: null,
    features: ["chat", "permission-advanced", "workflows", "agents", "diagnostics", "ergo", "updates", "local-only"],
  },
};

const defaultState = {
  accounts: [],
  sessions: [],
  verificationTokens: [],
  passwordResetTokens: [],
  notificationOutbox: [],
  entitlements: [],
  naviaLicenses: [],
  webhookEvents: [],
  paymentEvents: [],
  machines: [],
  licenses: [],
  licenseEvents: [],
  webhooks: [],
  diagnostics: [],
  audit: [],
  mcpGrants: [],
  mcpAudit: [],
  microsoftOAuth: [],
  updates: {
    latestVersion: "0.5.1",
    releaseNotes: [
      "新增後端模擬授權服務。",
      "補強機器綁定與簽章授權驗證。",
      "加入開發者繞過與 webhook 驗證事件追蹤。",
    ],
  },
  createdAt: nowIso(),
};

let state = structuredClone(defaultState);

const backendMcpConnectors = [
  {
    id: "microsoft-office",
    name: "Microsoft 365 文書工具",
    vendor: "Microsoft",
    tier: "business",
    status: "available",
    protocols: [{ id: "microsoft-graph", name: "Microsoft Graph API", auth: "OAuth 2.0", transport: "https" }],
    scopes: ["Files.Read", "Files.ReadWrite", "Mail.ReadWrite", "Calendars.Read", "Teams.ReadBasic.All"],
  },
  {
    id: "google-workspace",
    name: "Google Workspace",
    vendor: "Google",
    tier: "business",
    status: "available",
    protocols: [{ id: "google-workspace-apis", name: "Google Workspace APIs", auth: "OAuth 2.0", transport: "https" }],
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  {
    id: "developer-tools",
    name: "GitHub / Terminal / Developer Tools",
    vendor: "Developer",
    tier: "engineering",
    status: "available",
    protocols: [{ id: "github-mcp", name: "GitHub MCP / REST", auth: "OAuth 2.0", transport: "https" }],
    scopes: ["repo:read", "issues:read", "actions:read", "terminal.plan", "workspace.read"],
  },
  {
    id: "cloud-services",
    name: "Cloud Services",
    vendor: "Cloud",
    tier: "engineering",
    status: "available",
    protocols: [{ id: "cloud-provider-apis", name: "Cloud Provider APIs", auth: "OAuth 2.0 / service token", transport: "https" }],
    scopes: ["aws.readonly", "azure.readonly", "gcp.readonly", "cloudflare.dns.read", "vercel.read", "supabase.read"],
  },
];

function hashPassword(password) {
  return hash(`${password}|clawdesk`);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isOwnerEmail(email) {
  return normalizeEmail(email) === OWNER_EMAIL;
}

function hashToken(token) {
  return hash(`navia-token|${token}`);
}

function canonicalPlanKeyFromSeedPlan(plan) {
  switch (String(plan ?? "").trim().toLowerCase()) {
    case "free":
    case "hobby":
      return "clawdesk.free";
    case "pro-monthly":
      return "clawdesk.subscription.monthly.1dev";
    case "pro-yearly":
      return "clawdesk.subscription.yearly.2dev";
    case "lifetime-local":
      return "clawdesk.lifetime_updates_1y_1dev";
    default:
      return "clawdesk.free";
  }
}

function normalizePlanKey(planKey) {
  switch (String(planKey ?? "").trim().toLowerCase()) {
    case "clawdesk.free":
    case "free":
    case "hobby":
      return "clawdesk.free";
    case "clawdesk.subscription.monthly.1dev":
    case "subscription_30d_1dev":
    case "sub_30d_1dev":
    case "clawdesk_sub_30d_1dev":
    case "clawdesk.subscription.monthly":
      return "clawdesk.subscription.monthly.1dev";
    case "clawdesk.subscription.yearly.2dev":
    case "subscription_365d_2dev":
    case "sub_365d_2dev":
    case "clawdesk_sub_365d_2dev":
      return "clawdesk.subscription.yearly.2dev";
    case "clawdesk.lifetime_updates_1y_1dev":
    case "perpetual_updates_1y_1dev":
    case "clawdesk_perpetual_updates_1y_1dev":
      return "clawdesk.lifetime_updates_1y_1dev";
    case "clawdesk.lifetime_updates_1y_2dev":
    case "perpetual_updates_1y_2dev":
    case "clawdesk_perpetual_updates_1y_2dev":
      return "clawdesk.lifetime_updates_1y_2dev";
    default:
      return String(planKey ?? "").trim() || "clawdesk.free";
  }
}

function licenseTypeFromPlanKey(planKey) {
  const normalized = normalizePlanKey(planKey);
  if (normalized.includes("subscription.monthly")) return "subscription";
  if (normalized.includes("subscription.yearly")) return "subscription";
  if (normalized.includes("lifetime_updates_1y")) return "perpetual_with_updates_1y";
  return "free";
}

function maxDevicesFromPlanKey(planKey) {
  const normalized = normalizePlanKey(planKey);
  if (normalized.endsWith(".2dev") || normalized.endsWith("_2dev")) return 2;
  return 1;
}

function featuresFromPlanKey(planKey) {
  const normalized = normalizePlanKey(planKey);
  if (normalized === "clawdesk.free") return ["clawdesk.public", "clawdesk.free"];
  if (normalized.includes("subscription.monthly")) return ["clawdesk.core", "clawdesk.paid", "clawdesk.subscription", "clawdesk.monthly"];
  if (normalized.includes("subscription.yearly")) return ["clawdesk.core", "clawdesk.paid", "clawdesk.subscription", "clawdesk.yearly"];
  if (normalized.includes("lifetime_updates_1y")) return ["clawdesk.core", "clawdesk.paid", "clawdesk.lifetime", "clawdesk.updates.1y"];
  if (normalized === "clawdesk.owner.admin") return ["owner", "admin", "full-feature"];
  return ["clawdesk.core"];
}

function normalizeDateTimeOffsetString(value) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?((?:Z)|(?:[+-]\d{2}:\d{2}))$/);
  if (!match) return text;
  const fraction = (match[2] ?? "").padEnd(7, "0");
  const offset = match[3] === "Z" ? "+00:00" : match[3];
  return `${match[1]}.${fraction}${offset}`;
}

function canonicalizeNaviaPayload(payload) {
  const normalized = {
    licenseId: payload.licenseId,
    planType: payload.planType,
    subjectEmailHash: payload.subjectEmailHash,
    hwidHash: payload.hwidHash,
    issuedAtUtc: normalizeDateTimeOffsetString(payload.issuedAtUtc),
    expiresAtUtc: normalizeDateTimeOffsetString(payload.expiresAtUtc),
    orderNo: payload.orderNo,
    nonce: payload.nonce,
    version: payload.version,
    productKey: payload.productKey ?? "clawdesk",
    planKey: payload.planKey ?? "clawdesk.free",
    licenseType: payload.licenseType ?? payload.planType ?? "free",
    features: Array.isArray(payload.features) ? payload.features : [],
    maxDevices: Number(payload.maxDevices ?? 1) > 0 ? Number(payload.maxDevices) : 1,
    updatesUntilUtc: payload.updatesUntilUtc ? normalizeDateTimeOffsetString(payload.updatesUntilUtc) : null,
    graceUntilUtc: payload.graceUntilUtc ? normalizeDateTimeOffsetString(payload.graceUntilUtc) : null,
    accountIdHash: payload.accountIdHash ?? "",
    machineBindingHash: payload.machineBindingHash ?? "",
    keyVersion: payload.keyVersion ?? NAVIA_PUBLIC_KEY_ID,
  };
  return JSON.stringify(normalized)
    .replace(/\+/g, "\\u002B")
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026");
}

function signNaviaPayload(payload) {
  const signer = crypto.createSign("SHA256");
  signer.update(canonicalizeNaviaPayload(payload));
  signer.end();
  return signer.sign(naviaCertificateKeyPair.privateKey).toString("base64");
}

function buildNaviaPublicKeyRing() {
  return {
    algorithm: "ECDSA_P256_SHA256",
    activeKeyId: NAVIA_PUBLIC_KEY_ID,
    keys: [
      {
        keyId: NAVIA_PUBLIC_KEY_ID,
        algorithm: "ECDSA_P256_SHA256",
        active: true,
        publicKeyPem: naviaPublicKeyPem,
      },
    ],
  };
}

function verifyNaviaPayloadSignature(payload, signatureBase64) {
  const verifier = crypto.createVerify("SHA256");
  verifier.update(canonicalizeNaviaPayload(payload));
  verifier.end();
  return verifier.verify(naviaCertificateKeyPair.publicKey, Buffer.from(String(signatureBase64 ?? ""), "base64"));
}

function issueNaviaCertificate(record) {
  const payload = {
    licenseId: record.licenseId,
    planType: record.licenseType,
    subjectEmailHash: record.subjectEmailHash,
    hwidHash: record.hwidHash,
    issuedAtUtc: record.issuedAtUtc,
    expiresAtUtc: record.expiresAtUtc,
    orderNo: record.orderNo,
    nonce: record.nonce,
    version: 2,
    productKey: record.productKey,
    planKey: record.planKey,
    licenseType: record.licenseType,
    features: record.features,
    maxDevices: record.maxDevices,
    updatesUntilUtc: record.updatesUntilUtc,
    graceUntilUtc: record.graceUntilUtc,
    accountIdHash: record.accountIdHash,
    machineBindingHash: record.machineBindingHash,
    keyVersion: NAVIA_PUBLIC_KEY_ID,
  };
  return JSON.stringify({
    payload,
    signature: signNaviaPayload(payload),
    keyId: NAVIA_PUBLIC_KEY_ID,
  });
}

function parseNaviaCertificate(certificateJson) {
  const envelope = JSON.parse(String(certificateJson ?? "{}"));
  const payload = envelope?.payload ?? {};
  return {
    payload,
    signature: String(envelope?.signature ?? ""),
    keyId: String(envelope?.keyId ?? ""),
  };
}

function issueStoredToken(targetCollection, email, prefix, ttlMinutes, extra = {}) {
  const token = randomId(prefix);
  const tokenHash = hashToken(token);
  const record = {
    email,
    tokenHash,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    usedAt: null,
    ...extra,
  };
  state[targetCollection] = state[targetCollection].filter((item) => item.email !== email);
  state[targetCollection].unshift(record);
  return token;
}

function consumeStoredToken(targetCollection, email, token) {
  const tokenHash = hashToken(token);
  const record = state[targetCollection].find((item) => item.email === email && item.tokenHash === tokenHash);
  if (!record || record.usedAt || new Date(record.expiresAt) <= new Date()) return null;
  record.usedAt = nowIso();
  return record;
}

function consumeStoredTokenByValue(targetCollection, token) {
  const tokenHash = hashToken(token);
  const record = state[targetCollection].find((item) => item.tokenHash === tokenHash);
  if (!record || record.usedAt || new Date(record.expiresAt) <= new Date()) return null;
  record.usedAt = nowIso();
  return record;
}

function queueNotification(type, email, payload = {}) {
  state.notificationOutbox.unshift({
    id: randomId("outbox"),
    type,
    email,
    payload,
    status: "queued",
    createdAt: nowIso(),
  });
  if (state.notificationOutbox.length > 1000) state.notificationOutbox.length = 1000;
}

function readAuthToken(req, parsed) {
  const authHeader = req.headers.authorization || parsed?.searchParams?.get("token") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : String(authHeader);
}

function accountPublicShape(account) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    mode: account.mode,
    organization: account.organization,
    status: account.status ?? (account.emailVerified ? "active" : "pending_email_verification"),
    emailVerified: account.emailVerified === true,
    emailVerificationPending: account.emailVerificationPending === true,
  };
}

function createNaviaLicenseRecord({ email, productKey, orderNo, hwid, instanceId, appVersion, seed }) {
  const planKey = normalizePlanKey(canonicalPlanKeyFromSeedPlan(seed.plan));
  const licenseType = licenseTypeFromPlanKey(planKey);
  const issuedAtUtc = nowIso();
  const maxDevices = maxDevicesFromPlanKey(planKey);
  const updatesUntilUtc = seed.supportUpdatesUntil ? new Date(seed.supportUpdatesUntil).toISOString() : null;
  const expiresAtUtc = seed.expiresAt
    ? new Date(seed.expiresAt).toISOString()
    : licenseType === "perpetual_with_updates_1y"
      ? "2126-01-01T00:00:00.0000000+00:00"
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const graceUntilUtc = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    licenseId: randomId("navlic"),
    accountEmail: email,
    productKey,
    planKey,
    licenseType,
    features: featuresFromPlanKey(planKey),
    maxDevices,
    updatesUntilUtc,
    graceUntilUtc,
    expiresAtUtc,
    issuedAtUtc,
    orderNo,
    hwid,
    hwidHash: hash(hwid),
    instanceId,
    machineBindingHash: hash(`${hwid}|${instanceId}|${productKey}`),
    accountIdHash: hash(email),
    subjectEmailHash: hash(email),
    nonce: randomId("nonce"),
    appVersion,
    keyVersion: NAVIA_PUBLIC_KEY_ID,
    status: seed.status,
  };
}

function naviaValidateEnvelopeFromRecord(record, appReleaseDateUtc) {
  const nowMs = Date.now();
  const expiresMs = Date.parse(record.expiresAtUtc);
  const graceMs = record.graceUntilUtc ? Date.parse(record.graceUntilUtc) : Number.NaN;
  const releaseMs = appReleaseDateUtc ? Date.parse(appReleaseDateUtc) : Number.NaN;
  const updatesMs = record.updatesUntilUtc ? Date.parse(record.updatesUntilUtc) : Number.NaN;
  const expired = Number.isFinite(expiresMs) && expiresMs <= nowMs;
  const withinGrace = expired && Number.isFinite(graceMs) && graceMs > nowMs;
  const updatesAllowed = !Number.isFinite(releaseMs) || !Number.isFinite(updatesMs) || releaseMs <= updatesMs;
  return {
    active: !expired || withinGrace,
    message: !updatesAllowed ? "release_after_updates_until" : withinGrace ? "within_grace" : "validated",
    licenseId: record.licenseId,
    productKey: record.productKey,
    planKey: record.planKey,
    licenseType: record.licenseType,
    features: record.features,
    revoked: record.status === "revoked",
    expired,
    withinGrace,
    hwidMatched: true,
    instanceMatched: true,
    machineBindingMatched: true,
    updatesAllowed,
    productMatched: true,
    expiresAtUtc: record.expiresAtUtc,
    updatesUntilUtc: record.updatesUntilUtc,
    graceUntilUtc: record.graceUntilUtc,
    maxDevices: record.maxDevices,
    activeDeviceCount: 1,
  };
}

function readBody(req) {
  return readBodyWithRaw(req).then(({ body }) => body);
}

function readBodyWithRaw(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolve({ body: {}, rawBody: "" });
        return;
      }
      try {
        resolve({ body: JSON.parse(data), rawBody: data });
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function accountByEmail(email) {
  return state.accounts.find((item) => item.email === email);
}

function accountBySessionToken(token) {
  const session = readSession(token);
  if (!session) return null;
  return state.accounts.find((item) => item.id === session.accountId) ?? null;
}

function createSession(accountId, ip = "127.0.0.1") {
  const token = `tk_${randomId("sess").replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const session = {
    id: randomId("session"),
    accountId,
    token,
    ip,
    issuedAt: nowIso(),
    expiresAt,
  };
  state.sessions = state.sessions.filter((item) => item.accountId !== accountId || new Date(item.expiresAt) <= new Date());
  state.sessions.unshift(session);
  if (state.sessions.length > 1000) state.sessions.length = 1000;
  return session;
}

function readSession(token) {
  const session = state.sessions.find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  const account = state.accounts.find((item) => item.id === session.accountId);
  if (!account) return null;
  return {
    ...session,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    mode: account.mode,
    organization: account.organization,
    status: account.status ?? (account.emailVerified ? "active" : "pending_email_verification"),
    cookieName: NAVIA_SESSION_COOKIE_NAME,
  };
}

function ownerEntitlementFor(email) {
  return {
    accountEmail: email,
    productKey: "clawdesk",
    planKey: "clawdesk.owner.admin",
    status: "active",
    expiresAtUtc: null,
    updatesUntilUtc: null,
    features: featuresFromPlanKey("clawdesk.owner.admin"),
    maxDevices: 99,
    source: "owner-rule",
  };
}

function upsertEntitlement(record) {
  const entitlement = {
    productKey: "clawdesk",
    status: "active",
    expiresAtUtc: null,
    updatesUntilUtc: null,
    features: [],
    maxDevices: 1,
    source: "simulator",
    ...record,
  };
  const index = state.entitlements.findIndex(
    (item) => item.accountEmail === entitlement.accountEmail && item.productKey === entitlement.productKey,
  );
  if (index >= 0) state.entitlements[index] = { ...state.entitlements[index], ...entitlement };
  else state.entitlements.unshift(entitlement);
  return entitlement;
}

function entitlementsForAccount(account) {
  if (!account) return [];
  if (isOwnerEmail(account.email)) {
    return [ownerEntitlementFor(account.email)];
  }
  return state.entitlements.filter((item) => item.accountEmail === account.email);
}

function licensePayload(licenseKey, machineFingerprintHash, lemonSqueezyInstanceId = null) {
  const seed = seedLicenses[licenseKey];
  if (!seed) return null;
  const issuedAt = nowIso();
  return {
    keyId: randomId("key"),
    encodedKey: licenseKey,
    signatureStatus: "valid",
    payloadHash: hash(`${seed.keyId}|${licenseKey}|${issuedAt}`),
    plan: seed.plan,
    status: seed.status,
    supportUpdatesUntil: seed.supportUpdatesUntil,
    expiresAt: seed.expiresAt,
    deviceLimit: seed.deviceLimit,
    issuedAt,
    features: seed.features,
    machineFingerprintHash,
    lemonSqueezyInstanceId,
  };
}

function normalizeLemonSqueezyPlan(input) {
  const value = String(input ?? "").trim().toLowerCase();
  if (value.includes("monthly") || value.includes("month")) return "pro-monthly";
  if (value.includes("yearly") || value.includes("annual") || value.includes("year")) return "pro-yearly";
  if (value.includes("maintenance") || value.includes("update")) return "lifetime-local";
  if (value.includes("early") || value.includes("lifetime") || value.includes("one-time")) return "lifetime-local";
  return "pro-yearly";
}

function createLemonSqueezyLicenseKey({ orderId, subscriptionId, licenseKey } = {}) {
  const explicit = String(licenseKey ?? "").trim().toUpperCase();
  if (explicit) return explicit;
  const seed = String(orderId ?? subscriptionId ?? randomId("ls")).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const padded = `${seed}00000000000000000000`.slice(0, 20);
  return `CLWD-${padded.slice(0, 5)}-${padded.slice(5, 10)}-${padded.slice(10, 15)}-${padded.slice(15, 20)}`;
}

function ensureLemonSqueezySeedLicense({ licenseKey, plan, status = "active" }) {
  const normalizedPlan = normalizeLemonSqueezyPlan(plan);
  seedLicenses[licenseKey] = {
    keyId: `k-ls-${hash(licenseKey).slice(0, 10)}`,
    plan: normalizedPlan,
    status,
    deviceLimit: 3,
    supportUpdatesUntil: supportUntil(normalizedPlan, new Date().toISOString()),
    expiresAt: normalizedPlan === "lifetime-local" ? null : supportUntil(normalizedPlan, new Date().toISOString()),
    features: ["chat", "permission-advanced", "workflows", "agents", "diagnostics", "updates", "lemon-squeezy-payment"],
  };
  return seedLicenses[licenseKey];
}

function issueSignedTicket(payload) {
  const body = JSON.stringify(payload);
  const signature = sign(body);
  return {
    payload,
    signature,
    token: `${payload.keyId}.${Buffer.from(body).toString("base64url")}.${signature}`,
    issuedAt: nowIso(),
  };
}

function parseTicket(rawToken) {
  if (typeof rawToken !== "string") return null;
  const parts = rawToken.split(".");
  if (parts.length !== 3) return null;
  const [keyId, encoded, signature] = parts;
  try {
    const body = Buffer.from(encoded, "base64url").toString("utf8");
    const payload = JSON.parse(body);
    const expected = sign(body);
    return {
      keyId,
      payload,
      signature,
      signatureMatch: expected === signature,
      rawBody: body,
    };
  } catch {
    return null;
  }
}

function updateBoundMachine(licenseKey, machineFingerprintHash) {
  const existing = state.machines.find(
    (item) => item.licenseKey === licenseKey && item.machineFingerprintHash === machineFingerprintHash,
  );
  if (existing) return existing;
  const machine = {
    id: randomId("m"),
    licenseKey,
    machineFingerprintHash,
    activatedAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  state.machines.unshift(machine);
  if (state.machines.length > 1000) state.machines.length = 1000;
  return machine;
};

function getSeedFromTicketPayload(payload) {
  return state.licenses.find((item) => item.payload.encodedKey === payload.encodedKey);
}

function licenseStatusFromPayload(payload, machineFingerprintHash) {
  const now = Date.now();
  const updatesExpired = payload.supportUpdatesUntil && new Date(payload.supportUpdatesUntil).getTime() < now;
  const expired = payload.expiresAt && new Date(payload.expiresAt).getTime() < now;
  const canonicalPlanKey = normalizePlanKey(canonicalPlanKeyFromSeedPlan(payload.plan));
  const status = expired ? "expired" : payload.status;
  return {
    plan: payload.plan,
    canonicalPlanKey,
    productKey: "clawdesk",
    paymentProvider: "lemon-squeezy",
    licenseProvider: "keygen",
    commerceProvider: "lemon-squeezy",
    entitlementAuthority: "universal-server",
    status,
    seats: payload.deviceLimit ?? 1,
    supportUpdatesUntil: payload.supportUpdatesUntil,
    updatesUntilUtc: payload.supportUpdatesUntil ? new Date(payload.supportUpdatesUntil).toISOString() : null,
    offlineGraceUntil: null,
    graceUntilUtc: null,
    features: payload.features ?? [],
    tampered: false,
    supportExpired: updatesExpired,
    latestVersion: state.updates.latestVersion,
    eligibleLatestVersion: updatesExpired ? "0.4.9" : state.updates.latestVersion,
    machineMatched: payload.machineFingerprintHash === machineFingerprintHash,
    activeDeviceCount: payload.machineFingerprintHash ? 1 : 0,
  };
}

function backendReleaseManifest() {
  const releases = [
    {
      version: state.updates.latestVersion,
      releasedAt: "2026-12-31T23:59:59.999Z",
      notes: state.updates.releaseNotes,
    },
    {
      version: "0.5.0",
      releasedAt: "2026-05-10T00:00:00.000Z",
      notes: ["Chat + backend simulator integration"],
    },
    {
      version: "0.4.9",
      releasedAt: "2026-05-01T00:00:00.000Z",
      notes: ["Path governance and diagnostics privacy"],
    },
  ];
  return {
    product: "ClawDesk",
    channel: "stable",
    currentVersion: "0.5.0",
    latestVersion: releases[0].version,
    generatedAt: nowIso(),
    policy: {
      supportUpdatesUntilField: "license.supportUpdatesUntil",
      eligibilityRule: "releasedAt <= supportUpdatesUntil",
      autoUpdate: false,
      tauriUpdaterFuture: true,
    },
    releases: releases.map((release) => ({
      ...release,
      minSupportUpdatesUntil: release.releasedAt,
      releaseNotes: release.notes.join("\n"),
      downloads: {
        macosAppleSilicon: `https://downloads.clawdesk.example/macos/arm64/ClawDesk-${release.version}-arm64.dmg`,
        macosUniversal: `https://downloads.clawdesk.example/macos/universal/ClawDesk-${release.version}-universal.dmg`,
      },
      sha256: `mock-sha256-${release.version.replaceAll(".", "-")}`,
    })),
  };
}

function updateEligibilityForSupport(supportUpdatesUntil) {
  const manifest = backendReleaseManifest();
  const supportTime = Date.parse(supportUpdatesUntil ?? "");
  const eligible = manifest.releases.find((release) => Number.isFinite(supportTime) && supportTime >= Date.parse(release.releasedAt)) ?? manifest.releases[manifest.releases.length - 1];
  return {
    manifest,
    eligible,
    latest: manifest.releases[0],
    canInstallLatest: eligible.version === manifest.releases[0].version,
  };
}

const MICROSOFT_GRAPH_DEFAULT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Files.Read",
  "Files.ReadWrite",
  "Mail.ReadWrite",
  "Calendars.Read",
];

function microsoftGraphConfig() {
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID || "common";
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID || "";
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET || "";
  const redirectUri = process.env.MICROSOFT_GRAPH_REDIRECT_URI || "";
  const configured = Boolean(clientId && clientSecret && redirectUri);
  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    configured,
    authorizeEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
  };
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" };
}

function sanitizeMicrosoftScopes(input) {
  const requested = Array.isArray(input) ? input : String(input ?? "").split(/[,\s]+/);
  const allowed = new Set(MICROSOFT_GRAPH_DEFAULT_SCOPES);
  const scopes = requested.map((scope) => String(scope).trim()).filter((scope) => allowed.has(scope));
  return scopes.length > 0 ? [...new Set(scopes)] : MICROSOFT_GRAPH_DEFAULT_SCOPES;
}

function createMicrosoftAuthRequest({ scopes } = {}) {
  const config = microsoftGraphConfig();
  const stateValue = randomId("ms_state");
  const nonce = randomId("ms_nonce");
  const pkce = createPkcePair();
  const selectedScopes = sanitizeMicrosoftScopes(scopes);
  const params = new URLSearchParams({
    client_id: config.clientId || "missing-client-id",
    response_type: "code",
    redirect_uri: config.redirectUri || "http://127.0.0.1:19090/mcp/microsoft/oauth/callback",
    response_mode: "query",
    scope: selectedScopes.join(" "),
    state: stateValue,
    nonce,
    code_challenge: pkce.challenge,
    code_challenge_method: pkce.method,
    prompt: "select_account",
  });
  const request = {
    state: stateValue,
    nonce,
    connectorId: "microsoft-office",
    scopes: selectedScopes,
    codeVerifierHash: hash(pkce.verifier),
    codeVerifier: pkce.verifier,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
  };
  state.microsoftOAuth.unshift(request);
  state.microsoftOAuth = state.microsoftOAuth.slice(0, 50);
  auditTrail("mcp.microsoft.oauth.start", { scopes: selectedScopes, configured: config.configured });
  saveWithRetry();
  return {
    configured: config.configured,
    authorizationUrl: `${config.authorizeEndpoint}?${params.toString()}`,
    state: stateValue,
    redirectUri: config.redirectUri || "http://127.0.0.1:19090/mcp/microsoft/oauth/callback",
    scopes: selectedScopes,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: pkce.method,
    faultCode: config.configured ? null : "CLWD-MCP-MS-9001",
    missingEnv: config.configured
      ? []
      : ["MICROSOFT_GRAPH_CLIENT_ID", "MICROSOFT_GRAPH_CLIENT_SECRET", "MICROSOFT_GRAPH_REDIRECT_URI"].filter((name) => !process.env[name]),
  };
}

async function exchangeMicrosoftGraphCode({ code, stateValue }) {
  const config = microsoftGraphConfig();
  if (!config.configured) {
    return { ok: false, statusCode: 503, faultCode: "CLWD-MCP-MS-9001", error: "Microsoft Graph OAuth is not configured" };
  }
  const request = state.microsoftOAuth.find((item) => item.state === stateValue);
  if (!request || new Date(request.expiresAt) <= new Date()) {
    return { ok: false, statusCode: 400, faultCode: "CLWD-MCP-MS-1001", error: "OAuth state is invalid or expired" };
  }
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope: request.scopes.join(" "),
    code_verifier: request.codeVerifier,
  });
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      faultCode: "CLWD-MCP-MS-1002",
      error: payload.error_description || payload.error || "Microsoft token exchange failed",
    };
  }
  return {
    ok: true,
    scopes: request.scopes,
    tokenHash: hash(payload.access_token || ""),
    refreshTokenHash: payload.refresh_token ? hash(payload.refresh_token) : null,
    expiresAt: payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : null,
  };
}

function ensureDeveloperBypass(account) {
  if (!devBypassEmail) return false;
  return account && account.email === devBypassEmail && devBypassPassword;
}

function ensureOwnerAccount() {
  const existing = accountByEmail(OWNER_EMAIL);
  if (existing) {
    existing.role = "owner";
    existing.mode = "enterprise";
    existing.emailVerified = true;
    existing.emailVerificationPending = false;
    existing.status = "active";
    return;
  }
  state.accounts.unshift({
    id: randomId("acct"),
    email: OWNER_EMAIL,
    displayName: "NaviaWorks Owner",
    passwordHash: hashPassword(randomId("owner-bootstrap")),
    mode: "enterprise",
    role: "owner",
    organization: "NaviaWorks",
    emailVerified: true,
    emailVerificationPending: false,
    status: "active",
    createdAt: nowIso(),
    createdBy: "bootstrap",
    notes: ["owner-account"],
  });
}

function ensureSeedDefaults() {
  const shouldHaveDev = devBypassEmail && devBypassPassword;
  ensureOwnerAccount();
  if (!shouldHaveDev) return;
  const email = devBypassEmail.trim().toLowerCase();
  if (!state.accounts.some((item) => item.email === email)) {
    state.accounts.unshift({
      id: randomId("acct"),
      email,
      displayName: "Developer",
      passwordHash: hashPassword(devBypassPassword),
      mode: "enterprise",
      role: "admin",
      organization: "ClawDesk Internal",
      emailVerified: true,
      createdAt: nowIso(),
      createdBy: "bootstrap",
      notes: ["developer-bypass"],
    });
    auditTrail("bootstrap.developer-account", { email });
  }
}

function loadState() {
  return fs
    .readFile(stateFilePath, "utf8")
    .then((raw) => {
      const parsed = JSON.parse(raw);
      state = { ...defaultState, ...parsed };
      state.accounts = parsed.accounts ?? [];
      state.sessions = parsed.sessions ?? [];
      state.verificationTokens = parsed.verificationTokens ?? [];
      state.machines = parsed.machines ?? [];
      state.licenses = parsed.licenses ?? [];
      state.licenseEvents = parsed.licenseEvents ?? [];
      state.webhooks = parsed.webhooks ?? [];
      state.diagnostics = parsed.diagnostics ?? [];
      state.audit = parsed.audit ?? [];
      state.updates = {
        ...(defaultState.updates ?? {}),
        ...(parsed.updates ?? {}),
      };
      state.passwordResetTokens = parsed.passwordResetTokens ?? [];
      state.notificationOutbox = parsed.notificationOutbox ?? [];
      state.entitlements = parsed.entitlements ?? [];
      state.naviaLicenses = parsed.naviaLicenses ?? [];
      state.webhookEvents = parsed.webhookEvents ?? [];
      state.paymentEvents = parsed.paymentEvents ?? [];
      ensureSeedDefaults();
    })
    .catch(() => {
      state = structuredClone(defaultState);
      ensureSeedDefaults();
    });
}

function saveState() {
  return fs
    .mkdir(path.dirname(stateFilePath), { recursive: true })
    .then(() => fs.writeFile(stateFilePath, JSON.stringify(state, null, 2)))
    .catch(() => {});
}

function saveWithRetry() {
  setTimeout(() => {
    void saveState();
  }, 30);
}

const handlers = {
  "GET:/health": async (req, res) => {
    json(
      res,
      200,
      createBackendHealthPayload({
        port,
        now: nowIso(),
        adapterMode: adapters.mode,
        adapterReadiness: adapters.readiness,
        metrics: {
          accounts: state.accounts.length,
          activeSessions: state.sessions.filter((item) => new Date(item.expiresAt) > new Date()).length,
          licenses: state.licenses.length,
        },
      }),
    );
  },

  "GET:/contract": async (_req, res) => {
    json(res, 200, {
      ...BACKEND_CONTRACT,
      activeAdapterMode: adapters.mode,
      adapterReadiness: adapters.readiness,
    });
  },

  "POST:/api/auth/register": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      const password = String(body?.password ?? "").trim();
      if (!email.includes("@") || password.length < 8) {
        json(res, 400, { ok: false, error: "Invalid email or password" });
        return;
      }
      const existed = accountByEmail(email);
      if (existed && existed.emailVerified) {
        json(res, 409, { ok: false, error: "Account already verified" });
        return;
      }
      const token = issueStoredToken("verificationTokens", email, "verify", 30, { kind: "email_verification" });
      queueNotification("email_verification", email, { tokenHash: hashToken(token) });
      const record = {
        id: existed?.id ?? randomId("acct"),
        email,
        displayName: String(body?.displayName ?? "").trim() || email.split("@")[0],
        passwordHash: hashPassword(password),
        organization: body?.organization ? String(body.organization).trim() : undefined,
        emailVerified: false,
        emailVerificationPending: true,
        status: "pending_email_verification",
        role: isOwnerEmail(email) ? "owner" : "user",
        mode: isOwnerEmail(email) ? "enterprise" : "consumer",
        createdAt: existed?.createdAt ?? nowIso(),
      };
      if (existed) {
        Object.assign(state.accounts[state.accounts.findIndex((item) => item.email === email)], record);
      } else {
        state.accounts.unshift(record);
      }
      auditTrail("identity.register", { email });
      saveWithRetry();
      json(res, 200, {
        ok: true,
        status: "pending_email_verification",
        email,
        message: "Verification email queued",
        debugVerificationToken: token,
      });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "GET:/api/auth/verify-email": async (_req, res, parsed) => {
    const token = String(parsed.searchParams.get("token") ?? "").trim();
    const record = consumeStoredTokenByValue("verificationTokens", token);
    if (!record) {
      json(res, 400, { ok: false, error: "Token invalid or expired" });
      return;
    }
    const account = accountByEmail(record.email);
    if (!account) {
      json(res, 404, { ok: false, error: "Account not found" });
      return;
    }
    account.emailVerified = true;
    account.emailVerificationPending = false;
    account.status = "active";
    auditTrail("identity.verify-email", { email: account.email });
    saveWithRetry();
    json(res, 200, { ok: true, status: "verified", email: account.email });
  },

  "POST:/api/auth/verify-email": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      const token = String(body?.token ?? body?.code ?? "").trim();
      const record = email ? consumeStoredToken("verificationTokens", email, token) : consumeStoredTokenByValue("verificationTokens", token);
      if (!record) {
        json(res, 400, { ok: false, error: "Token invalid or expired" });
        return;
      }
      const account = accountByEmail(record.email);
      if (!account) {
        json(res, 404, { ok: false, error: "Account not found" });
        return;
      }
      account.emailVerified = true;
      account.emailVerificationPending = false;
      account.status = "active";
      auditTrail("identity.verify-email", { email: account.email });
      saveWithRetry();
      json(res, 200, { ok: true, status: "verified", email: account.email });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "POST:/api/auth/login": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      const password = String(body?.password ?? "").trim();
      const account = accountByEmail(email);
      const passwordOk = account && account.passwordHash === hashPassword(password);
      const bypassOk = account && ensureDeveloperBypass(account) && password === devBypassPassword;
      if (!(passwordOk || bypassOk)) {
        auditTrail("identity.login.failed", { email });
        json(res, 401, { ok: false, error: "Invalid credentials" });
        return;
      }
      if (account.emailVerified !== true && !isOwnerEmail(account.email)) {
        json(res, 403, { ok: false, error: "Email not verified" });
        return;
      }
      account.status = "active";
      if (isOwnerEmail(account.email)) {
        account.role = "owner";
        account.mode = "enterprise";
      }
      const session = createSession(account.id, req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "");
      session.token = `${session.token}-dev`;
      auditTrail("identity.login", { email, role: account.role, mode: account.mode });
      saveWithRetry();
      json(res, 200, {
        ok: true,
        status: "ok",
        cookie: {
          name: NAVIA_SESSION_COOKIE_NAME,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
        },
        session: { token: session.token, account: accountPublicShape(account) },
      });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "GET:/api/auth/me": async (req, res, parsed) => {
    const token = readAuthToken(req, parsed);
    const session = readSession(token);
    if (!session) {
      json(res, 401, { ok: false, error: "Invalid session" });
      return;
    }
    const account = accountBySessionToken(token);
    json(res, 200, {
      ok: true,
      session: {
        token,
        cookieName: NAVIA_SESSION_COOKIE_NAME,
        account: accountPublicShape(account),
      },
    });
  },

  "POST:/api/auth/logout": async (req, res, parsed) => {
    const token = readAuthToken(req, parsed);
    state.sessions = state.sessions.filter((item) => item.token !== token);
    auditTrail("identity.logout", { tokenHash: token ? hash(token).slice(0, 12) : "none" });
    saveWithRetry();
    json(res, 200, { ok: true, status: "logged_out" });
  },

  "POST:/api/auth/password/forgot": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      if (email.includes("@") && accountByEmail(email)) {
        const token = issueStoredToken("passwordResetTokens", email, "reset", 30, { kind: "password_reset" });
        queueNotification("password_reset", email, { tokenHash: hashToken(token) });
      }
      saveWithRetry();
      json(res, 200, { ok: true, status: "queued" });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "POST:/api/auth/password/reset": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      const token = String(body?.token ?? "").trim();
      const password = String(body?.password ?? "").trim();
      if (password.length < 8) {
        json(res, 400, { ok: false, error: "Password too short" });
        return;
      }
      const record = email ? consumeStoredToken("passwordResetTokens", email, token) : consumeStoredTokenByValue("passwordResetTokens", token);
      if (!record) {
        json(res, 400, { ok: false, error: "Token invalid or expired" });
        return;
      }
      const account = accountByEmail(record.email);
      if (!account) {
        json(res, 404, { ok: false, error: "Account not found" });
        return;
      }
      account.passwordHash = hashPassword(password);
      auditTrail("identity.password-reset", { email: account.email });
      saveWithRetry();
      json(res, 200, { ok: true, status: "password_reset", email: account.email });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "GET:/api/account/entitlements": async (req, res, parsed) => {
    const token = readAuthToken(req, parsed);
    const account = accountBySessionToken(token);
    if (!account) {
      json(res, 401, { ok: false, error: "Invalid session" });
      return;
    }
    json(res, 200, { ok: true, entitlements: entitlementsForAccount(account) });
  },

  "GET:/api/license/public-keys": async (_req, res) => {
    json(res, 200, buildNaviaPublicKeyRing());
  },

  "POST:/api/license/activate": async (req, res) => {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body?.email);
      const orderNo = String(body?.orderNo ?? body?.licenseKey ?? "").trim();
      const hwid = String(body?.hwid ?? body?.machineFingerprintHash ?? "").trim();
      const instanceId = String(body?.instanceId ?? "").trim();
      const productKey = String(body?.productKey ?? "clawdesk").trim().toLowerCase();
      const appVersion = String(body?.appVersion ?? "").trim();
      if (!email.includes("@") || !orderNo || !hwid || !instanceId) {
        json(res, 400, { ok: false, message: "email, orderNo, hwid, and instanceId are required" });
        return;
      }
      const seed = seedLicenses[orderNo];
      if (!seed) {
        json(res, 404, { ok: false, message: "license_not_found" });
        return;
      }
      const account = accountByEmail(email);
      if (!account) {
        json(res, 404, { ok: false, message: "account_not_found" });
        return;
      }
      const record = createNaviaLicenseRecord({ email, productKey, orderNo, hwid, instanceId, appVersion, seed });
      const certificate = issueNaviaCertificate(record);
      const existingIndex = state.naviaLicenses.findIndex((item) => item.accountEmail === email && item.instanceId === instanceId && item.productKey === productKey);
      if (existingIndex >= 0) state.naviaLicenses[existingIndex] = record;
      else state.naviaLicenses.unshift(record);
      upsertEntitlement({
        accountEmail: email,
        productKey,
        planKey: record.planKey,
        status: seed.status === "active" ? "active" : "safe-mode",
        expiresAtUtc: record.expiresAtUtc,
        updatesUntilUtc: record.updatesUntilUtc,
        features: record.features,
        maxDevices: record.maxDevices,
        source: "license.activate",
      });
      auditTrail("api.license.activate", { email, productKey, planKey: record.planKey, instanceId });
      saveWithRetry();
      json(res, 200, {
        ok: true,
        message: "activated",
        licenseId: record.licenseId,
        instanceId: record.instanceId,
        license: certificate,
        gracePolicy: {
          licenseType: record.licenseType,
          expiresAtUtc: record.expiresAtUtc,
          graceUntilUtc: record.graceUntilUtc,
          updatesUntilUtc: record.updatesUntilUtc,
        },
        features: record.features,
        updatesUntilUtc: record.updatesUntilUtc,
        maxDevices: record.maxDevices,
      });
    } catch {
      json(res, 400, { ok: false, message: "Invalid JSON" });
    }
  },

  "POST:/api/license/validate": async (req, res) => {
    try {
      const body = await readBody(req);
      const certificateJson = String(body?.licenseCertificateJson ?? body?.certificateJson ?? "").trim();
      const hwid = String(body?.hwid ?? "").trim();
      const instanceId = String(body?.instanceId ?? "").trim();
      const productKey = String(body?.productKey ?? "clawdesk").trim().toLowerCase();
      const appReleaseDateUtc = String(body?.appReleaseDateUtc ?? "").trim() || null;
      const parsedCertificate = parseNaviaCertificate(certificateJson);
      const record = state.naviaLicenses.find((item) => item.licenseId === parsedCertificate.payload.licenseId) ?? null;
      const signatureValid = verifyNaviaPayloadSignature(parsedCertificate.payload, parsedCertificate.signature);
      if (!signatureValid) {
        json(res, 200, {
          ok: true,
          data: {
            active: false,
            message: "signature_invalid",
            licenseId: parsedCertificate.payload.licenseId ?? null,
            productKey,
            planKey: parsedCertificate.payload.planKey ?? "clawdesk.free",
            licenseType: parsedCertificate.payload.licenseType ?? "free",
            features: parsedCertificate.payload.features ?? [],
            revoked: false,
            expired: false,
            withinGrace: false,
            hwidMatched: false,
            instanceMatched: false,
            machineBindingMatched: false,
            updatesAllowed: false,
            productMatched: false,
            expiresAtUtc: parsedCertificate.payload.expiresAtUtc ?? null,
            updatesUntilUtc: parsedCertificate.payload.updatesUntilUtc ?? null,
            graceUntilUtc: parsedCertificate.payload.graceUntilUtc ?? null,
            maxDevices: Number(parsedCertificate.payload.maxDevices ?? 1),
            activeDeviceCount: 0,
          },
        });
        return;
      }
      const machineBindingHash = hash(`${hwid}|${instanceId}|${productKey}`);
      const data = record
        ? naviaValidateEnvelopeFromRecord(record, appReleaseDateUtc)
        : naviaValidateEnvelopeFromRecord({
            ...parsedCertificate.payload,
            planKey: normalizePlanKey(parsedCertificate.payload.planKey),
            licenseType: parsedCertificate.payload.licenseType ?? licenseTypeFromPlanKey(parsedCertificate.payload.planKey),
            maxDevices: Number(parsedCertificate.payload.maxDevices ?? 1),
            status: "active",
          }, appReleaseDateUtc);
      data.productMatched = String(parsedCertificate.payload.productKey ?? "clawdesk").toLowerCase() === productKey;
      data.hwidMatched = String(parsedCertificate.payload.hwidHash ?? "") === hash(hwid);
      data.instanceMatched = (record?.instanceId ?? instanceId) === instanceId;
      data.machineBindingMatched = String(parsedCertificate.payload.machineBindingHash ?? "") === machineBindingHash;
      data.active = data.active && data.productMatched && data.hwidMatched && data.machineBindingMatched;
      if (record) record.lastValidatedAtUtc = nowIso();
      auditTrail("api.license.validate", { licenseId: data.licenseId, productKey, active: data.active });
      saveWithRetry();
      json(res, 200, { ok: true, data });
    } catch {
      json(res, 400, { ok: false, error: "Invalid JSON" });
    }
  },

  "POST:/api/license/refresh-certificate": async (req, res) => {
    try {
      const body = await readBody(req);
      const licenseId = String(body?.licenseId ?? "").trim();
      const record = state.naviaLicenses.find((item) => item.licenseId === licenseId);
      if (!record) {
        json(res, 404, { ok: false, message: "license_not_found" });
        return;
      }
      record.issuedAtUtc = nowIso();
      const certificate = issueNaviaCertificate(record);
      auditTrail("api.license.refresh-certificate", { licenseId, productKey: record.productKey });
      saveWithRetry();
      json(res, 200, {
        ok: true,
        message: "refreshed",
        licenseId: record.licenseId,
        instanceId: record.instanceId,
        license: certificate,
        gracePolicy: {
          licenseType: record.licenseType,
          expiresAtUtc: record.expiresAtUtc,
          graceUntilUtc: record.graceUntilUtc,
          updatesUntilUtc: record.updatesUntilUtc,
        },
        features: record.features,
        updatesUntilUtc: record.updatesUntilUtc,
        maxDevices: record.maxDevices,
      });
    } catch {
      json(res, 400, { ok: false, message: "Invalid JSON" });
    }
  },

  "POST:/api/license/deactivate": async (req, res) => {
    try {
      const body = await readBody(req);
      const licenseId = String(body?.licenseId ?? "").trim();
      const instanceId = String(body?.instanceId ?? "").trim();
      const index = state.naviaLicenses.findIndex((item) => item.licenseId === licenseId && item.instanceId === instanceId);
      if (index < 0) {
        json(res, 404, { ok: false, message: "license_not_found" });
        return;
      }
      const [record] = state.naviaLicenses.splice(index, 1);
      state.machines = state.machines.filter((item) => !(item.licenseKey === record.orderNo && item.machineFingerprintHash === record.hwid));
      auditTrail("api.license.deactivate", { licenseId, productKey: record.productKey });
      saveWithRetry();
      json(res, 200, { ok: true, message: "deactivated" });
    } catch {
      json(res, 400, { ok: false, message: "Invalid JSON" });
    }
  },

  "GET:/api/license/me": async (req, res, parsed) => {
    const token = readAuthToken(req, parsed);
    const account = accountBySessionToken(token);
    if (!account) {
      json(res, 401, { ok: false, error: "Invalid session" });
      return;
    }
    const entitlements = entitlementsForAccount(account);
    const license = state.naviaLicenses.find((item) => item.accountEmail === account.email) ?? null;
    json(res, 200, {
      ok: true,
      account: accountPublicShape(account),
      entitlement: entitlements[0] ?? null,
      license: license
        ? {
            licenseId: license.licenseId,
            productKey: license.productKey,
            planKey: license.planKey,
            licenseType: license.licenseType,
            updatesUntilUtc: license.updatesUntilUtc,
            maxDevices: license.maxDevices,
            instanceId: license.instanceId,
          }
        : null,
    });
  },

  "POST:/api/webhooks/lemonsqueezy": async (req, res) => handlers["POST:/webhooks/lemon-squeezy"](req, res),
  "POST:/api/payment/lemonsqueezy/webhook": async (req, res) => handlers["POST:/webhooks/lemon-squeezy"](req, res),
  "POST:/api/payment/newebpay/notify": async (_req, res) => {
    json(res, 501, {
      ok: false,
      provider: "newebpay",
      error: "NewebPay notify placeholder only",
    });
  },

  "POST:/auth/register": async (req, res) => {
    return handlers["POST:/api/auth/register"](req, res);
  },

  "POST:/auth/confirm": async (req, res) => {
    return handlers["POST:/api/auth/verify-email"](req, res);
  },

  "POST:/auth/login": async (req, res) => {
    return handlers["POST:/api/auth/login"](req, res);
  },

  "GET:/auth/session": async (req, res, parsed) => {
    const token = readAuthToken(req, parsed);
    const session = readSession(token);
    if (!session) {
      json(res, 401, { error: "Invalid session" });
      return;
    }
    json(res, 200, { status: "ok", session });
  },

  "POST:/auth/sso/start": async (req, res) => {
    try {
      const body = await readBody(req);
      const provider = String(body?.provider ?? "").trim().toLowerCase();
      const providerIds = adapters.identity.ssoProviders().map((item) => item.id);
      if (!providerIds.includes(provider)) {
        json(res, 400, { error: "Unsupported provider" });
        return;
      }
      const requestId = randomId("sso");
      state.webhooks.unshift({
        id: requestId,
        provider,
        type: "sso.start",
        status: "pending",
        createdAt: nowIso(),
      });
      saveWithRetry();
      json(res, 200, {
        status: "ok",
        requestId,
        provider,
        callbackUrl: `${baseUrl}/auth/sso/finish`,
      });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/auth/sso/finish": async (req, res) => {
    try {
      const body = await readBody(req);
      const provider = String(body?.provider ?? "").trim().toLowerCase();
      const email = String(body?.email ?? "").trim().toLowerCase();
      const organization = String(body?.organization ?? "").trim() || undefined;
      const oidcValidation = adapters.identity.validateOidcCallback({ provider, email, organization });
      if (!oidcValidation.ok && oidcValidation.statusCode) {
        json(res, oidcValidation.statusCode, oidcValidation);
        return;
      }
      if (!email.includes("@")) {
        json(res, 400, { error: "Invalid email" });
        return;
      }
      const existed = accountByEmail(email);
      if (existed) {
        existed.mode = "enterprise";
        existed.role = existed.role || "admin";
        existed.organization = organization ?? existed.organization;
        existed.ssoProvider = provider;
      } else {
        state.accounts.unshift({
          id: randomId("acct"),
          email,
          displayName: email.split("@")[0],
          passwordHash: hashPassword(`__sso_${email}`),
          mode: "enterprise",
          role: "admin",
          organization,
          emailVerified: true,
          emailVerificationPending: false,
          ssoProvider: provider,
          createdAt: nowIso(),
        });
      }
      const target = accountByEmail(email);
      const session = createSession(target.id);
      auditTrail("identity.sso", { provider, email });
      saveWithRetry();
      json(res, 200, { status: "ok", session: { token: session.token, account: readSession(session.token) } });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "GET:/auth/sso/providers": async (_req, res) => {
    json(res, 200, {
      providers: adapters.identity.ssoProviders(),
    });
  },

  "GET:/license/status": async (req, res, parsed) => {
    const licenseKey = parsed.searchParams.get("licenseKey");
    if (!licenseKey) {
      json(res, 400, { error: "licenseKey is required" });
      return;
    }
    const found = state.licenses.find((item) => item.payload.encodedKey === licenseKey);
    if (!found) {
      const seed = seedLicenses[licenseKey];
      if (!seed) {
        json(res, 404, { error: "license not found" });
        return;
      }
      json(res, 200, {
        plan: seed.plan,
        canonicalPlanKey: normalizePlanKey(canonicalPlanKeyFromSeedPlan(seed.plan)),
        productKey: "clawdesk",
        paymentProvider: "lemon-squeezy",
        licenseProvider: "keygen",
        commerceProvider: "lemon-squeezy",
        entitlementAuthority: "universal-server",
        status: seed.status,
        supportUpdatesUntil: seed.supportUpdatesUntil,
        updatesUntilUtc: seed.supportUpdatesUntil ? new Date(seed.supportUpdatesUntil).toISOString() : null,
        graceUntilUtc: null,
        activeDeviceCount: 0,
        features: seed.features,
      });
      return;
    }
    const summary = licenseStatusFromPayload(found.payload, parsed.searchParams.get("machineFingerprintHash"));
    json(res, 200, {
      ...summary,
      signatureStatus: found.signatureStatus,
      keyId: found.keyId,
    });
  },

  "POST:/licenses/activate-key": async (req, res) => {
    try {
      const body = await readBody(req);
      const licenseKey = String(body?.licenseKey ?? "").trim();
      const machineFingerprintHash = String(body?.machineFingerprintHash ?? "").trim();
      if (!licenseKey || !machineFingerprintHash) {
        json(res, 400, { error: "licenseKey and machineFingerprintHash are required" });
        return;
      }
      const seed = seedLicenses[licenseKey];
      if (!seed) {
        json(res, 404, { error: "Unknown license key" });
        return;
      }
      const bindings = state.machines.filter((item) => item.licenseKey === licenseKey);
      if (bindings.length >= seed.deviceLimit && !bindings.some((item) => item.machineFingerprintHash === machineFingerprintHash)) {
        json(res, 409, { error: "Device limit exceeded", faultCode: "CLWD-LIC-3003" });
        return;
      }
      const instanceName = String(body?.instanceName ?? `ClawDesk macOS ${machineFingerprintHash.slice(-8)}`).trim();
      const activation = await adapters.lemonSqueezy.activateLicenseKey({ licenseKey, instanceName });
      if (!activation.ok) {
        json(res, activation.statusCode ?? 409, {
          error: activation.error ?? "Lemon Squeezy activation failed",
          faultCode: activation.faultCode ?? "CLWD-LIC-4002",
          provider: "lemon-squeezy",
          status: activation.status,
        });
        return;
      }
      if (activation.expiresAt) seed.expiresAt = activation.expiresAt;
      if (activation.activationLimit && Number.isFinite(Number(activation.activationLimit))) {
        seed.deviceLimit = Number(activation.activationLimit);
      }
      const payload = licensePayload(licenseKey, machineFingerprintHash, activation.instanceId);
      const ticket = issueSignedTicket(payload);
      const machine = updateBoundMachine(licenseKey, machineFingerprintHash);
      machine.lemonSqueezyInstanceId = activation.instanceId;
      const entry = {
        keyId: payload.keyId,
        payload,
        signatureStatus: "valid",
        machineId: machine.id,
        lemonSqueezyInstanceId: activation.instanceId,
        lemonSqueezyLicenseKeyId: activation.licenseKeyId,
        signature: ticket.signature,
        issuedAt: nowIso(),
      };
      state.licenses = state.licenses.filter((item) => item.payload.encodedKey !== licenseKey);
      state.licenses.unshift(entry);
      state.licenseEvents.unshift({
        id: randomId("licevt"),
        type: "activate",
        licenseKey,
        machineFingerprintHash,
        lemonSqueezyInstanceId: activation.instanceId,
        timestamp: nowIso(),
      });
      auditTrail("license.activate", { provider: "lemon-squeezy", licenseKey, machineId: machine.id, instanceId: activation.instanceId });
      saveWithRetry();
      json(res, 200, {
        provider: "lemon-squeezy",
        license: {
          keyId: payload.keyId,
          encodedKey: licenseKey,
          signatureStatus: "valid",
          payloadHash: payload.payloadHash,
          plan: seed.plan,
          status: seed.status,
          supportUpdatesUntil: seed.supportUpdatesUntil,
          expiresAt: seed.expiresAt,
          deviceLimit: seed.deviceLimit,
          lemonSqueezyLicenseKeyId: activation.licenseKeyId,
          lemonSqueezyInstanceId: activation.instanceId,
          activationUsage: activation.activationUsage,
        },
        machine,
        instance: {
          id: activation.instanceId,
          name: instanceName,
          provider: "lemon-squeezy",
        },
        offlineTicket: {
          token: ticket.token,
          signature: ticket.signature,
          issuedAt: ticket.issuedAt,
          expiresAt: nowIso(),
        },
      });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/licenses/validate": async (req, res) => {
    try {
      const body = await readBody(req);
      const offlineTicket = String(body?.offlineTicket ?? "").trim();
      const licenseKey = String(body?.licenseKey ?? body?.licenseIdOrKey ?? "").trim();
      const lemonSqueezyInstanceId = String(body?.instanceId ?? body?.lemonSqueezyInstanceId ?? "").trim();
      const machineFingerprintHash = String(body?.machineFingerprintHash ?? "").trim();
      if (licenseKey && lemonSqueezyInstanceId) {
        const validation = await adapters.lemonSqueezy.validateLicenseKey({ licenseKey, instanceId: lemonSqueezyInstanceId });
        if (!validation.ok) {
          json(res, validation.statusCode ?? 426, {
            status: validation.status === "expired" ? "expired" : validation.status === "revoked" ? "revoked" : "tampered",
            provider: "lemon-squeezy",
            onlineValidationStatus: validation.statusCode === 503 ? "unavailable" : "failed",
            faultCode: validation.faultCode ?? "CLWD-LIC-4002",
            error: validation.error,
            instanceId: lemonSqueezyInstanceId,
          });
          return;
        }
        const existing = state.licenses.find((item) => item.payload.encodedKey === licenseKey);
        if (existing) {
          existing.payload.status = "active";
          existing.payload.expiresAt = validation.expiresAt ?? existing.payload.expiresAt;
          existing.payload.lemonSqueezyInstanceId = validation.instanceId ?? lemonSqueezyInstanceId;
          existing.lastValidatedAt = nowIso();
          existing.signatureStatus = "valid";
        }
        auditTrail("license.validate", { provider: "lemon-squeezy", licenseKey, instanceId: lemonSqueezyInstanceId });
        saveWithRetry();
        json(res, 200, {
          status: "active",
          provider: "lemon-squeezy",
          onlineValidationStatus: "valid",
          lemonSqueezyStatusCode: String(validation.status ?? "active").toUpperCase(),
          machineMatched: true,
          instanceId: validation.instanceId ?? lemonSqueezyInstanceId,
          licenseKeyId: validation.licenseKeyId,
          expiresAt: validation.expiresAt,
          activationUsage: validation.activationUsage,
          activationLimit: validation.activationLimit,
        });
        return;
      }
      if (adapters.mode === "production") {
        const validation = await adapters.keygen.validateOfflineTicket({
          licenseFile: body?.licenseFile ?? offlineTicket,
          machineFingerprintHash,
          onlineValidation: body?.onlineValidation === true,
          licenseIdOrKey: body?.licenseIdOrKey,
        });
        if (!validation.ok) {
          json(res, validation.statusCode ?? 400, validation);
          return;
        }
        json(res, 200, {
          status: validation.status ?? validation.payload?.status ?? "active",
          plan: validation.payload?.plan ?? validation.payload?.license?.plan ?? "enterprise",
          signatureStatus: validation.signatureStatus,
          machineMatched: validation.machineMatched,
          onlineValidationStatus: validation.onlineValidationStatus ?? "skipped",
          keygenStatusCode: validation.keygenStatusCode,
          revocationCheckedAt: validation.revocationCheckedAt,
          offlineGrace: validation.offlineGrace === true,
          supportUpdatesUntil:
            validation.payload?.supportUpdatesUntil ??
            validation.payload?.meta?.supportUpdatesUntil ??
            validation.payload?.meta?.expiry ??
            null,
          features: validation.payload?.features ?? validation.payload?.license?.features ?? [],
        });
        return;
      }
      const parsed = parseTicket(offlineTicket);
      if (!parsed) {
        json(res, 400, { error: "Invalid offline ticket" });
        return;
      }
      if (!parsed.signatureMatch) {
        json(res, 400, { error: "Ticket signature invalid", faultCode: "CLWD-LIC-1001" });
        return;
      }
      const existing = getSeedFromTicketPayload(parsed.payload);
      const payload = parsed.payload;
      const isTampered = payload.machineFingerprintHash !== machineFingerprintHash && machineFingerprintHash.length > 0;
      const summary = licenseStatusFromPayload(payload, machineFingerprintHash);
      const status = { ...summary, tampered: isTampered, signatureStatus: parsed.signatureMatch ? "valid" : "invalid" };
      if (isTampered) {
        status.status = "tampered";
        state.licenseEvents.unshift({ id: randomId("tamper"), type: "tamper", licenseKey: payload.encodedKey, reason: "machine mismatch" });
      }
      if (existing) {
        existing.lastValidatedAt = nowIso();
        existing.signatureStatus = status.tampered ? "tampered" : "valid";
      }
      auditTrail("license.validate", { keyId: parsed.keyId, tampered: status.tampered });
      saveWithRetry();
      json(res, isTampered ? 426 : 200, status);
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/licenses/refresh-offline-ticket": async (req, res) => {
    try {
      const body = await readBody(req);
      const licenseKey = String(body?.licenseKey ?? "").trim();
      const existing = state.licenses.find((item) => item.payload.encodedKey === licenseKey);
      if (!existing) {
        json(res, 404, { error: "license not found" });
        return;
      }
      const machineFingerprintHash = String(body?.machineFingerprintHash ?? "").trim() || existing.payload.machineFingerprintHash;
      existing.payload.machineFingerprintHash = machineFingerprintHash;
      existing.payload.payloadHash = hash(`${existing.payload.keyId}|${licenseKey}|${existing.payload.issuedAt}`);
      const ticket = issueSignedTicket(existing.payload);
      existing.signature = ticket.signature;
      existing.issuedAt = nowIso();
      state.licenseEvents.unshift({
        id: randomId("licevt"),
        type: "refresh-offline-ticket",
        licenseKey,
        machineFingerprintHash,
        timestamp: nowIso(),
      });
      auditTrail("license.refresh-offline", { licenseKey });
      saveWithRetry();
      json(res, 200, {
        ticket: {
          token: ticket.token,
          signature: ticket.signature,
          issuedAt: ticket.issuedAt,
          expiresAt: nowIso(),
        },
      });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/licenses/report-tamper": async (req, res) => {
    try {
      const body = await readBody(req);
      const event = {
        id: randomId("tamper"),
        reason: String(body?.reason ?? "unknown"),
        detectedAt: nowIso(),
        localAction: "safe-mode",
        serverAction: "mark-review",
        faultCode: String(body?.faultCode ?? "CLWD-LIC-1001"),
      };
      state.licenseEvents.unshift(event);
      if (state.licenseEvents.length > 2000) state.licenseEvents.length = 2000;
      auditTrail("license.tamper", { reason: event.reason, faultCode: event.faultCode });
      saveWithRetry();
      json(res, 200, event);
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/webhooks/paddle": async (req, res) => {
    json(res, 410, {
      error: "Paddle payment channel is disabled",
      paymentProvider: "lemon-squeezy",
      replacement: "/webhooks/lemon-squeezy",
    });
  },

  "POST:/webhooks/lemon": async (req, res) => handlers["POST:/webhooks/lemon-squeezy"](req, res),

  "POST:/webhooks/lemon-squeezy": async (req, res) => {
    try {
      const { body, rawBody } = await readBodyWithRaw(req);
      const eventType = String(body?.eventType ?? body?.meta?.event_name ?? "").trim();
      if (!eventType) {
        json(res, 400, { error: "eventType or meta.event_name required" });
        return;
      }
      const attributes = body?.data?.attributes ?? {};
      const customData = body?.meta?.custom_data ?? {};
      const licenseKey = createLemonSqueezyLicenseKey({
        orderId: body?.orderId ?? body?.data?.id ?? attributes.order_id,
        subscriptionId: body?.subscriptionId ?? attributes.subscription_id,
        licenseKey: body?.licenseKey ?? attributes.key ?? customData.licenseKey,
      });
      const eventId = String(body?.eventId ?? body?.meta?.event_id ?? body?.data?.id ?? `${eventType}:${licenseKey}`).trim();
      const duplicate = state.webhookEvents.find((item) => item.provider === "lemon-squeezy" && item.eventId === eventId);
      if (duplicate) {
        json(res, 200, { status: "duplicate", provider: "lemon-squeezy", eventType, eventId });
        return;
      }
      const plan = body?.plan ?? customData.plan ?? attributes.variant_name ?? attributes.product_name ?? "yearly";
      const machineFingerprintHash = String(body?.machineFingerprintHash ?? customData.machineFingerprintHash ?? "").trim();
      const accountEmail = normalizeEmail(body?.email ?? customData.email ?? attributes.user_email ?? attributes.customer_email ?? "");
      const signatureCheck = adapters.lemonSqueezy.verifyWebhookSignature({
        signatureHeader: req.headers["x-signature"],
        rawBody,
      });
      if (!signatureCheck.ok && adapters.mode === "production") {
        json(res, signatureCheck.statusCode ?? 401, signatureCheck);
        return;
      }
      const mutation = adapters.lemonSqueezy.mapWebhookEvent(eventType);
      if (!mutation) {
        json(res, 422, { error: "unsupported Lemon Squeezy event type", eventType });
        return;
      }
      const seed = ensureLemonSqueezySeedLicense({
        licenseKey,
        plan,
        status: mutation.status ?? "active",
      });
      if (mutation.refreshSupportUpdatesUntil) {
        seed.supportUpdatesUntil = supportUntil(seed.plan, new Date().toISOString());
        seed.expiresAt = seed.plan === "lifetime-local" ? null : supportUntil(seed.plan, new Date().toISOString());
      }
      if (mutation.status) seed.status = mutation.status;
      let payload = licensePayload(licenseKey, machineFingerprintHash || "unbound-lemon-squeezy-payment");
      let ticket = issueSignedTicket(payload);
      let machine = null;
      if (machineFingerprintHash) machine = updateBoundMachine(licenseKey, machineFingerprintHash);
      state.licenses = state.licenses.filter((item) => item.payload.encodedKey !== licenseKey);
      state.licenses.unshift({
        keyId: payload.keyId,
        payload,
        signatureStatus: payload.status === "revoked" ? "revoked" : "valid",
        machineId: machine?.id ?? null,
        signature: ticket.signature,
        issuedAt: nowIso(),
      });
      state.webhooks.unshift({
        id: randomId("wk"),
        provider: "lemon-squeezy",
        eventType,
        eventId,
        licenseKey,
        note: String(body?.note ?? "lemon-squeezy-issue"),
        receivedAt: nowIso(),
      });
      state.webhookEvents.unshift({
        id: randomId("webhookevt"),
        provider: "lemon-squeezy",
        eventId,
        eventType,
        receivedAt: nowIso(),
      });
      state.paymentEvents.unshift({
        id: randomId("payevt"),
        provider: "lemon-squeezy",
        eventId,
        eventType,
        licenseKey,
        accountEmail: accountEmail || null,
        receivedAt: nowIso(),
      });
      state.licenseEvents.unshift({
        id: randomId("licevt"),
        type: `lemon-squeezy.${eventType}`,
        licenseKey,
        machineFingerprintHash: machineFingerprintHash || null,
        timestamp: nowIso(),
      });
      let entitlement = null;
      if (accountEmail) {
        entitlement = upsertEntitlement({
          accountEmail,
          productKey: "clawdesk",
          planKey: normalizePlanKey(canonicalPlanKeyFromSeedPlan(seed.plan)),
          status: seed.status === "active" ? "licensed" : "safe-mode",
          expiresAtUtc: seed.expiresAt ? new Date(seed.expiresAt).toISOString() : null,
          updatesUntilUtc: seed.supportUpdatesUntil ? new Date(seed.supportUpdatesUntil).toISOString() : null,
          features: featuresFromPlanKey(canonicalPlanKeyFromSeedPlan(seed.plan)),
          maxDevices: seed.deviceLimit,
          source: "lemon-squeezy-webhook",
        });
      }
      queueNotification(
        seed.status === "active" ? "payment_success" : seed.status === "revoked" ? "refund_notice" : "subscription_cancelled",
        accountEmail || "unknown@example.invalid",
        { eventId, eventType, licenseKey },
      );
      auditTrail("webhook.lemon-squeezy", { eventType, licenseKey, plan: seed.plan, status: seed.status });
      saveWithRetry();
      json(res, 200, {
        status: "ok",
        provider: "lemon-squeezy",
        eventType,
        eventId,
        license: {
          key: licenseKey,
          status: seed.status === "active" ? "active" : "safe-mode",
          plan: normalizePlanKey(canonicalPlanKeyFromSeedPlan(seed.plan)),
          supportUpdatesUntil: seed.supportUpdatesUntil,
          licenseFile: ticket.token,
          machineFingerprintHash: payload.machineFingerprintHash,
        },
        entitlement,
      });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/webhooks/keygen": async (req, res) => {
    if (adapters.mode === "production") {
      json(res, 410, { error: "Keygen webhook ingress is disabled in production simulator" });
      return;
    }
    try {
      const body = await readBody(req);
      const eventType = String(body?.eventType ?? "").trim();
      const licenseKey = String(body?.licenseKey ?? "").trim();
      if (!eventType || !licenseKey) {
        json(res, 400, { error: "eventType and licenseKey required" });
        return;
      }
      const exists = state.licenses.find((item) => item.payload.encodedKey === licenseKey);
      state.webhooks.unshift({ id: randomId("wk"), provider: "keygen", eventType, licenseKey, receivedAt: nowIso() });
      if (!exists) {
        json(res, 404, { error: "license not found" });
        return;
      }
      const mutation = adapters.keygen.mapWebhookEvent(eventType);
      if (!mutation) {
        json(res, 422, { error: "unsupported Keygen event type", eventType });
        return;
      }
      if (mutation.signatureStatus) exists.signatureStatus = mutation.signatureStatus;
      if (mutation.status) exists.payload.status = mutation.status;
      if (mutation.increaseDeviceLimit) {
        exists.payload.deviceLimit = exists.payload.deviceLimit + mutation.increaseDeviceLimit;
      }
      auditTrail("webhook.keygen", { eventType, licenseKey });
      saveWithRetry();
      json(res, 200, { status: "ok" });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "GET:/updates/check": async (_req, res) => {
    const supportUpdatesUntil = "2026-12-31T23:59:59.999Z";
    const eligibility = updateEligibilityForSupport(supportUpdatesUntil);
    json(res, 200, {
      currentVersion: eligibility.manifest.currentVersion,
      latestVersion: eligibility.latest.version,
      eligibleLatestVersion: eligibility.eligible.version,
      supportUpdatesUntil,
      canInstallLatest: eligibility.canInstallLatest,
      downloadUrl: eligibility.canInstallLatest ? eligibility.latest.downloads.macosUniversal : null,
      releaseNotes: eligibility.latest.releaseNotes,
      requiresRenewal: !eligibility.canInstallLatest,
    });
  },

  "GET:/updates/manifest": async (_req, res) => {
    const supportUpdatesUntil = "2026-12-31T23:59:59.999Z";
    const eligibility = updateEligibilityForSupport(supportUpdatesUntil);
    json(res, 200, {
      ...eligibility.manifest,
      eligibility: {
        currentVersion: eligibility.manifest.currentVersion,
        latestVersion: eligibility.latest.version,
        eligibleLatestVersion: eligibility.eligible.version,
        supportUpdatesUntil,
        canInstallLatest: eligibility.canInstallLatest,
        downloadUrl: eligibility.canInstallLatest ? eligibility.latest.downloads.macosUniversal : null,
        requiresRenewal: !eligibility.canInstallLatest,
      },
    });
  },

  "GET:/updates/history": async (_req, res) => {
    json(res, 200, {
      history: [
        { version: "0.5.0", releasedAt: "2026-05-10", note: "Chat + backend simulator integration" },
        { version: "0.4.9", releasedAt: "2026-05-01", note: "Path governance and diagnostics privacy" },
      ],
    });
  },

  "GET:/mcp/connectors": async (_req, res) => {
    const activeGrantIds = new Set(state.mcpGrants.filter((grant) => grant.status === "active").map((grant) => grant.connectorId));
    json(res, 200, {
      connectors: backendMcpConnectors.map((connector) => ({
        ...connector,
        status: activeGrantIds.has(connector.id) ? "connected" : "available",
      })),
      grants: state.mcpGrants,
    });
  },

  "POST:/mcp/connect": async (req, res) => {
    try {
      const body = await readBody(req);
      const connector = backendMcpConnectors.find((item) => item.id === body?.connectorId);
      if (!connector) {
        json(res, 404, { error: "unknown connector" });
        return;
      }
      const requestedScopes = Array.isArray(body?.scopes) ? body.scopes.filter((scope) => connector.scopes.includes(scope)) : connector.scopes;
      const auditEvent = {
        id: randomId("mcp_audit"),
        action: "connect",
        connectorId: connector.id,
        scopeCount: requestedScopes.length,
        status: "active",
        createdAt: nowIso(),
      };
      const grant = {
        grantId: randomId("mcp_grant"),
        connectorId: connector.id,
        status: "active",
        scopes: requestedScopes,
        issuedAt: nowIso(),
        expiresAt: "2026-06-13T23:59:59.999Z",
        auditId: auditEvent.id,
      };
      state.mcpGrants = [
        grant,
        ...state.mcpGrants.map((item) => (item.connectorId === connector.id && item.status === "active" ? { ...item, status: "revoked", revokedAt: nowIso() } : item)),
      ].slice(0, 500);
      state.mcpAudit.unshift(auditEvent);
      state.mcpAudit = state.mcpAudit.slice(0, 500);
      auditTrail("mcp.connect", { connectorId: connector.id, scopeCount: requestedScopes.length });
      saveWithRetry();
      json(res, 200, { connector: { ...connector, status: "connected" }, grant });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/mcp/revoke": async (req, res) => {
    try {
      const body = await readBody(req);
      const connector = backendMcpConnectors.find((item) => item.id === body?.connectorId);
      if (!connector) {
        json(res, 404, { error: "unknown connector" });
        return;
      }
      const timestamp = nowIso();
      state.mcpGrants = state.mcpGrants.map((grant) =>
        grant.connectorId === connector.id && grant.status === "active" ? { ...grant, status: "revoked", revokedAt: timestamp } : grant,
      );
      const auditEvent = { id: randomId("mcp_audit"), action: "revoke", connectorId: connector.id, status: "revoked", createdAt: timestamp };
      state.mcpAudit.unshift(auditEvent);
      state.mcpAudit = state.mcpAudit.slice(0, 500);
      auditTrail("mcp.revoke", { connectorId: connector.id });
      saveWithRetry();
      json(res, 200, { connector: { ...connector, status: "available" }, auditEvent, grants: state.mcpGrants.filter((grant) => grant.connectorId === connector.id) });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "GET:/mcp/audit": async (_req, res) => {
    json(res, 200, { events: state.mcpAudit.slice(0, 100), total: state.mcpAudit.length });
  },

  "GET:/mcp/microsoft/oauth/start": async (_req, res, parsed) => {
    const scopes = sanitizeMicrosoftScopes(parsed.searchParams.get("scopes") ?? "");
    const request = createMicrosoftAuthRequest({ scopes });
    json(res, 200, {
      provider: "microsoft-graph",
      connectorId: "microsoft-office",
      ...request,
    });
  },

  "POST:/mcp/microsoft/oauth/callback": async (req, res) => {
    try {
      const body = await readBody(req);
      const code = String(body?.code ?? "").trim();
      const stateValue = String(body?.state ?? "").trim();
      if (!code || !stateValue) {
        json(res, 400, { error: "code and state are required", faultCode: "CLWD-MCP-MS-1000" });
        return;
      }
      const exchanged = await exchangeMicrosoftGraphCode({ code, stateValue });
      if (!exchanged.ok) {
        json(res, exchanged.statusCode ?? 400, exchanged);
        return;
      }
      const connector = backendMcpConnectors.find((item) => item.id === "microsoft-office");
      const auditEvent = {
        id: randomId("mcp_audit"),
        action: "microsoft.oauth.callback",
        connectorId: "microsoft-office",
        scopeCount: exchanged.scopes.length,
        status: "active",
        createdAt: nowIso(),
      };
      const grant = {
        grantId: randomId("mcp_grant"),
        connectorId: "microsoft-office",
        provider: "microsoft-graph",
        status: "active",
        scopes: exchanged.scopes,
        issuedAt: nowIso(),
        expiresAt: exchanged.expiresAt,
        auditId: auditEvent.id,
        tokenStorage: "server-side-hashed-token-placeholder",
        accessTokenHash: exchanged.tokenHash,
        refreshTokenHash: exchanged.refreshTokenHash,
      };
      state.mcpGrants = [
        grant,
        ...state.mcpGrants.map((item) => (item.connectorId === "microsoft-office" && item.status === "active" ? { ...item, status: "revoked", revokedAt: nowIso() } : item)),
      ].slice(0, 500);
      state.mcpAudit.unshift(auditEvent);
      state.mcpAudit = state.mcpAudit.slice(0, 500);
      auditTrail("mcp.microsoft.oauth.callback", { connectorId: "microsoft-office", scopeCount: exchanged.scopes.length });
      saveWithRetry();
      json(res, 200, { connector: { ...connector, status: "connected" }, grant });
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "POST:/mcp/microsoft/oauth/revoke": async (_req, res) => {
    const timestamp = nowIso();
    state.mcpGrants = state.mcpGrants.map((grant) =>
      grant.connectorId === "microsoft-office" && grant.status === "active" ? { ...grant, status: "revoked", revokedAt: timestamp } : grant,
    );
    const auditEvent = {
      id: randomId("mcp_audit"),
      action: "microsoft.oauth.revoke",
      connectorId: "microsoft-office",
      status: "revoked",
      createdAt: timestamp,
    };
    state.mcpAudit.unshift(auditEvent);
    state.mcpAudit = state.mcpAudit.slice(0, 500);
    auditTrail("mcp.microsoft.oauth.revoke", { connectorId: "microsoft-office" });
    saveWithRetry();
    json(res, 200, { revoked: true, connectorId: "microsoft-office", auditEvent });
  },

  "POST:/diagnostics/create-report": async (req, res) => {
    try {
      const body = await readBody(req);
      const legalConsentSource = body?.legalConsentSummary;
      const legalConsentSummary =
        legalConsentSource && typeof legalConsentSource === "object"
          ? {
              version: String(legalConsentSource.version ?? "").slice(0, 80),
              acceptedAt: String(legalConsentSource.acceptedAt ?? "").slice(0, 40),
              documentHash: String(legalConsentSource.documentHash ?? "").slice(0, 96),
              documents: Array.isArray(legalConsentSource.documents)
                ? legalConsentSource.documents.map(String).slice(0, 10)
                : [],
            }
          : undefined;
      const report = {
        reportId: randomId("diag"),
        faultCode: String(body?.faultCode ?? "CLWD-UI-5000"),
        createdAt: nowIso(),
        appVersion: String(body?.appVersion ?? "0.5.0"),
        systemSummary: {
          os: os.version(),
          arch: os.arch(),
          platform: os.platform(),
          memoryMbBucket: `${Math.round(os.totalmem() / 1024 / 1024 / 512)}-512`,
          cpuModel: os.cpus()[0]?.model ?? "unknown",
          diskApprox: "unknown",
        },
        licenseSummary: { kind: "unknown" },
        gatewaySummary: { stateCount: state.licenses.length },
        recentErrors: state.audit.slice(0, 10),
        redactionStatus: "redacted",
        legalConsentSummary,
        userDescription: body?.userDescription ? String(body.userDescription).slice(0, 400) : "",
      };
      state.diagnostics.unshift(report);
      if (state.diagnostics.length > 200) state.diagnostics.length = 200;
      auditTrail("diagnostics.create", { reportId: report.reportId, faultCode: report.faultCode });
      saveWithRetry();
      json(res, 200, report);
    } catch {
      json(res, 400, { error: "Invalid JSON" });
    }
  },

  "GET:/machine/fingerprint": async (_req, res) => {
    json(res, 200, fingerprint());
  },

  "GET:/legal/documents": async (_req, res) => {
    json(res, 200, {
      documents: [
        {
          id: "installer-terms",
          title: "安裝與使用同意條款",
          summary: "安裝、啟動、註冊、登入或使用 ClawDesk 前，使用者需同意 EULA、隱私、訂閱、授權與第三方 NOTICE。",
          details: ["條款檔打包於 app resources：legal/INSTALLER_TERMS.md。", "正式商業發行前需由律師依銷售地區審閱。"],
        },
        {
          id: "commercial-license",
          title: "ClawDesk 商業授權",
          summary: "ClawDesk 由 Alisonsoftware 開發；GUI、記憶、Agent、授權、模仿學習與商業功能採閉源商業授權。",
          details: ["開發者顯示名稱：Alisonsoftware。", "開發者型態：個人開發者，非公司、法人、合夥或代理商名稱。", "聯絡信箱：huangkuoling@gmail.com。"],
        },
        {
          id: "individual-developer-disclosure",
          title: "個人開發者揭露",
          summary: "Alisonsoftware 是個人開發者顯示名稱；正式銷售渠道若要求 trader / seller / developer contact information，需另行揭露必要資料。",
          details: [
            "一般支援、授權啟用、故障回報、隱私詢問與商業合作可先透過 huangkuoling@gmail.com 聯絡。",
            "付款、稅務、收據、退款與拒付由 Lemon Squeezy 作為 Merchant of Record 依其流程處理。",
            "ClawDesk 不直接處理信用卡資料，也不在桌面端保存付款帳號明文。",
          ],
        },
        {
          id: "subscription-compliance",
          title: "訂閱、自動續費與取消揭露",
          summary: "訂閱方案需在購買與安裝前揭露價格、續費週期、取消入口、退款規則與適用消費者權利。",
          sourceUrl: "https://www.ftc.gov/business-guidance/blog/2024/10/click-cancel-ftcs-amended-negative-option-rule-what-it-means-your-business",
        },
        {
          id: "openclaw-compatible",
          title: "OpenClaw-compatible 聲明",
          summary: "ClawDesk 以 OpenClaw-compatible 桌面 Agent 定位，不主張上游 OpenClaw 商標或所有權。",
        },
        {
          id: "openclaw-mit-notice",
          title: "OpenClaw MIT 開源說明與重製版權",
          summary: "若 ClawDesk 複製、改作或散布 OpenClaw MIT 程式碼，必須保留 MIT 授權文字與上游 copyright notice。",
          sourceUrl: "https://opensource.org/license/mit",
        },
        {
          id: "user-content-rights",
          title: "使用者內容權利",
          summary: "使用者保留輸入、上傳檔案、專案資料與 AI 輸出內容權利；ClawDesk 不主張使用者內容所有權。",
        },
        {
          id: "privacy",
          title: "隱私與診斷",
          summary: "診斷包不含聊天內容、完整路徑、完整金鑰、API key、Email 或螢幕截圖，送出前需要使用者確認。",
        },
      ],
    });
  },

  "GET:/legal/notices": async (_req, res) => {
    json(res, 200, {
      notices: [
        {
          package: "OpenClaw",
          license: "MIT",
          purpose: "OpenClaw-compatible 參考；若重製上游程式碼，需保留 upstream copyright 與 MIT notice",
        },
        { package: "Tauri", license: "MIT / Apache-2.0", purpose: "桌面 shell" },
        { package: "React", license: "MIT", purpose: "使用者介面" },
        { package: "Vite", license: "MIT", purpose: "前端建置" },
        { package: "Lemon Squeezy", license: "Commercial SaaS", purpose: "正式版金流與稅務，MVP 使用 mock" },
        { package: "Keygen", license: "Commercial SaaS", purpose: "正式版授權管控，MVP 使用 mock" },
      ],
    });
  },
};

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, baseUrl);
  const pathname = parsed.pathname;
  const key = `${req.method}:${pathname}`;
  const handler = handlers[key];
  if (!handler) {
    json(res, 404, { error: "Not found", path: pathname });
    return;
  }
  await handler(req, res, parsed);
});

await loadState();

server.listen(port, host, () => {
  console.log(`ClawDesk backend simulator 已啟動：${baseUrl}`);
});

process.on("SIGINT", async () => {
  await saveState();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await saveState();
  process.exit(0);
});
