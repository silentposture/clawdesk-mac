export type PaymentProvider = "paddle";
export type LicenseProvider = "keygen";
export type FutureCommercialProvider = "lemon-squeezy-compatible";

export type LicensePlan =
  | "free-trial"
  | "monthly"
  | "yearly"
  | "lifetime"
  | "early-bird"
  | "update-maintenance"
  | "hobby"
  | "pro-monthly"
  | "pro-yearly"
  | "lifetime-local"
  | "team"
  | "enterprise"
  | "byok-managed";

export type LicenseStatusType =
  | "free"
  | "trial"
  | "active"
  | "past-due"
  | "canceled"
  | "offline-grace"
  | "tampered"
  | "revoked";

export interface PricingPlan {
  id: LicensePlan;
  name: string;
  priceUsd: number;
  cadence: "trial" | "free" | "monthly" | "yearly" | "one-time" | "maintenance" | "contract";
  description: string;
}

export interface CommercialPlan extends PricingPlan {
  paymentProvider: PaymentProvider;
  licenseProvider: LicenseProvider;
  futureProvider: FutureCommercialProvider;
  entitlement: string[];
  supportUpdatesMonths?: number;
  positioning: "desktop-ai-work-platform";
}

export interface EncryptedLicenseKey {
  keyId: string;
  encodedKey: string;
  signatureStatus: "valid" | "invalid" | "missing";
  payloadHash: string;
  plan: LicensePlan;
  status: LicenseStatusType;
  supportUpdatesUntil: string;
  expiresAt?: string;
  deviceLimit: number;
}

export interface MachineFingerprint {
  fingerprintHash: string;
  hardwareSources: string[];
  platform: "macOS" | "Windows" | "Linux" | "unknown";
  confidence: number;
  createdAt: string;
}

export interface MachineActivation {
  machineId: string;
  fingerprintHash: string;
  deviceName: string;
  platform: string;
  activatedAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface LicenseTamperEvent {
  eventId: string;
  reason: string;
  detectedAt: string;
  localAction: "downgrade-to-hobby" | "clear-offline-ticket";
  serverAction: "report-to-keygen" | "manual-review";
  faultCode: string;
}

export interface LicenseStatus {
  paymentProvider: PaymentProvider;
  licenseProvider: LicenseProvider;
  plan: LicensePlan;
  status: LicenseStatusType;
  seats: number;
  supportUpdatesUntil: string;
  eligibleLatestVersion: string;
  offlineGraceUntil?: string;
  features: string[];
  deviceLimit: number;
  machines: MachineActivation[];
  lastValidationCode?: string;
}

export const commercialPlans: CommercialPlan[] = [
  {
    id: "free-trial",
    name: "Free Trial",
    priceUsd: 0,
    cadence: "trial",
    description: "本機安全沙盒、手動授權與基本桌面工作流試用。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["safe-mode", "local-chat", "manual-permissions"],
    positioning: "desktop-ai-work-platform",
  },
  {
    id: "monthly",
    name: "Monthly",
    priceUsd: 9,
    cadence: "monthly",
    description: "桌面 AI 工作平台月繳方案；不販售模型算力，模型由使用者帳號或 API 供應。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["pro-agent", "mcp-connectors", "workflow-builder", "local-memory"],
    positioning: "desktop-ai-work-platform",
  },
  {
    id: "yearly",
    name: "Yearly",
    priceUsd: 79,
    cadence: "yearly",
    description: "桌面 AI 工作平台年繳方案，含支援更新資格。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["pro-agent", "mcp-connectors", "workflow-builder", "local-memory", "priority-updates"],
    positioning: "desktop-ai-work-platform",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    priceUsd: 99,
    cadence: "one-time",
    description: "永久本機功能，含 12 個月支援更新；到期後仍可用最後符合資格版本。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["pro-agent", "mcp-connectors", "workflow-builder", "local-memory", "offline-grace"],
    supportUpdatesMonths: 12,
    positioning: "desktop-ai-work-platform",
  },
  {
    id: "early-bird",
    name: "Early Bird",
    priceUsd: 69,
    cadence: "one-time",
    description: "早鳥一次買斷名額，適合 side-project 商業 Beta 內測。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["pro-agent", "mcp-connectors", "workflow-builder", "local-memory", "beta-feedback"],
    supportUpdatesMonths: 12,
    positioning: "desktop-ai-work-platform",
  },
  {
    id: "update-maintenance",
    name: "Update Maintenance",
    priceUsd: 29,
    cadence: "maintenance",
    description: "買斷版支援更新續費，延長可安裝新版本資格一年。",
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    futureProvider: "lemon-squeezy-compatible",
    entitlement: ["priority-updates", "support-updates"],
    supportUpdatesMonths: 12,
    positioning: "desktop-ai-work-platform",
  },
];

export const pricingPlans: PricingPlan[] = commercialPlans;

export function normalizeKeygenKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isMockKeygenKey(input: string): boolean {
  return /^CLWD-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalizeKeygenKey(input));
}

export function createMockMachineFingerprint(now = new Date().toISOString()): MachineFingerprint {
  return {
    fingerprintHash: "mfp_salted_mock_mac_m4_a9d2",
    hardwareSources: ["hardware-uuid", "platform-serial", "cpu-brand", "cpu-architecture"],
    platform: "macOS",
    confidence: 0.86,
    createdAt: now,
  };
}

export function createMockLicensePayload(encodedKey: string, now = new Date().toISOString()): EncryptedLicenseKey {
  const normalized = normalizeKeygenKey(encodedKey);
  const plan: LicensePlan = normalized.includes("LIFE") ? "lifetime" : normalized.includes("TEAM") ? "team" : "yearly";
  const supportUpdatesUntil = "2027-05-12";
  return {
    keyId: `kg_${normalized.slice(5, 10).toLowerCase()}`,
    encodedKey: normalized,
    signatureStatus: isMockKeygenKey(normalized) ? "valid" : "invalid",
    payloadHash: `sha256:${normalized.slice(-5).toLowerCase()}-${plan}`,
    plan,
    status: normalized.includes("REVOK") ? "revoked" : isMockKeygenKey(normalized) ? "active" : "tampered",
    supportUpdatesUntil,
    expiresAt: plan === "lifetime" ? undefined : "2027-05-12",
    deviceLimit: plan === "team" ? 10 : 3,
  };
}

export function activateMockLicense(
  encodedKey: string,
  fingerprint: MachineFingerprint,
  existingMachines: MachineActivation[] = [],
  now = new Date().toISOString(),
): LicenseStatus {
  const payload = createMockLicensePayload(encodedKey, now);

  if (payload.signatureStatus !== "valid" || payload.status === "revoked") {
    return createFreeStatus(payload.status === "revoked" ? "KEYGEN_REVOKED" : "KEYGEN_INVALID_SIGNATURE");
  }

  const activeMachines = existingMachines.filter((machine) => !machine.revokedAt);
  const alreadyActive = activeMachines.some((machine) => machine.fingerprintHash === fingerprint.fingerprintHash);
  if (!alreadyActive && activeMachines.length >= payload.deviceLimit) {
    return createFreeStatus("KEYGEN_MACHINE_LIMIT_EXCEEDED");
  }

  const machine: MachineActivation = {
    machineId: `mac_${fingerprint.fingerprintHash.slice(-8)}`,
    fingerprintHash: fingerprint.fingerprintHash,
    deviceName: "Mac Apple Silicon",
    platform: "macOS arm64",
    activatedAt: now,
    lastSeenAt: now,
  };

  const machines = alreadyActive ? existingMachines : [...existingMachines, machine];
  return {
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    plan: payload.plan,
    status: "active",
    seats: payload.plan === "team" ? 10 : 1,
    supportUpdatesUntil: payload.supportUpdatesUntil,
    eligibleLatestVersion: "1.4.0",
    offlineGraceUntil: "2026-06-11",
    features: ["pro-agent", "local-memory", "workflow-builder", "mcp-connectors", "diagnostics"],
    deviceLimit: payload.deviceLimit,
    machines,
    lastValidationCode: "KEYGEN_VALID",
  };
}

export function createFreeStatus(validationCode = "HOBBY_MODE"): LicenseStatus {
  return {
    paymentProvider: "paddle",
    licenseProvider: "keygen",
    plan: "free-trial",
    status: validationCode.includes("TAMPER") ? "tampered" : validationCode.includes("REVOK") ? "revoked" : "free",
    seats: 1,
    supportUpdatesUntil: "2026-05-12",
    eligibleLatestVersion: "1.0.0",
    features: ["safe-mode", "local-chat", "manual-permissions"],
    deviceLimit: 1,
    machines: [],
    lastValidationCode: validationCode,
  };
}

export function detectLicenseTamper(original: EncryptedLicenseKey, candidate: EncryptedLicenseKey, now = new Date().toISOString()): LicenseTamperEvent | null {
  const protectedFields: Array<keyof EncryptedLicenseKey> = ["payloadHash", "plan", "supportUpdatesUntil", "expiresAt", "deviceLimit", "signatureStatus"];
  const changedField = protectedFields.find((field) => original[field] !== candidate[field]);
  if (!changedField) return null;

  return {
    eventId: `tamper-${Date.parse(now) || 0}`,
    reason: `受保護授權欄位被修改：${changedField}`,
    detectedAt: now,
    localAction: "downgrade-to-hobby",
    serverAction: "report-to-keygen",
    faultCode: "CLWD-LIC-1001",
  };
}

export function canInstallLatestVersion(status: LicenseStatus, latestReleasedAt: string): boolean {
  if (status.status !== "active" && status.status !== "offline-grace") return false;
  return Date.parse(status.supportUpdatesUntil) >= Date.parse(latestReleasedAt);
}
