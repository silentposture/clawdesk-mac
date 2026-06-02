export interface VersionSummary {
  productName: string;
  developer: string;
  developerType: string;
  contactEmail: string;
  compatibility: string;
  version: string;
  buildId: string;
  releaseChannel: string;
}

interface VersionEnv {
  readonly VITE_CLAWDESK_VERSION?: string;
  readonly VITE_CLAWDESK_BUILD_ID?: string;
  readonly VITE_CLAWDESK_RELEASE_CHANNEL?: string;
}

const DEFAULT_VERSION = "0.1.0";
const DEFAULT_BUILD_ID = "dev-local";
const DEFAULT_RELEASE_CHANNEL = "mock-candidate";

function readBuildEnv(): VersionEnv {
  return ((import.meta as ImportMeta & { env?: VersionEnv }).env ?? {}) as VersionEnv;
}

export function buildVersionSummary(env: VersionEnv = readBuildEnv()): VersionSummary {
  return {
    productName: "ClawDesk",
    developer: "Alisonsoftware",
    developerType: "個人開發者",
    contactEmail: "huangkuoling@gmail.com",
    compatibility: "OpenClaw-compatible desktop agent",
    version: env.VITE_CLAWDESK_VERSION?.trim() || DEFAULT_VERSION,
    buildId: env.VITE_CLAWDESK_BUILD_ID?.trim() || DEFAULT_BUILD_ID,
    releaseChannel: env.VITE_CLAWDESK_RELEASE_CHANNEL?.trim() || DEFAULT_RELEASE_CHANNEL,
  };
}

export const versionSummary = buildVersionSummary();
