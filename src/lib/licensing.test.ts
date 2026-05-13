import { describe, expect, it } from "vitest";
import {
  activateMockLicense,
  canInstallLatestVersion,
  createMockLicensePayload,
  createMockMachineFingerprint,
  detectLicenseTamper,
  isMockKeygenKey,
} from "./licensing";

describe("Paddle + Keygen licensing", () => {
  it("accepts a signed mock Keygen key and binds the current Mac", () => {
    const fingerprint = createMockMachineFingerprint("2026-05-12T00:00:00.000Z");
    const status = activateMockLicense("CLWD-PRO12-DEMO1-DEMO2-DEMO3", fingerprint, [], "2026-05-12T00:00:00.000Z");

    expect(isMockKeygenKey("CLWD-PRO12-DEMO1-DEMO2-DEMO3")).toBe(true);
    expect(status.paymentProvider).toBe("paddle");
    expect(status.licenseProvider).toBe("keygen");
    expect(status.status).toBe("active");
    expect(status.deviceLimit).toBe(3);
    expect(status.machines[0].fingerprintHash).toBe(fingerprint.fingerprintHash);
  });

  it("rejects invalid, revoked, and over-limit activations", () => {
    const fingerprint = createMockMachineFingerprint();
    expect(activateMockLicense("bad-key", fingerprint).status).toBe("free");
    expect(activateMockLicense("CLWD-REVOK-DEMO1-DEMO2-DEMO3", fingerprint).status).toBe("revoked");

    const full = Array.from({ length: 3 }, (_, index) => ({
      machineId: `old-${index}`,
      fingerprintHash: `old-hash-${index}`,
      deviceName: `Old Mac ${index}`,
      platform: "macOS arm64",
      activatedAt: "2026-05-12T00:00:00.000Z",
      lastSeenAt: "2026-05-12T00:00:00.000Z",
    }));
    expect(activateMockLicense("CLWD-PRO12-DEMO1-DEMO2-DEMO3", fingerprint, full).lastValidationCode).toBe("KEYGEN_MACHINE_LIMIT_EXCEEDED");
  });

  it("detects tampering of signed license fields", () => {
    const original = createMockLicensePayload("CLWD-PRO12-DEMO1-DEMO2-DEMO3");
    const tampered = { ...original, supportUpdatesUntil: "2099-01-01" };

    const event = detectLicenseTamper(original, tampered, "2026-05-12T00:00:00.000Z");
    expect(event?.faultCode).toBe("CLWD-LIC-1001");
    expect(event?.localAction).toBe("downgrade-to-hobby");
  });

  it("uses support update expiry to decide whether the latest version can install", () => {
    const status = activateMockLicense("CLWD-PRO12-DEMO1-DEMO2-DEMO3", createMockMachineFingerprint());
    expect(canInstallLatestVersion(status, "2027-01-01")).toBe(true);
    expect(canInstallLatestVersion(status, "2028-01-01")).toBe(false);
  });
});
