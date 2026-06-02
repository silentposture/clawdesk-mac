import {
  buildReleaseReadinessMatrix,
  defaultMockCandidateReadiness,
  summarizeReleaseReadiness,
  type ReleaseReadinessInput,
  type ReleaseReadinessItem,
  type ReleaseReadinessSummary,
} from "./releaseReadiness";
import type { GatewayInfo } from "./tauri";

interface EnvPresence {
  name: string;
  present: boolean;
}

interface ProductionHealthPayload {
  mode?: string;
  sidecar?: boolean;
  backend?: {
    mode?: string;
    adapterMode?: string;
    adapterReadiness?: {
      productionEnv?: {
        required?: EnvPresence[];
        missing?: string[];
        ready?: boolean;
      };
    };
    productionEnv?: {
      required?: EnvPresence[];
      missing?: string[];
      ready?: boolean;
    };
  };
}

export interface ProductionReadinessView {
  input: ReleaseReadinessInput;
  summary: ReleaseReadinessSummary;
  matrix: ReleaseReadinessItem[];
  missingProductionEnv: string[];
}

const LEMON_SQUEEZY_ENV = ["LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_WEBHOOK_SECRET", "LEMON_SQUEEZY_STORE_ID"];
const KEYGEN_ENV = ["KEYGEN_ACCOUNT_ID", "KEYGEN_PRODUCT_ID", "KEYGEN_API_TOKEN", "KEYGEN_SIGNING_PUBLIC_KEY"];
const SSO_ENV = ["CLAWDESK_SSO_ISSUER_URL", "CLAWDESK_SSO_CLIENT_ID"];
const MICROSOFT_GRAPH_ENV = ["MICROSOFT_GRAPH_TENANT_ID", "MICROSOFT_GRAPH_CLIENT_ID", "MICROSOFT_GRAPH_CLIENT_SECRET", "MICROSOFT_GRAPH_REDIRECT_URI"];

function requiredEnv(health?: ProductionHealthPayload): EnvPresence[] {
  return (
    health?.backend?.adapterReadiness?.productionEnv?.required ??
    health?.backend?.productionEnv?.required ??
    []
  );
}

function envGroupPresent(required: EnvPresence[], names: string[]): boolean | undefined {
  if (required.length === 0) return undefined;
  return names.every((name) => required.some((item) => item.name === name && item.present));
}

export function buildProductionReadinessView(
  gateway?: GatewayInfo,
  health?: ProductionHealthPayload,
  baseInput: ReleaseReadinessInput = defaultMockCandidateReadiness,
): ProductionReadinessView {
  const env = requiredEnv(health);
  const gatewayMode = `${gateway?.mode ?? ""} ${health?.mode ?? ""} ${health?.backend?.mode ?? ""}`.toLowerCase();
  const hasProductionGateway = gatewayMode.includes("production") || gatewayMode.includes("external");
  const input: ReleaseReadinessInput = {
    ...baseInput,
    hasProductionGateway,
    hasLemonSqueezyCredentials: envGroupPresent(env, LEMON_SQUEEZY_ENV) ?? baseInput.hasLemonSqueezyCredentials,
    hasKeygenCredentials: envGroupPresent(env, KEYGEN_ENV) ?? baseInput.hasKeygenCredentials,
    hasSsoCredentials: envGroupPresent(env, SSO_ENV) ?? baseInput.hasSsoCredentials,
    hasMicrosoftGraphCredentials: envGroupPresent(env, MICROSOFT_GRAPH_ENV) ?? baseInput.hasMicrosoftGraphCredentials,
  };
  const matrix = buildReleaseReadinessMatrix(input);
  const missingProductionEnv =
    health?.backend?.adapterReadiness?.productionEnv?.missing ??
    health?.backend?.productionEnv?.missing ??
    env.filter((item) => !item.present).map((item) => item.name);

  return {
    input,
    matrix,
    summary: summarizeReleaseReadiness(matrix),
    missingProductionEnv,
  };
}
