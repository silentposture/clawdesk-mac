export const BACKEND_CONTRACT_VERSION = "2026-05-13.production-adapter.v1";

export const PAYMENT_PROVIDER = "lemon-squeezy";
export const LICENSE_PROVIDER = "keygen";

export const PRODUCTION_REQUIRED_ENV = [
  "CLAWDESK_GATEWAY_BASE_URL",
  "LEMON_SQUEEZY_API_KEY",
  "LEMON_SQUEEZY_WEBHOOK_SECRET",
  "LEMON_SQUEEZY_STORE_ID",
  "KEYGEN_ACCOUNT_ID",
  "KEYGEN_PRODUCT_ID",
  "KEYGEN_API_TOKEN",
  "KEYGEN_SIGNING_PUBLIC_KEY",
  "CLAWDESK_SSO_ISSUER_URL",
  "CLAWDESK_SSO_CLIENT_ID",
  "MICROSOFT_GRAPH_TENANT_ID",
  "MICROSOFT_GRAPH_CLIENT_ID",
  "MICROSOFT_GRAPH_CLIENT_SECRET",
  "MICROSOFT_GRAPH_REDIRECT_URI",
];

export const BACKEND_ENDPOINT_CONTRACT = [
  { method: "GET", path: "/health", adapter: "gateway", purpose: "service health and contract version" },
  { method: "GET", path: "/contract", adapter: "gateway", purpose: "production adapter interface manifest" },
  { method: "GET", path: "/machine/fingerprint", adapter: "keygen", purpose: "salted machine fingerprint summary" },
  { method: "POST", path: "/api/auth/register", adapter: "identity", purpose: "NaviaWorks account registration" },
  { method: "GET", path: "/api/auth/verify-email", adapter: "identity", purpose: "email verification via query token" },
  { method: "POST", path: "/api/auth/verify-email", adapter: "identity", purpose: "email verification via JSON body" },
  { method: "POST", path: "/api/auth/login", adapter: "identity", purpose: "password login" },
  { method: "GET", path: "/api/auth/me", adapter: "identity", purpose: "session lookup and account state" },
  { method: "POST", path: "/api/auth/logout", adapter: "identity", purpose: "session revocation" },
  { method: "POST", path: "/api/auth/password/forgot", adapter: "identity", purpose: "password reset request without account enumeration" },
  { method: "POST", path: "/api/auth/password/reset", adapter: "identity", purpose: "password reset confirmation" },
  { method: "GET", path: "/api/account/entitlements", adapter: "identity", purpose: "canonical entitlement truth query" },
  { method: "GET", path: "/api/license/public-keys", adapter: "keygen", purpose: "NaviaWorks public key ring for certificate verification" },
  { method: "POST", path: "/api/license/activate", adapter: "keygen", purpose: "canonical license activation and machine binding" },
  { method: "POST", path: "/api/license/validate", adapter: "keygen", purpose: "canonical certificate and machine validation" },
  { method: "POST", path: "/api/license/deactivate", adapter: "keygen", purpose: "canonical device deactivation" },
  { method: "POST", path: "/api/license/refresh-certificate", adapter: "keygen", purpose: "canonical signed certificate refresh" },
  { method: "GET", path: "/api/license/me", adapter: "keygen", purpose: "current license and entitlement summary" },
  { method: "POST", path: "/api/webhooks/lemonsqueezy", adapter: "lemon-squeezy", purpose: "canonical Lemon Squeezy webhook ingress" },
  { method: "POST", path: "/api/payment/newebpay/notify", adapter: "payment", purpose: "NewebPay compatibility placeholder endpoint" },
  { method: "POST", path: "/licenses/activate-key", adapter: "keygen", purpose: "license activation and machine binding" },
  { method: "POST", path: "/licenses/validate", adapter: "keygen", purpose: "offline ticket validation and tamper detection" },
  { method: "POST", path: "/licenses/refresh-offline-ticket", adapter: "keygen", purpose: "signed offline license refresh" },
  { method: "POST", path: "/licenses/report-tamper", adapter: "keygen", purpose: "tamper event relay" },
  { method: "GET", path: "/license/status", adapter: "keygen", purpose: "license status summary" },
  { method: "POST", path: "/api/payment/lemonsqueezy/webhook", adapter: "lemon-squeezy", purpose: "legacy Canonical Lemon Squeezy webhook alias" },
  { method: "POST", path: "/webhooks/lemon-squeezy", adapter: "lemon-squeezy", purpose: "payment, license key issue and subscription webhook ingress" },
  { method: "POST", path: "/webhooks/keygen", adapter: "keygen", purpose: "license and machine webhook ingress" },
  { method: "GET", path: "/updates/check", adapter: "updates", purpose: "support entitlement and release metadata" },
  { method: "GET", path: "/updates/manifest", adapter: "updates", purpose: "release manifest, macOS downloads and support eligibility" },
  { method: "GET", path: "/updates/history", adapter: "updates", purpose: "release history" },
  { method: "GET", path: "/mcp/connectors", adapter: "mcp", purpose: "connector catalog with scopes and protocols" },
  { method: "POST", path: "/mcp/connect", adapter: "mcp", purpose: "connector authorization grant creation" },
  { method: "POST", path: "/mcp/revoke", adapter: "mcp", purpose: "connector authorization revocation" },
  { method: "GET", path: "/mcp/audit", adapter: "mcp", purpose: "connector audit trail" },
  { method: "GET", path: "/mcp/microsoft/oauth/start", adapter: "microsoft-graph", purpose: "Microsoft Graph OAuth authorization URL with PKCE" },
  { method: "POST", path: "/mcp/microsoft/oauth/callback", adapter: "microsoft-graph", purpose: "Microsoft Graph OAuth code exchange and grant registration" },
  { method: "POST", path: "/mcp/microsoft/oauth/revoke", adapter: "microsoft-graph", purpose: "Microsoft Graph local grant revocation and audit" },
  { method: "POST", path: "/auth/register", adapter: "identity", purpose: "legacy email account registration compatibility" },
  { method: "POST", path: "/auth/confirm", adapter: "identity", purpose: "legacy email verification confirmation compatibility" },
  { method: "POST", path: "/auth/login", adapter: "identity", purpose: "legacy password login compatibility" },
  { method: "POST", path: "/auth/sso/start", adapter: "identity", purpose: "SSO login handoff" },
  { method: "POST", path: "/auth/sso/finish", adapter: "identity", purpose: "SSO login callback finalization" },
  { method: "GET", path: "/auth/sso/providers", adapter: "identity", purpose: "available SSO providers" },
  { method: "GET", path: "/auth/session", adapter: "identity", purpose: "legacy session lookup compatibility" },
  { method: "POST", path: "/diagnostics/create-report", adapter: "diagnostics", purpose: "redacted diagnostic report creation" },
  { method: "GET", path: "/legal/documents", adapter: "legal", purpose: "installer/EULA/privacy documents" },
  { method: "GET", path: "/legal/notices", adapter: "legal", purpose: "third-party and OpenClaw MIT notices" },
];

export const BACKEND_CONTRACT = {
  version: BACKEND_CONTRACT_VERSION,
  paymentProvider: PAYMENT_PROVIDER,
  licenseProvider: LICENSE_PROVIDER,
  endpoints: BACKEND_ENDPOINT_CONTRACT,
  productionRequiredEnv: PRODUCTION_REQUIRED_ENV,
  adapterModes: ["mock", "production"],
};

const paddleEventMutations = {
  "subscription.created": { status: "active", refreshSupportUpdatesUntil: true },
  payment_succeeded: { status: "active", refreshSupportUpdatesUntil: true },
  renewed: { status: "active", refreshSupportUpdatesUntil: true },
  "subscription.canceled": { status: "canceled", refreshSupportUpdatesUntil: false },
  payment_failed: { status: "past-due", refreshSupportUpdatesUntil: false },
  "subscription.updated-failed": { status: "past-due", refreshSupportUpdatesUntil: false },
  refund_issued: { status: "revoked", refreshSupportUpdatesUntil: false },
  lifetime_purchased: { status: "active", refreshSupportUpdatesUntil: true, planHint: "lifetime-local" },
  support_renewed: { status: "active", refreshSupportUpdatesUntil: true },
};

const lemonSqueezyEventMutations = {
  order_created: { status: "active", refreshSupportUpdatesUntil: true, issueLicense: true },
  license_key_created: { status: "active", refreshSupportUpdatesUntil: true, issueLicense: true },
  subscription_created: { status: "active", refreshSupportUpdatesUntil: true, issueLicense: true },
  subscription_updated: { status: "active", refreshSupportUpdatesUntil: true },
  subscription_resumed: { status: "active", refreshSupportUpdatesUntil: true },
  subscription_payment_success: { status: "active", refreshSupportUpdatesUntil: true },
  subscription_payment_recovered: { status: "active", refreshSupportUpdatesUntil: true },
  subscription_payment_failed: { status: "past-due", refreshSupportUpdatesUntil: false },
  subscription_cancelled: { status: "canceled", refreshSupportUpdatesUntil: false },
  subscription_expired: { status: "revoked", refreshSupportUpdatesUntil: false },
  subscription_payment_refunded: { status: "revoked", refreshSupportUpdatesUntil: false },
  refund_created: { status: "revoked", refreshSupportUpdatesUntil: false },
  order_refunded: { status: "revoked", refreshSupportUpdatesUntil: false },
};

const keygenEventMutations = {
  "license.revoked": { signatureStatus: "revoked", status: "revoked" },
  "license.suspended": { signatureStatus: "invalid", status: "past-due" },
  "license.reinstated": { signatureStatus: "valid", status: "active" },
  "machine.reset": { increaseDeviceLimit: 1 },
};

export function mapPaddleEventToLicenseMutation(eventType) {
  return paddleEventMutations[String(eventType ?? "").trim()] ?? null;
}

export function mapLemonSqueezyEventToLicenseMutation(eventType) {
  return lemonSqueezyEventMutations[String(eventType ?? "").trim()] ?? null;
}

export function mapKeygenEventToLicenseMutation(eventType) {
  return keygenEventMutations[String(eventType ?? "").trim()] ?? null;
}

export function summarizeProductionEnv(env = process.env) {
  const required = PRODUCTION_REQUIRED_ENV.map((name) => ({ name, present: Boolean(env[name]) }));
  return {
    required,
    missing: required.filter((item) => !item.present).map((item) => item.name),
    ready: required.every((item) => item.present),
  };
}

export function createBackendHealthPayload({
  port,
  now,
  metrics,
  region = "local-mock",
  env = process.env,
  adapterMode = "mock",
  adapterReadiness,
}) {
  return {
    service: "ClawDesk License & Identity Simulator",
    version: "0.2.0",
    contractVersion: BACKEND_CONTRACT_VERSION,
    paymentProvider: PAYMENT_PROVIDER,
    licenseProvider: LICENSE_PROVIDER,
    adapterMode,
    adapterReadiness,
    region,
    port,
    now,
    metrics,
    productionEnv: summarizeProductionEnv(env),
  };
}

export function validateBackendContractShape(contract = BACKEND_CONTRACT) {
  const endpointKeys = new Set(contract.endpoints.map((endpoint) => `${endpoint.method}:${endpoint.path}`));
  const requiredEndpointKeys = [
    "GET:/health",
    "GET:/contract",
    "POST:/api/license/activate",
    "POST:/api/license/validate",
    "GET:/api/license/public-keys",
    "POST:/api/auth/register",
    "GET:/api/auth/me",
    "GET:/api/account/entitlements",
    "POST:/api/webhooks/lemonsqueezy",
    "POST:/webhooks/keygen",
    "GET:/updates/check",
    "GET:/updates/manifest",
    "GET:/mcp/microsoft/oauth/start",
  ];
  return {
    ok:
      contract.version === BACKEND_CONTRACT_VERSION &&
      contract.paymentProvider === PAYMENT_PROVIDER &&
      contract.licenseProvider === LICENSE_PROVIDER &&
      requiredEndpointKeys.every((key) => endpointKeys.has(key)),
    missingEndpoints: requiredEndpointKeys.filter((key) => !endpointKeys.has(key)),
  };
}
