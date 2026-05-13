import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    strictProduction: argv.includes("--strict-production"),
    requireSigning: argv.includes("--require-signing"),
    requireArtifacts: argv.includes("--require-artifacts"),
    reportDir: valueArg(argv, "--report-dir") ?? path.join(cwd, "artifacts", "release-guard"),
  };
}

function valueArg(argv, name) {
  const equals = argv.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return null;
}

async function readJson(relativePath) {
  const text = await fs.readFile(path.join(cwd, relativePath), "utf8");
  return JSON.parse(text);
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(cwd, relativePath));
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function envPresence(names) {
  return names.map((name) => ({ name, present: Boolean(process.env[name]) }));
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function hasEnvAny(names) {
  return names.some((name) => Boolean(process.env[name]));
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function newestFile(dirRelativePath, extension) {
  const dir = path.join(cwd, dirRelativePath);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const isExpectedBundle =
        entry.name.endsWith(extension) && (entry.isFile() || (extension === ".app" && entry.isDirectory()));
      if (!isExpectedBundle) continue;
      const filePath = path.join(dir, entry.name);
      const stat = await fs.stat(filePath);
      files.push({ name: entry.name, relativePath: path.relative(cwd, filePath), mtimeMs: stat.mtimeMs, bytes: stat.size });
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

function parseSecurityIdentities(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("Developer ID Application") || line.includes("Apple Development"))
    .map((line) => line.replace(/\s+/g, " "));
}

function readinessStatus(strictModeEnabled, condition) {
  if (condition) return "ready";
  return strictModeEnabled ? "blocked" : "warning";
}

function buildReadinessMatrix(input) {
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
      status: readinessStatus(input.strictModeEnabled, input.hasProductionGateway),
      current: input.hasProductionGateway ? "已設定 production gateway endpoint" : "目前使用本機 mock Gateway",
      required: "正式版需 CLAWDESK_GATEWAY_BASE_URL 指向受控 production Gateway。",
      nextAction: "建立 production Gateway / backend connector，替換 mock sidecar 合約。",
    },
    {
      id: "paddle",
      category: "payment",
      label: "Paddle 金流環境",
      status: readinessStatus(input.strictModeEnabled, input.hasPaddleCredentials),
      current: input.hasPaddleCredentials ? "已設定 production credentials" : "目前僅 mock",
      required: "正式版需 PADDLE_API_KEY 與 PADDLE_WEBHOOK_SECRET。",
      nextAction: "在正式後端環境設定 Paddle credential，桌面端不得保存信用卡資料。",
    },
    {
      id: "keygen",
      category: "licensing",
      label: "Keygen 授權環境",
      status: readinessStatus(input.strictModeEnabled, input.hasKeygenCredentials),
      current: input.hasKeygenCredentials ? "已設定 Keygen account/product/token/signing" : "目前僅 mock",
      required: "正式版需 KEYGEN_ACCOUNT_ID、KEYGEN_PRODUCT_ID、KEYGEN_API_TOKEN、KEYGEN_SIGNING_PUBLIC_KEY。",
      nextAction: "建立 Keygen product/policy，接上 license validation 與 offline ticket。",
    },
    {
      id: "sso",
      category: "identity",
      label: "SSO / 帳號入口",
      status: readinessStatus(input.strictModeEnabled, input.hasSsoCredentials),
      current: input.hasSsoCredentials ? "已設定 issuer/client" : "目前僅本機 mock 登入",
      required: "個人版與企業版都需 CLAWDESK_SSO_ISSUER_URL 與 CLAWDESK_SSO_CLIENT_ID。",
      nextAction: "接上 Apple / Google / Microsoft / Email 驗證與回信確認流程。",
    },
    {
      id: "apple-signing-env",
      category: "macos",
      label: "Apple 簽章環境變數",
      status: readinessStatus(input.strictModeEnabled, input.hasAppleSigningEnv),
      current: input.hasAppleSigningEnv ? "已設定 APPLE_TEAM_ID / APPLE_ID" : "尚未設定",
      required: "正式 macOS DMG 需要 Apple Developer Program 身分。",
      nextAction: "設定 APPLE_TEAM_ID、APPLE_ID，並準備 Developer ID Application certificate。",
    },
    {
      id: "developer-id",
      category: "macos",
      label: "Developer ID certificate",
      status: readinessStatus(input.strictModeEnabled, input.hasDeveloperIdIdentity),
      current: input.hasDeveloperIdIdentity ? "本機鑰匙圈可找到 Developer ID Application" : "找不到 Developer ID Application",
      required: "正式散布需使用 Developer ID Application 簽章。",
      nextAction: "在 macOS Keychain 匯入 Developer ID Application certificate。",
    },
    {
      id: "notarization",
      category: "macos",
      label: "macOS notarization credential",
      status: readinessStatus(input.strictModeEnabled, input.hasNotarizationCredential),
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
      status: input.hasMockResourcesInProduction ? (input.strictModeEnabled ? "blocked" : "warning") : "ready",
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

function summarizeReadiness(matrix) {
  const ready = matrix.filter((item) => item.status === "ready").length;
  const warning = matrix.filter((item) => item.status === "warning").length;
  const blocked = matrix.filter((item) => item.status === "blocked").length;
  return {
    ready,
    warning,
    blocked,
    overall: blocked > 0 ? "production-blocked" : warning > 0 ? "mock-candidate-ready" : "production-ready",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  const warnings = [];

  const packageJson = await readJson("package.json");
  const channel = process.env.CLAWDESK_RELEASE_CHANNEL || "mock-candidate";
  const strictModeEnabled = options.strictProduction || channel === "production";
  const tauriConfigPath = strictModeEnabled
    ? "src-tauri/tauri.prod.conf.json"
    : "src-tauri/tauri.conf.json";
  const tauriConfig = await readJson(tauriConfigPath);
  const defaultTauriConfig = await readJson("src-tauri/tauri.conf.json");

  if (packageJson.private !== true) {
    failures.push("package.json 必須保留 private=true，避免 mock 候選版被誤發佈到 npm。");
  }
  if (tauriConfig.productName !== "ClawDesk") {
    failures.push(`Tauri productName 必須是 ClawDesk，目前是 ${tauriConfig.productName ?? "(未設定)"}`);
  }
  if (tauriConfig.version !== packageJson.version) {
    failures.push(`Tauri version (${tauriConfig.version}) 必須與 package.json version (${packageJson.version}) 一致。`);
  }

  const requiredFiles = [
    "src/lib/legalConsentManifest.ts",
    "docs/legal/INSTALLER_TERMS.md",
    "docs/legal/OPENCLAW_MIT_NOTICE.md",
    "sidecars/mock-gateway/server.mjs",
    ".env.mock.example",
    ".env.production.example",
    "src-tauri/tauri.prod.conf.json",
  ];
  for (const file of requiredFiles) {
    if (!(await pathExists(file))) failures.push(`缺少必要檔案：${file}`);
  }

  const legalCheck = run("npm", ["run", "legal:manifest:check"]);
  if (legalCheck.status !== 0) {
    failures.push("legalConsentManifest.ts 已過期，請執行 npm run legal:manifest。");
  }

  const resources = tauriConfig.bundle?.resources ?? {};
  const bundledResources = typeof resources === "object" && !Array.isArray(resources) ? Object.keys(resources) : [];
  const defaultResources = defaultTauriConfig.bundle?.resources ?? {};
  const defaultBundledResources =
    typeof defaultResources === "object" && !Array.isArray(defaultResources) ? Object.keys(defaultResources) : [];
  const mockResourceMarkers = [
    "../sidecars/mock-gateway/server.mjs",
  ];
  for (const expected of ["../sidecars/mock-gateway/server.mjs"]) {
    if (!defaultBundledResources.includes(expected)) {
      failures.push(`mock 候選版 Tauri bundle resources 未包含 ${expected}`);
    }
  }
  for (const expected of [
    "../backend/server.mjs",
    "../backend/production-gateway-sim.mjs",
    "../backend/contracts.mjs",
    "../backend/adapters/index.mjs",
    "../backend/adapters/mock.mjs",
    "../backend/adapters/production.mjs",
  ]) {
    if (!defaultBundledResources.includes(expected)) {
      failures.push(`mock 候選版 Tauri bundle resources 未包含 ${expected}`);
    }
  }
  for (const expected of ["../docs/legal/INSTALLER_TERMS.md", "../docs/legal/OPENCLAW_MIT_NOTICE.md"]) {
    if (!bundledResources.includes(expected)) {
      failures.push(`${tauriConfigPath} bundle resources 未包含 ${expected}`);
    }
  }

  const productionEnvNames = [
    "CLAWDESK_GATEWAY_BASE_URL",
    "PADDLE_API_KEY",
    "PADDLE_WEBHOOK_SECRET",
    "KEYGEN_ACCOUNT_ID",
    "KEYGEN_PRODUCT_ID",
    "KEYGEN_API_TOKEN",
    "KEYGEN_SIGNING_PUBLIC_KEY",
    "CLAWDESK_SSO_ISSUER_URL",
    "CLAWDESK_SSO_CLIENT_ID",
  ];
  const signingEnvNames = ["APPLE_TEAM_ID", "APPLE_ID"];
  const notarizationCredentialGroups = [
    ["APPLE_APP_SPECIFIC_PASSWORD"],
    ["APPLE_KEYCHAIN_PROFILE"],
  ];

  const missingProductionEnv = missingEnv(productionEnvNames);
  const missingSigningEnv = missingEnv(signingEnvNames);
  const hasNotarizationCredential = notarizationCredentialGroups.some(hasEnvAny);

  const security = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  const signingIdentities = security.status === 0 ? parseSecurityIdentities(`${security.stdout}\n${security.stderr}`) : [];
  const developerIdIdentities = signingIdentities.filter((identity) => identity.includes("Developer ID Application"));

  if (!strictModeEnabled) {
    warnings.push("目前是 mock candidate 檢查：允許本機 mock Gateway 與 mock Paddle/Keygen，但不得視為正式商業發佈。");
    if (missingProductionEnv.length > 0) {
      warnings.push(`正式 production 尚缺環境變數：${missingProductionEnv.join(", ")}`);
    }
    if (missingSigningEnv.length > 0 || !hasNotarizationCredential || developerIdIdentities.length === 0) {
      warnings.push("正式 macOS 發佈尚未完成 Apple Developer ID 簽章/公證環境。");
    }
  }

  if (strictModeEnabled) {
    if (channel !== "production") failures.push("strict production 發佈必須設定 CLAWDESK_RELEASE_CHANNEL=production。");
    if (process.env.CLAWDESK_ALLOW_MOCK_RELEASE === "true") {
      failures.push("strict production 不允許 CLAWDESK_ALLOW_MOCK_RELEASE=true。");
    }
    for (const marker of mockResourceMarkers) {
      if (bundledResources.includes(marker)) {
        failures.push(`strict production 不允許打包 mock resource：${marker}`);
      }
    }
    if ((packageJson.scripts?.["tauri:build:prod:app"] ?? "").includes("release:guard:strict") === false) {
      failures.push("package.json 缺少由 release:guard:strict 保護的 tauri:build:prod:app。");
    }
    if ((packageJson.scripts?.["tauri:build:prod:dmg"] ?? "").includes("release:guard:strict") === false) {
      failures.push("package.json 缺少由 release:guard:strict 保護的 tauri:build:prod:dmg。");
    }
    if ((packageJson.scripts?.["tauri:build:prod:app"] ?? "").includes("src-tauri/tauri.prod.conf.json") === false) {
      failures.push("package.json tauri:build:prod:app 必須使用 src-tauri/tauri.prod.conf.json。");
    }
    if ((packageJson.scripts?.["tauri:build:prod:dmg"] ?? "").includes("src-tauri/tauri.prod.conf.json") === false) {
      failures.push("package.json tauri:build:prod:dmg 必須使用 src-tauri/tauri.prod.conf.json。");
    }
    if ((packageJson.scripts?.["tauri:build:prod:app"] ?? "").includes("CLAWDESK_BUILD_PROFILE=production") === false) {
      failures.push("package.json tauri:build:prod:app 必須設定 CLAWDESK_BUILD_PROFILE=production。");
    }
    if ((packageJson.scripts?.["tauri:build:prod:dmg"] ?? "").includes("CLAWDESK_BUILD_PROFILE=production") === false) {
      failures.push("package.json tauri:build:prod:dmg 必須設定 CLAWDESK_BUILD_PROFILE=production。");
    }
    const productionCsp = String(tauriConfig.app?.security?.csp ?? "");
    if (productionCsp.includes("127.0.0.1") || productionCsp.includes("localhost")) {
      failures.push("src-tauri/tauri.prod.conf.json CSP 不應允許 localhost / 127.0.0.1 mock Gateway。");
    }
    for (const name of missingProductionEnv) {
      failures.push(`strict production 缺少必要環境變數：${name}`);
    }
  }

  if (options.requireSigning || strictModeEnabled) {
    for (const name of missingSigningEnv) {
      failures.push(`macOS 簽章缺少必要環境變數：${name}`);
    }
    if (!hasNotarizationCredential) {
      failures.push("macOS 公證缺少 APPLE_APP_SPECIFIC_PASSWORD 或 APPLE_KEYCHAIN_PROFILE。");
    }
    if (developerIdIdentities.length === 0) {
      failures.push("找不到 Developer ID Application codesigning identity。");
    }
  }

  const appArtifact = await newestFile("src-tauri/target/aarch64-apple-darwin/release/bundle/macos", ".app");
  const dmgArtifact = await newestFile("src-tauri/target/aarch64-apple-darwin/release/bundle/dmg", ".dmg");
  if (options.requireArtifacts) {
    if (!appArtifact) failures.push("找不到 macOS .app artifact，請先執行 npm run tauri:build:app 或 npm run tauri:build:m4。");
    if (!dmgArtifact) failures.push("找不到 macOS .dmg artifact，請先執行 npm run tauri:build:m4。");
  }

  const hasGuardedProductionScripts =
    (packageJson.scripts?.["tauri:build:prod:app"] ?? "").includes("release:guard:strict") &&
    (packageJson.scripts?.["tauri:build:prod:dmg"] ?? "").includes("release:guard:strict");
  const readinessMatrix = buildReadinessMatrix({
    strictModeEnabled,
    legalManifestCurrent: legalCheck.status === 0,
    hasProductionGateway: Boolean(process.env.CLAWDESK_GATEWAY_BASE_URL),
    hasPaddleCredentials: missingEnv(["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"]).length === 0,
    hasKeygenCredentials: missingEnv(["KEYGEN_ACCOUNT_ID", "KEYGEN_PRODUCT_ID", "KEYGEN_API_TOKEN", "KEYGEN_SIGNING_PUBLIC_KEY"]).length === 0,
    hasSsoCredentials: missingEnv(["CLAWDESK_SSO_ISSUER_URL", "CLAWDESK_SSO_CLIENT_ID"]).length === 0,
    hasAppleSigningEnv: missingSigningEnv.length === 0,
    hasNotarizationCredential,
    hasDeveloperIdIdentity: developerIdIdentities.length > 0,
    hasGuardedProductionScripts,
    hasMockResourcesInProduction: bundledResources.some((resource) => mockResourceMarkers.includes(resource)),
    hasAppArtifact: Boolean(appArtifact),
    hasDmgArtifact: Boolean(dmgArtifact),
  });
  const readinessSummary = summarizeReadiness(readinessMatrix);

  const report = {
    createdAt: new Date().toISOString(),
    result: failures.length === 0 ? "PASS" : "FAIL",
    releaseType: strictModeEnabled ? "strict-production" : "mock-candidate",
    channel,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private === true,
    },
    tauri: {
      configPath: tauriConfigPath,
      productName: tauriConfig.productName,
      version: tauriConfig.version,
      identifierHash: hashValue(String(tauriConfig.identifier ?? "")),
      bundledResources,
      mockResources: bundledResources.filter((resource) => mockResourceMarkers.includes(resource)),
      defaultConfigMockResources: defaultBundledResources.filter((resource) => mockResourceMarkers.includes(resource)),
    },
    legalManifestCurrent: legalCheck.status === 0,
    productionEnv: envPresence(productionEnvNames),
    signing: {
      env: envPresence([...signingEnvNames, "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_KEYCHAIN_PROFILE"]),
      codesigningIdentityCount: signingIdentities.length,
      developerIdIdentityCount: developerIdIdentities.length,
    },
    artifacts: {
      app: appArtifact,
      dmg: dmgArtifact,
    },
    readiness: {
      summary: readinessSummary,
      matrix: readinessMatrix,
    },
    warnings,
    failures,
  };

  await fs.mkdir(options.reportDir, { recursive: true });
  const reportPath = path.join(
    options.reportDir,
    `${new Date().toISOString().replace(/[:.]/g, "_")}-${report.releaseType}-pid-${process.pid}-release-guard.json`,
  );
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Release guard report: ${reportPath}`);
  console.log(`Release type: ${report.releaseType}`);
  console.log(`Readiness: ${readinessSummary.overall} (${readinessSummary.ready} ready, ${readinessSummary.warning} warning, ${readinessSummary.blocked} blocked)`);
  for (const warning of warnings) console.warn(`WARNING: ${warning}`);
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.log(`Result: ${report.result}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
