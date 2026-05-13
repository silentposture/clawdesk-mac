import { describe, expect, it } from "vitest";
import {
  activateMockLicense,
  canInstallLatestVersion,
  commercialPlans,
  createMockLicensePayload,
  createMockMachineFingerprint,
  detectLicenseTamper,
  isMockKeygenKey,
} from "./licensing";

describe("Paddle + Keygen licensing", () => {
  it("exposes v0.2 side-project commercial pricing without selling model compute", () => {
    const prices = Object.fromEntries(commercialPlans.map((plan) => [plan.id, plan.priceUsd]));

    expect(prices).toMatchObject({
      "free-trial": 0,
      monthly: 9,
      yearly: 79,
      lifetime: 99,
      "early-bird": 69,
      "update-maintenance": 29,
    });
    expect(commercialPlans.every((plan) => plan.paymentProvider === "paddle")).toBe(true);
    expect(commercialPlans.every((plan) => plan.licenseProvider === "keygen")).toBe(true);
    expect(commercialPlans.every((plan) => plan.positioning === "desktop-ai-work-platform")).toBe(true);
    expect(commercialPlans.find((plan) => plan.id === "monthly")?.description).toContain("不販售模型算力");
  });

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
