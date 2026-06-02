import { describe, expect, it } from "vitest";
import { buildVersionSummary } from "./version";

describe("version summary", () => {
  it("uses deterministic local defaults", () => {
    expect(buildVersionSummary({})).toEqual({
      productName: "ClawDesk",
      developer: "Alisonsoftware",
      developerType: "個人開發者",
      contactEmail: "huangkuoling@gmail.com",
      compatibility: "OpenClaw-compatible desktop agent",
      version: "0.1.0",
      buildId: "dev-local",
      releaseChannel: "mock-candidate",
    });
  });

  it("accepts build-time overrides", () => {
    expect(
      buildVersionSummary({
        VITE_CLAWDESK_VERSION: "1.2.3",
        VITE_CLAWDESK_BUILD_ID: "build-789",
        VITE_CLAWDESK_RELEASE_CHANNEL: "production",
      }),
    ).toMatchObject({
      version: "1.2.3",
      buildId: "build-789",
      releaseChannel: "production",
    });
  });
});
