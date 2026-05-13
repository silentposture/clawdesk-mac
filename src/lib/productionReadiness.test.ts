import { describe, expect, it } from "vitest";
import { buildProductionReadinessView } from "./productionReadiness";

describe("production readiness view", () => {
  it("keeps mock candidate warnings when no production health exists", () => {
    const view = buildProductionReadinessView();

    expect(view.summary.overall).toBe("mock-candidate-ready");
    expect(view.matrix.find((item) => item.id === "paddle")?.status).toBe("warning");
  });

  it("marks provider env groups ready from backend health without exposing values", () => {
    const view = buildProductionReadinessView(
      { mode: "external", baseUrl: "https://gateway.example.com", wsUrl: "wss://gateway.example.com/events" },
      {
        mode: "external-production-sim",
        backend: {
          productionEnv: {
            required: [
              { name: "PADDLE_API_KEY", present: true },
              { name: "PADDLE_WEBHOOK_SECRET", present: true },
              { name: "KEYGEN_ACCOUNT_ID", present: true },
              { name: "KEYGEN_PRODUCT_ID", present: true },
              { name: "KEYGEN_API_TOKEN", present: true },
              { name: "KEYGEN_SIGNING_PUBLIC_KEY", present: true },
              { name: "CLAWDESK_SSO_ISSUER_URL", present: false },
              { name: "CLAWDESK_SSO_CLIENT_ID", present: false },
            ],
            missing: ["CLAWDESK_SSO_ISSUER_URL", "CLAWDESK_SSO_CLIENT_ID"],
            ready: false,
          },
        },
      },
    );

    expect(view.matrix.find((item) => item.id === "production-gateway")?.status).toBe("ready");
    expect(view.matrix.find((item) => item.id === "paddle")?.status).toBe("ready");
    expect(view.matrix.find((item) => item.id === "keygen")?.status).toBe("ready");
    expect(view.matrix.find((item) => item.id === "sso")?.status).toBe("warning");
    expect(view.missingProductionEnv).toEqual(["CLAWDESK_SSO_ISSUER_URL", "CLAWDESK_SSO_CLIENT_ID"]);
  });
});
