export type ReleaseReadinessStatus = "ready" | "warning" | "blocked";

export interface ReleaseReadinessItem {
  id: string;
  category: "product" | "payment" | "licensing" | "identity" | "macos" | "packaging" | "legal";
  label: string;
  status: ReleaseReadinessStatus;
  current: string;
  required: string;
  nextAction: string;
}

export interface ReleaseReadinessSummary {
  ready: number;
  warning: number;
  blocked: number;
  overall: "mock-candidate-ready" | "production-blocked" | "production-ready";
}

export interface ReleaseReadinessInput {
  legalManifestCurrent: boolean;
  hasProductionGateway: boolean;
  hasPaddleCredentials: boolean;
  hasKeygenCredentials: boolean;
  hasSsoCredentials: boolean;
  hasAppleSigningEnv: boolean;
  hasNotarizationCredential: boolean;
  hasDeveloperIdIdentity: boolean;
  hasGuardedProductionScripts: boolean;
  hasMockResourcesInProduction: boolean;
  hasAppArtifact: boolean;
  hasDmgArtifact: boolean;
  strictProduction?: boolean;
}

export const defaultMockCandidateReadiness: ReleaseReadinessInput = {
  legalManifestCurrent: true,
  hasProductionGateway: false,
  hasPaddleCredentials: false,
  hasKeygenCredentials: false,
  hasSsoCredentials: false,
  hasAppleSigningEnv: false,
  hasNotarizationCredential: false,
  hasDeveloperIdIdentity: false,
  hasGuardedProductionScripts: true,
  hasMockResourcesInProduction: true,
  hasAppArtifact: true,
  hasDmgArtifact: true,
  strictProduction: false,
};

function blockedWhenStrict(input: ReleaseReadinessInput, condition: boolean): ReleaseReadinessStatus {
  if (condition) return "ready";
  return input.strictProduction ? "blocked" : "warning";
}

export function buildReleaseReadinessMatrix(input: ReleaseReadinessInput): ReleaseReadinessItem[] {
  return [
    {
      id: "legal-manifest",
      category: "legal",
      label: "安裝條款與 NOTICE manifest",
      status: input.legalManifestCurrent ? "ready" : "blocked",
      current: input.legalManifestCurrent ? "已同步" : "已過期",
      required: "每次 build 前 legal manifest 必須與 docs/legal 文件一致。",
      nextAction: "執行 npm run legal:manifest 並重新驗證。",
    },
    {
      id: "production-gateway",
      category: "packaging",
      label: "Production Gateway",
      status: blockedWhenStrict(input, input.hasProductionGateway),
      current: input.hasProductionGateway ? "已設定 production gateway endpoint" : "目前使用本機 mock Gateway",
      required: "正式版需 CLAWDESK_GATEWAY_BASE_URL 指向受控 production Gateway。",
      nextAction: "建立 production Gateway / backend connector，替換 mock sidecar 合約。",
    },
    {
      id: "paddle",
      category: "payment",
      label: "Paddle 金流環境",
      status: blockedWhenStrict(input, input.hasPaddleCredentials),
      current: input.hasPaddleCredentials ? "已設定 production credentials" : "目前僅 mock",
      required: "正式版需 PADDLE_API_KEY 與 PADDLE_WEBHOOK_SECRET。",
      nextAction: "在正式後端環境設定 Paddle credential，桌面端不得保存信用卡資料。",
    },
    {
      id: "keygen",
      category: "licensing",
      label: "Keygen 授權環境",
      status: blockedWhenStrict(input, input.hasKeygenCredentials),
      current: input.hasKeygenCredentials ? "已設定 Keygen account/product/token/signing" : "目前僅 mock",
      required: "正式版需 KEYGEN_ACCOUNT_ID、KEYGEN_PRODUCT_ID、KEYGEN_API_TOKEN、KEYGEN_SIGNING_PUBLIC_KEY。",
      nextAction: "建立 Keygen product/policy，接上 license validation 與 offline ticket。",
    },
    {
      id: "sso",
      category: "identity",
      label: "SSO / 帳號入口",
      status: blockedWhenStrict(input, input.hasSsoCredentials),
      current: input.hasSsoCredentials ? "已設定 issuer/client" : "目前僅本機 mock 登入",
      required: "個人版與企業版都需 CLAWDESK_SSO_ISSUER_URL 與 CLAWDESK_SSO_CLIENT_ID。",
      nextAction: "接上 Apple / Google / Microsoft / Email 驗證與回信確認流程。",
    },
    {
      id: "apple-signing-env",
      category: "macos",
      label: "Apple 簽章環境變數",
      status: blockedWhenStrict(input, input.hasAppleSigningEnv),
      current: input.hasAppleSigningEnv ? "已設定 APPLE_TEAM_ID / APPLE_ID" : "尚未設定",
      required: "正式 macOS DMG 需要 Apple Developer Program 身分。",
      nextAction: "設定 APPLE_TEAM_ID、APPLE_ID，並準備 Developer ID Application certificate。",
    },
    {
      id: "developer-id",
      category: "macos",
      label: "Developer ID certificate",
      status: blockedWhenStrict(input, input.hasDeveloperIdIdentity),
      current: input.hasDeveloperIdIdentity ? "本機鑰匙圈可找到 Developer ID Application" : "找不到 Developer ID Application",
      required: "正式散布需使用 Developer ID Application 簽章。",
      nextAction: "在 macOS Keychain 匯入 Developer ID Application certificate。",
    },
    {
      id: "notarization",
      category: "macos",
      label: "macOS notarization credential",
      status: blockedWhenStrict(input, input.hasNotarizationCredential),
      current: input.hasNotarizationCredential ? "已設定公證 credential" : "尚未設定",
      required: "正式 DMG 需 Apple notarization。",
      nextAction: "設定 APPLE_APP_SPECIFIC_PASSWORD 或 APPLE_KEYCHAIN_PROFILE。",
    },
    {
      id: "guarded-prod-scripts",
      category: "packaging",
      label: "正式打包入口保護",
      status: input.hasGuardedProductionScripts ? "ready" : "blocked",
      current: input.hasGuardedProductionScripts ? "prod build scripts 受 strict guard 保護" : "缺少受保護 prod build scripts",
      required: "正式 app/dmg build 必須先執行 release:guard:strict。",
      nextAction: "補上 tauri:build:prod:app 與 tauri:build:prod:dmg。",
    },
    {
      id: "mock-resources",
      category: "packaging",
      label: "Mock resource 隔離",
      status: input.hasMockResourcesInProduction ? (input.strictProduction ? "blocked" : "warning") : "ready",
      current: input.hasMockResourcesInProduction ? "候選版仍打包 mock Gateway" : "production bundle 未包含 mock resource",
      required: "正式版不得打包 mock Gateway 或 mock credential flow。",
      nextAction: "把 mock sidecar 替換為簽章後 production gateway 或受控 backend connector。",
    },
    {
      id: "artifacts",
      category: "packaging",
      label: "macOS app / DMG artifact",
      status: input.hasAppArtifact && input.hasDmgArtifact ? "ready" : "blocked",
      current: input.hasAppArtifact && input.hasDmgArtifact ? "已產生 .app 與 .dmg" : "artifact 不完整",
      required: "release candidate 至少需產生 .app 與 .dmg，並通過 mount smoke。",
      nextAction: "執行 npm run qa:release:dmg。",
    },
  ];
}

export function summarizeReleaseReadiness(items: ReleaseReadinessItem[]): ReleaseReadinessSummary {
  const ready = items.filter((item) => item.status === "ready").length;
  const warning = items.filter((item) => item.status === "warning").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  return {
    ready,
    warning,
    blocked,
    overall: blocked > 0 ? "production-blocked" : warning > 0 ? "mock-candidate-ready" : "production-ready",
  };
}
