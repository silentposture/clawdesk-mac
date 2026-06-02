import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    artifact: valueArg(argv, "--artifact"),
    reportDir: valueArg(argv, "--report-dir") ?? path.join(cwd, "artifacts", "mac-signing-doctor"),
  };
}

function valueArg(argv, name) {
  const equals = argv.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) && value) {
      process.env[key] = value;
    }
  }
  return true;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
}

async function readPackageJson() {
  const text = await fsp.readFile(path.join(cwd, "package.json"), "utf8");
  return JSON.parse(text);
}

function envStatus(names) {
  return names.map((name) => ({
    name,
    present: Boolean(process.env[name]),
    valueHash: process.env[name] ? createHash("sha256").update(String(process.env[name])).digest("hex").slice(0, 16) : null,
  }));
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

async function fileExists(relativePath) {
  try {
    await fsp.access(path.join(cwd, relativePath));
    return true;
  } catch {
    return false;
  }
}

function safePath(value) {
  if (!value) return "";
  const parsed = path.parse(value);
  return `${parsed.root || ""}...${path.sep}${path.basename(value)}`;
}

function parseDeveloperIdentities(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("Developer ID Application"))
    .map((line) => line.replace(/\([A-Z0-9]{10}\)/g, "(TEAMID)"));
}

function check(status, label, detail, nextAction) {
  return { status, label, detail, nextAction };
}

async function newestArtifact(rootDir, extension) {
  const entries = await fsp.readdir(path.join(cwd, rootDir), { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(extension.toLowerCase())) continue;
    const filePath = path.join(cwd, rootDir, entry.name);
    const stat = await fsp.stat(filePath);
    files.push({
      name: entry.name,
      filePath,
      relativePath: path.relative(cwd, filePath).replace(/\\/g, "/"),
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] ?? null;
}

function runCodesign(filePath) {
  if (!filePath) return { status: "missing", path: null, command: null, output: "no artifact" };
  const command = ["codesign", "--verify", "--deep", "--strict", filePath];
  const r = run("codesign", ["--verify", "--deep", "--strict", filePath]);
  return {
    status: r.status === 0 ? "valid" : "invalid",
    output: String(r.status === 0 ? r.stdout : r.stderr).trim().slice(0, 1200),
    rc: r.status,
    command: command.join(" "),
    path: safePath(filePath),
  };
}

function runSpctl(filePath) {
  if (!filePath) return { status: "missing", path: null, command: null, output: "no artifact" };
  const command = "spctl -a -t open --context context:primary-signature -v <path>";
  const r = run("spctl", ["-a", "-t", "open", "--context", "context:primary-signature", "-v", filePath]);
  return {
    status: r.status === 0 ? "pass" : "fail",
    output: String(r.status === 0 ? r.stdout : r.stderr).trim().slice(0, 1200),
    rc: r.status,
    command,
    path: safePath(filePath),
  };
}

function runStapler(filePath) {
  if (!filePath) return { status: "missing", path: null, command: null, output: "no artifact" };
  const command = ["xcrun", "stapler", "validate", filePath];
  const r = run("xcrun", ["stapler", "validate", filePath]);
  return {
    status: r.status === 0 ? "pass" : "fail",
    output: String(r.status === 0 ? r.stdout : r.stderr).trim().slice(0, 1200),
    rc: r.status,
    command: command.join(" "),
    path: safePath(filePath),
  };
}

const options = parseArgs(process.argv.slice(2));
const packageJson = await readPackageJson();

loadDotEnv(path.join(cwd, ".env.production"));
loadDotEnv(path.join(cwd, ".env"));

const signingEnvNames = ["APPLE_TEAM_ID", "APPLE_ID"];
const notarizationEnvNames = ["APPLE_KEYCHAIN_PROFILE", "APPLE_APP_SPECIFIC_PASSWORD"];
const requiredFiles = [
  ".env.production.example",
  "src-tauri/tauri.prod.conf.json",
  "docs/legal/OPENCLAW_MIT_NOTICE.md",
  "docs/legal/EULA.md",
  "docs/legal/PRIVACY.md",
  "docs/legal/REFUND_POLICY.md",
  "docs/legal/DIGITAL_CONTENT_WAIVER.md",
  "docs/legal/AI_AGENT_RISK_NOTICE.md",
  "docs/legal/INSTALLER_TERMS.md",
];

const checks = [];

for (const file of requiredFiles) {
  const exists = await fileExists(file);
  checks.push(check(exists ? "ready" : "blocked", `必要檔案：${file}`, exists ? "存在" : "不存在", "補齊檔案後重跑。"));
}

const commandChecks = {
  xcrunVersion: run("xcrun", ["--version"]),
  codesign: run("xcrun", ["--find", "codesign"]),
  notarytool: run("xcrun", ["--find", "notarytool"]),
  stapler: run("xcrun", ["--find", "stapler"]),
  security: run("security", ["find-identity", "-v", "-p", "codesigning"]),
  spctl: run("spctl", ["--version"]),
};

const hasAnyNotarizationCredential = notarizationEnvNames.some((name) => Boolean(process.env[name]));
const missingSigningEnv = missingEnv(signingEnvNames);
const missingNotaryEnv = missingEnv(notarizationEnvNames);
const signingIdentities =
  commandChecks.security.status === 0 ? parseDeveloperIdentities(`${commandChecks.security.stdout}\n${commandChecks.security.stderr}`) : [];

let artifactPath = options.artifact;
if (!artifactPath) {
  const dmgArtifact = await newestArtifact("src-tauri/target/aarch64-apple-darwin/release/bundle/dmg", ".dmg");
  artifactPath = dmgArtifact?.filePath;
}

const artifact = artifactPath
  ? { filePath: path.resolve(artifactPath), relativePath: path.relative(cwd, path.resolve(artifactPath)).replace(/\\/g, "/") }
  : null;

const signatureReport = {
  file: artifact
    ? {
        name: path.basename(artifact.filePath),
        relativePath: artifact.relativePath,
        bytes: (() => {
          try {
            return fs.statSync(artifact.filePath).size;
          } catch {
            return null;
          }
        })(),
      }
    : null,
  codesign: null,
  spctl: null,
  stapler: null,
};

if (artifact) {
  signatureReport.codesign = runCodesign(artifact.filePath);
  signatureReport.spctl = runSpctl(artifact.filePath);
  signatureReport.stapler = runStapler(artifact.filePath);
}

checks.push(
  check(
    process.platform === "darwin" ? "ready" : "blocked",
    "執行環境",
    process.platform === "darwin" ? "目前為 macOS" : `目前為 ${process.platform}`,
    "請在 macOS 主機執行簽章診斷。",
  ),
  check(
    missingSigningEnv.length === 0 ? "ready" : "blocked",
    "Apple signing env",
    missingSigningEnv.length === 0 ? "APPLE_TEAM_ID / APPLE_ID 已設定" : `缺少：${missingSigningEnv.join(", ")}`,
    "設定 APPLE_TEAM_ID 與 APPLE_ID 後重試。",
  ),
  check(
    hasAnyNotarizationCredential ? "ready" : "blocked",
    "Apple notarization credential",
    hasAnyNotarizationCredential ? "已設定公證憑證（keychain profile 或 app-specific password）" : "未設定",
    "設定 APPLE_KEYCHAIN_PROFILE 或 APPLE_APP_SPECIFIC_PASSWORD。",
  ),
  check(
    signingIdentities.length > 0 ? "ready" : "blocked",
    "Developer ID Application",
    signingIdentities.length > 0 ? `找到 ${signingIdentities.length} 組身份` : "未找到 Developer ID Application",
    "請將 Developer ID Application 匯入鑰匙圈。",
  ),
  check(
    commandChecks.xcrunVersion.status === 0 ? "ready" : "blocked",
    "xcrun",
    commandChecks.xcrunVersion.status === 0 ? "可用" : "不可用",
    "安裝 Xcode Command Line Tools。",
  ),
  check(
    commandChecks.codesign.status === 0 ? "ready" : "blocked",
    "codesign 可用性",
    commandChecks.codesign.status === 0 ? "可用" : "未找到",
    "安裝 Xcode Command Line Tools 並確認 xcode-select 指向正確。",
  ),
  check(
    commandChecks.notarytool.status === 0 ? "ready" : "blocked",
    "notarytool 可用性",
    commandChecks.notarytool.status === 0 ? "可用" : "未找到",
    "安裝新版本 Xcode 並確認 CLI 工具完整。",
  ),
  check(
    commandChecks.stapler.status === 0 ? "ready" : "blocked",
    "stapler 可用性",
    commandChecks.stapler.status === 0 ? "可用" : "未找到",
    "Apple stapler 在舊版 Xcode 可能在其他路徑，建議更新 Xcode。",
  ),
  check(
    commandChecks.security.status === 0 ? "ready" : "blocked",
    "security 工具",
    commandChecks.security.status === 0 ? "可用" : "security 不可用",
    "確認 macOS security CLI 可用。",
  ),
  check(
    artifact ? "ready" : "blocked",
    "macOS DMG artifact",
    artifact ? artifact.relativePath : "未找到",
    "先執行 npm run tauri:build:m4 或 npm run tauri:build:prod:dmg。",
  ),
);

const blocked = checks.filter((item) => item.status === "blocked");
const warnings = [];

if (!artifact) {
  warnings.push("尚未找到可驗證的 DMG，建議先執行 tauri build。後續指引：npm run tauri:build:m4 或 npm run tauri:build:prod:dmg。");
}
if (artifact && signatureReport.codesign?.status !== "valid") {
  warnings.push(`DMG codesign 狀態為 ${signatureReport.codesign?.status}，請先完成簽章。`);
}
if (artifact && signatureReport.spctl?.status !== "pass") {
  warnings.push(`spctl 驗證未通過：${signatureReport.spctl?.status}。請確認為正式簽章的 DMG。`);
}
if (artifact && signatureReport.stapler?.status !== "pass") {
  warnings.push("Stapler 驗證未通過，表示尚未完成 notarization stapled。請確認公證流程。 ");
}

const report = {
  createdAt: new Date().toISOString(),
  mode: options.strict ? "strict" : "report-only",
  result: blocked.length === 0 ? "PASS" : options.strict ? "FAIL" : "WARN",
  platform: process.platform,
  package: {
    name: packageJson.name,
    version: packageJson.version,
  },
  env: {
    signing: envStatus(signingEnvNames),
    notarization: envStatus(notarizationEnvNames),
  },
  requirements: {
    hasSigningEnv: missingSigningEnv.length === 0,
    missingSigningEnv,
    hasNotarizationCredential: hasAnyNotarizationCredential,
    missingNotaryEnv,
    developerIdIdentityCount: signingIdentities.length,
    developerIdIdentities: signingIdentities,
  },
  artifact: signatureReport,
  commandHealth: {
    xcrun: { status: commandChecks.xcrunVersion.status },
    codesign: { status: commandChecks.codesign.status },
    notarytool: { status: commandChecks.notarytool.status },
    stapler: { status: commandChecks.stapler.status },
    spctl: { status: commandChecks.spctl.status },
    security: { status: commandChecks.security.status },
  },
  checks,
  warnings,
  nextActions: blocked.map((item) => item.nextAction),
};

await fsp.mkdir(options.reportDir, { recursive: true });
const reportPath = path.join(options.reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-mac-signing-doctor.json`);
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`macOS signing doctor report: ${reportPath}`);
console.log(`Result: ${report.result}`);
for (const item of blocked) {
  console.warn(`BLOCKED: ${item.label} - ${item.detail}`);
}

if (report.result === "FAIL") process.exitCode = 1;
