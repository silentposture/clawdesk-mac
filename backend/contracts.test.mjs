import { describe, expect, it } from "vitest";
import {
  BACKEND_CONTRACT,
  BACKEND_CONTRACT_VERSION,
  createBackendHealthPayload,
  mapKeygenEventToLicenseMutation,
  mapPaddleEventToLicenseMutation,
  summarizeProductionEnv,
  validateBackendContractShape,
} from "./contracts.mjs";

describe("production backend contract", () => {
  it("declares the required Paddle, Keygen, identity, and gateway adapters", () => {
    const validation = validateBackendContractShape(BACKEND_CONTRACT);
    const endpointKeys = BACKEND_CONTRACT.endpoints.map((endpoint) => `${endpoint.method}:${endpoint.path}`);

    expect(validation.ok).toBe(true);
    expect(BACKEND_CONTRACT.version).toBe(BACKEND_CONTRACT_VERSION);
    expect(endpointKeys).toContain("GET:/health");
    expect(endpointKeys).toContain("GET:/contract");
    expect(endpointKeys).toContain("POST:/licenses/activate-key");
    expect(endpointKeys).toContain("POST:/webhooks/paddle");
    expect(endpointKeys).toContain("POST:/webhooks/keygen");
  });

  it("maps supported Paddle webhook events to deterministic license mutations", () => {
    expect(mapPaddleEventToLicenseMutation("payment_succeeded")).toMatchObject({
      status: "active",
      refreshSupportUpdatesUntil: true,
    });
    expect(mapPaddleEventToLicenseMutation("subscription.canceled")).toMatchObject({
      status: "canceled",
    });
    expect(mapPaddleEventToLicenseMutation("unknown.event")).toBeNull();
  });

  it("maps supported Keygen webhook events to deterministic license mutations", () => {
    expect(mapKeygenEventToLicenseMutation("license.revoked")).toMatchObject({
      signatureStatus: "revoked",
      status: "revoked",
    });
    expect(mapKeygenEventToLicenseMutation("machine.reset")).toMatchObject({
      increaseDeviceLimit: 1,
    });
    expect(mapKeygenEventToLicenseMutation("unknown.event")).toBeNull();
  });

  it("reports production env readiness without exposing secret values", () => {
    const summary = summarizeProductionEnv({
      CLAWDESK_GATEWAY_BASE_URL: "https://gateway.example.test",
      PADDLE_API_KEY: "pdl_secret",
    });

    expect(summary.ready).toBe(false);
    expect(summary.required.find((item) => item.name === "PADDLE_API_KEY")).toEqual({
      name: "PADDLE_API_KEY",
      present: true,
    });
    expect(JSON.stringify(summary)).not.toContain("pdl_secret");
  });

  it("includes contract metadata in health payloads", () => {
    const payload = createBackendHealthPayload({
      port: 19090,
      now: "2026-05-13T00:00:00.000Z",
      metrics: { accounts: 1, activeSessions: 1, licenses: 1 },
      env: {},
    });

    expect(payload.contractVersion).toBe(BACKEND_CONTRACT_VERSION);
    expect(payload.paymentProvider).toBe("paddle");
    expect(payload.licenseProvider).toBe("keygen");
    expect(payload.productionEnv.ready).toBe(false);
  });
});
