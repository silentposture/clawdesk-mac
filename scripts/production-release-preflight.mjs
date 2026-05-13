import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    reportDir: valueArg(argv, "--report-dir") ?? path.join(cwd, "artifacts", "production-release-preflight"),
  };
}

function valueArg(argv, name) {
  const equals = argv.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return null;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    command,
    args,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function readJson(relativePath) {
  const text = await fs.readFile(path.join(cwd, relativePath), "utf8");
  return JSON.parse(text);
}

async function fileExists(relativePath) {
  try {
    await fs.access(path.join(cwd, relativePath));
    return true;
  } catch {
    return false;
  }
}

function envStatus(names) {
  return names.map((name) => ({
    name,
    present: Boolean(process.env[name]),
    valueHash: process.env[name] ? hashValue(process.env[name]) : null,
  }));
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function parseIdentities(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("Developer ID Application"))
    .map((line) => line.replace(/\s+/g, " ").replace(/\([A-Z0-9]{10}\)/g, "(TEAMID)"));
}

function check(status, label, detail, nextAction) {
  return { status, label, detail, nextAction };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = await readJson("package.json");
  const tauriProdConfig = await readJson("src-tauri/tauri.prod.conf.json");

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
  const notarizationEnvNames = ["APPLE_APP_SPECIFIC_PASSWORD", "APPLE_KEYCHAIN_PROFILE"];
  const requiredFiles = [
    ".env.production.example",
    "src-tauri/tauri.prod.conf.json",
    "docs/legal/INSTALLER_TERMS.md",
    "docs/legal/OPENCLAW_MIT_NOTICE.md",
    "scripts/release-guard.mjs",
  ];

  const resources = tauriProdConfig.bundle?.resources ?? {};
  const bundledResources = typeof resources === "object" && !Array.isArray(resources) ? Object.keys(resources) : [];
  const mockResourceMarkers = ["../sidecars/mock-gateway/server.mjs", "../backend/server.mjs", "../backend/production-gateway-sim.mjs"];

  const commandChecks = {
    xcrun: run("xcrun", ["--version"]),
    codesign: run("xcrun", ["--find", "codesign"]),
    notarytool: run("xcrun", ["--find", "notarytool"]),
    security: run("security", ["find-identity", "-v", "-p", "codesigning"]),
    tauri: run("npx", ["tauri", "--version"]),
  };
  const developerIdIdentities =
    commandChecks.security.status === 0
      ? parseIdentities(`${commandChecks.security.stdout}\n${commandChecks.security.stderr}`)
      : [];

  const missingProduction = missingEnv(productionEnvNames);
  const missingSigning = missingEnv(signingEnvNames);
  const hasNotarizationCredential = notarizationEnvNames.some((name) => Boolean(process.env[name]));

  const checks = [];
  for (const file of requiredFiles) {
    checks.push(
      check(
        (await fileExists(file)) ? "ready" : "blocked",
        `必要檔案：${file}`,
        (await fileExists(file)) ? "存在" : "不存在",
        "補齊檔案後重新執行 preflight。",
      ),
    );
  }

  checks.push(
    check(
      tauriProdConfig.productName === "ClawDesk" ? "ready" : "blocked",
      "Tauri productName",
      `目前值：${tauriProdConfig.productName ?? "(未設定)"}`,
      "src-tauri/tauri.prod.conf.json productName 必須維持 ClawDesk。",
    ),
    check(
      tauriProdConfig.version === packageJson.version ? "ready" : "blocked",
      "版本一致",
      `package=${packageJson.version}, tauri=${tauriProdConfig.version}`,
      "同步 package.json 與 src-tauri/tauri.prod.conf.json version。",
    ),
    check(
      bundledResources.some((resource) => mockResourceMarkers.includes(resource)) ? "blocked" : "ready",
      "Production bundle mock resource 隔離",
      bundledResources.some((resource) => mockResourceMarkers.includes(resource))
        ? "production config 仍包含 mock/backend simulator resource"
        : "production config 未打包 mock/backend simulator resource",
      "正式版不得打包 mock Gateway 或 backend simulator。",
    ),
    check(
      missingProduction.length === 0 ? "ready" : "blocked",
      "Production backend credentials",
      missingProduction.length === 0 ? "已設定必要環境變數" : `缺少：${missingProduction.join(", ")}`,
      "只在 CI 或本機 shell 設定；不要寫入 repo。",
    ),
    check(
      missingSigning.length === 0 ? "ready" : "blocked",
      "Apple signing env",
      missingSigning.length === 0 ? "已設定 APPLE_TEAM_ID / APPLE_ID" : `缺少：${missingSigning.join(", ")}`,
      "設定 Apple Developer Program 相關環境變數。",
    ),
    check(
      hasNotarizationCredential ? "ready" : "blocked",
      "Apple notarization credential",
      hasNotarizationCredential ? "已設定公證 credential" : "缺少 APPLE_APP_SPECIFIC_PASSWORD 或 APPLE_KEYCHAIN_PROFILE",
      "建議使用 keychain profile，避免在 shell 保存明文 app-specific password。",
    ),
    check(
      developerIdIdentities.length > 0 ? "ready" : "blocked",
      "Developer ID Application certificate",
      developerIdIdentities.length > 0 ? `找到 ${developerIdIdentities.length} 組 Developer ID Application identity` : "本機鑰匙圈找不到 Developer ID Application",
      "匯入 Developer ID Application certificate 後重跑。",
    ),
    check(
      commandChecks.xcrun.status === 0 ? "ready" : "blocked",
      "xcrun toolchain",
      commandChecks.xcrun.status === 0 ? "可用" : "不可用",
      "安裝或切換 Xcode Command Line Tools。",
    ),
    check(
      commandChecks.codesign.status === 0 ? "ready" : "blocked",
      "codesign toolchain",
      commandChecks.codesign.status === 0 ? "可用" : "不可用",
      "安裝或切換 Xcode Command Line Tools。",
    ),
    check(
      commandChecks.notarytool.status === 0 ? "ready" : "blocked",
      "notarytool toolchain",
      commandChecks.notarytool.status === 0 ? "可用" : "不可用",
      "安裝或切換 Xcode Command Line Tools。",
    ),
    check(
      commandChecks.tauri.status === 0 ? "ready" : "blocked",
      "Tauri CLI",
      commandChecks.tauri.status === 0 ? commandChecks.tauri.stdout.trim() || "可用" : "不可用",
      "執行 npm install 後重跑。",
    ),
  );

  const blocked = checks.filter((item) => item.status === "blocked");
  const report = {
    createdAt: new Date().toISOString(),
    mode: options.strict ? "strict" : "report-only",
    result: blocked.length === 0 ? "PASS" : options.strict ? "FAIL" : "WARN",
    package: {
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private === true,
    },
    tauri: {
      productName: tauriProdConfig.productName,
      version: tauriProdConfig.version,
      identifierHash: hashValue(tauriProdConfig.identifier ?? ""),
      bundledResources,
    },
    env: {
      production: envStatus(productionEnvNames),
      signing: envStatus([...signingEnvNames, ...notarizationEnvNames]),
    },
    developerIdIdentityCount: developerIdIdentities.length,
    developerIdIdentities,
    checks,
  };

  await fs.mkdir(options.reportDir, { recursive: true });
  const reportPath = path.join(
    options.reportDir,
    `${new Date().toISOString().replace(/[:.]/g, "_")}-${report.mode}-pid-${process.pid}-production-preflight.json`,
  );
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Production preflight report: ${reportPath}`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Result: ${report.result}`);
  console.log(`Ready: ${checks.length - blocked.length}, Blocked: ${blocked.length}`);
  for (const item of blocked) {
    console.warn(`BLOCKED: ${item.label} - ${item.detail}`);
  }

  if (options.strict && blocked.length > 0) process.exitCode = 1;
}

await main();
