import { describe, expect, it } from "vitest";
import {
  buildDeploymentConsoleSnapshot,
  summarizeDeploymentChecks,
  type DeploymentCheck,
} from "./deploymentConsole";

describe("deployment console", () => {
  it("builds a safe snapshot without secret values", () => {
    const snapshot = buildDeploymentConsoleSnapshot({
      health: {
        ok: true,
        mode: "external-production-sim",
        backend: { service: "ClawDesk License & Identity Simulator", status: "ready" },
      },
      plan: {
        minimumServices: ["mock-gateway"],
        recommendedServices: ["mock-gateway", "reverse-proxy"],
        productionModules: ["Keygen license adapter"],
        environmentVariables: ["KEYGEN_API_TOKEN"],
      },
      license: { status: { licenseProvider: "keygen", status: "active", lastValidationCode: "KEYGEN_VALID" } },
    });

    expect(snapshot.gatewayReady).toBe(true);
    expect(snapshot.backendReady).toBe(true);
    expect(snapshot.keygenReadonly).toBe("keygen:KEYGEN_VALID");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("summarizes deployment check results", () => {
    const checks: DeploymentCheck[] = [
      { id: "health", label: "Health", status: "pass", detail: "ok" },
      { id: "plan", label: "Plan", status: "skip", detail: "not available" },
      { id: "license", label: "License", status: "fail", detail: "bad response" },
    ];

    expect(summarizeDeploymentChecks(checks)).toEqual({ passed: 1, failed: 1, skipped: 1 });
  });
});
