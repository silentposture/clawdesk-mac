export type PaymentProvider = "paddle";
export type LicenseProvider = "keygen";

export type LicensePlan = "hobby" | "pro-monthly" | "pro-yearly" | "lifetime-local" | "team" | "enterprise" | "byok-managed";

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
  cadence: "free" | "monthly" | "yearly" | "one-time" | "contract";
  description: string;
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

export const pricingPlans: PricingPlan[] = [
  { id: "hobby", name: "Hobby", priceUsd: 0, cadence: "free", description: "本機基礎功能與安全沙盒。" },
  { id: "pro-monthly", name: "Pro Monthly", priceUsd: 19, cadence: "monthly", description: "個人完整桌面 Agent，每月訂閱。" },
  { id: "pro-yearly", name: "Pro Yearly", priceUsd: 190, cadence: "yearly", description: "個人完整桌面 Agent，年繳優惠。" },
  { id: "lifetime-local", name: "Lifetime Local", priceUsd: 249, cadence: "one-time", description: "永久本機 Pro，含 12 個月支援更新。" },
  { id: "team", name: "Team", priceUsd: 40, cadence: "monthly", description: "多人協作與座席管理，按人計費。" },
  { id: "enterprise", name: "Enterprise", priceUsd: 50000, cadence: "contract", description: "企業合約、稽核與私有部署支援。" },
  { id: "byok-managed", name: "BYOK Managed", priceUsd: 30, cadence: "monthly", description: "自帶金鑰的受管執行個體。" },
];

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
  const plan: LicensePlan = normalized.includes("LIFE") ? "lifetime-local" : normalized.includes("TEAM") ? "team" : "pro-yearly";
  const supportUpdatesUntil = plan === "lifetime-local" ? "2027-05-12" : "2027-05-12";
  return {
    keyId: `kg_${normalized.slice(5, 10).toLowerCase()}`,
    encodedKey: normalized,
    signatureStatus: isMockKeygenKey(normalized) ? "valid" : "invalid",
    payloadHash: `sha256:${normalized.slice(-5).toLowerCase()}-${plan}`,
    plan,
    status: normalized.includes("REVOK") ? "revoked" : isMockKeygenKey(normalized) ? "active" : "tampered",
    supportUpdatesUntil,
    expiresAt: plan === "lifetime-local" ? undefined : "2027-05-12",
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
    plan: "hobby",
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
