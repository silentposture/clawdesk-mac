export type DeploymentCheckStatus = "pass" | "fail" | "skip";

export interface DeploymentCheck {
  id: string;
  label: string;
  status: DeploymentCheckStatus;
  detail: string;
}

export interface DeploymentPlan {
  mode?: string;
  minimumServices?: string[];
  recommendedServices?: string[];
  productionModules?: string[];
  environmentVariables?: string[];
}

export interface DeploymentStatus {
  service?: string;
  status?: string;
  environment?: string;
  providers?: Record<string, string>;
  persistence?: {
    enabled?: boolean;
    stateFilePath?: string | null;
  };
  counts?: Record<string, number>;
}

export interface DeploymentConsoleSnapshot {
  gatewayReady: boolean;
  backendReady: boolean;
  gatewayMode: string;
  backendService: string;
  legacyLicenseReadonly: string;
  canonicalLicenseReadonly: string;
  minimumServices: string[];
  recommendedServices: string[];
  productionModules: string[];
  environmentVariables: string[];
}

interface HealthPayload {
  ok?: boolean;
  name?: string;
  mode?: string;
  backend?: DeploymentStatus & {
    adapterMode?: string;
    service?: string;
  };
}

interface LicensePayload {
  status?: {
    licenseProvider?: string;
    entitlementAuthority?: string;
    canonicalPlanKey?: string;
    status?: string;
    lastValidationCode?: string;
  };
}

export function buildDeploymentConsoleSnapshot({
  health,
  backendStatus,
  plan,
  license,
}: {
  health?: HealthPayload;
  backendStatus?: DeploymentStatus;
  plan?: DeploymentPlan;
  license?: LicensePayload;
}): DeploymentConsoleSnapshot {
  const backend = backendStatus ?? health?.backend;
  const keygenCode = license?.status?.lastValidationCode ?? license?.status?.status ?? "unknown";
  const canonicalAuthority = license?.status?.entitlementAuthority ?? license?.status?.licenseProvider ?? "universal-server";
  const canonicalPlanKey = license?.status?.canonicalPlanKey ?? "clawdesk.free";
  return {
    gatewayReady: health?.ok === true,
    backendReady: backend?.status === "ready" || Boolean(backend?.service),
    gatewayMode: health?.mode ?? health?.name ?? "unknown",
    backendService: backend?.service ?? "unknown",
    legacyLicenseReadonly: `${license?.status?.licenseProvider ?? "keygen"}:${keygenCode}`,
    canonicalLicenseReadonly: `${canonicalAuthority}:${canonicalPlanKey}:${keygenCode}`,
    minimumServices: plan?.minimumServices ?? [],
    recommendedServices: plan?.recommendedServices ?? [],
    productionModules: plan?.productionModules ?? [],
    environmentVariables: plan?.environmentVariables ?? [],
  };
}

export function summarizeDeploymentChecks(checks: DeploymentCheck[]): { passed: number; failed: number; skipped: number } {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    failed: checks.filter((check) => check.status === "fail").length,
    skipped: checks.filter((check) => check.status === "skip").length,
  };
}
