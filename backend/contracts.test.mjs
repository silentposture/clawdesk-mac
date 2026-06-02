import { describe, expect, it } from "vitest";
import {
  BACKEND_CONTRACT,
  BACKEND_CONTRACT_VERSION,
  createBackendHealthPayload,
  mapKeygenEventToLicenseMutation,
  mapLemonSqueezyEventToLicenseMutation,
  summarizeProductionEnv,
  validateBackendContractShape,
} from "./contracts.mjs";

describe("production backend contract", () => {
  it("declares the required Lemon Squeezy, Keygen, identity, and gateway adapters", () => {
    const validation = validateBackendContractShape(BACKEND_CONTRACT);
    const endpointKeys = BACKEND_CONTRACT.endpoints.map((endpoint) => `${endpoint.method}:${endpoint.path}`);

    expect(validation.ok).toBe(true);
    expect(BACKEND_CONTRACT.version).toBe(BACKEND_CONTRACT_VERSION);
    expect(endpointKeys).toContain("GET:/health");
    expect(endpointKeys).toContain("GET:/contract");
    expect(endpointKeys).toContain("POST:/api/license/activate");
    expect(endpointKeys).toContain("POST:/api/license/validate");
    expect(endpointKeys).toContain("GET:/api/license/public-keys");
    expect(endpointKeys).toContain("GET:/api/account/entitlements");
    expect(endpointKeys).toContain("POST:/api/webhooks/lemonsqueezy");
    expect(endpointKeys).toContain("POST:/licenses/activate-key");
    expect(endpointKeys).toContain("POST:/webhooks/keygen");
    expect(endpointKeys).toContain("GET:/updates/manifest");
    expect(endpointKeys).toContain("POST:/mcp/revoke");
    expect(endpointKeys).toContain("GET:/mcp/microsoft/oauth/start");
    expect(endpointKeys).toContain("POST:/mcp/microsoft/oauth/callback");
  });

  it("maps Lemon Squeezy webhook events to deterministic license mutations", () => {
    expect(mapLemonSqueezyEventToLicenseMutation("order_created")).toMatchObject({
      status: "active",
      issueLicense: true,
    });
    expect(mapLemonSqueezyEventToLicenseMutation("subscription_payment_failed")).toMatchObject({
      status: "past-due",
    });
    expect(mapLemonSqueezyEventToLicenseMutation("order_refunded")).toMatchObject({
      status: "revoked",
    });
    expect(mapLemonSqueezyEventToLicenseMutation("unknown.event")).toBeNull();
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
      LEMON_SQUEEZY_API_KEY: "ls_api_secret",
    });

    expect(summary.ready).toBe(false);
    expect(summary.required.find((item) => item.name === "LEMON_SQUEEZY_API_KEY")).toEqual({
      name: "LEMON_SQUEEZY_API_KEY",
      present: true,
    });
    expect(JSON.stringify(summary)).not.toContain("ls_api_secret");
  });

  it("includes contract metadata in health payloads", () => {
    const payload = createBackendHealthPayload({
      port: 19090,
      now: "2026-05-13T00:00:00.000Z",
      metrics: { accounts: 1, activeSessions: 1, licenses: 1 },
      env: {},
    });

    expect(payload.contractVersion).toBe(BACKEND_CONTRACT_VERSION);
    expect(payload.paymentProvider).toBe("lemon-squeezy");
    expect(payload.licenseProvider).toBe("keygen");
    expect(payload.productionEnv.ready).toBe(false);
  });
});
