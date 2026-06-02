import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    artifact: valueArg(argv, "--artifact"),
    reportDir: valueArg(argv, "--report-dir") ?? path.join(cwd, "artifacts", "macos-signing-notarize"),
    skipNotarize: argv.includes("--skip-notarize"),
    skipStaple: argv.includes("--skip-staple"),
    dryRun: argv.includes("--dry-run"),
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

function shortText(value) {
  return value == null ? "" : String(value).slice(0, 1600);
}

function envStatus(names) {
  return names.map((name) => ({
    name,
    present: Boolean(process.env[name]),
    valueHash: process.env[name] ? createHash("sha256").update(String(process.env[name])).digest("hex").slice(0, 12) : null,
  }));
}

function check(status, label, detail, nextAction) {
  return { status, label, detail, nextAction };
}

function parseDeveloperIdentities(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("Developer ID Application"))
    .map((line) => line.replace(/\([A-Z0-9]{10}\)/g, "(TEAMID)"));
}

function parseNotaryStatus(rawOutput) {
  const text = shortText(rawOutput);
  if (!text) return { raw: "", source: "text" };

  const parsed = safeJson(text);
  if (parsed) {
    const requestId = parsed.id || parsed.requestId || parsed.UUID || parsed.request_uuid || null;
    const status = parsed.status || parsed.state || null;
    return { raw: text, json: parsed, requestId, status, source: "json" };
  }

  const requestMatch = text.match(/Request ID:\s*([0-9a-f-]{30,})/i);
  const statusMatch = text.match(/Status:\s*(\w+)/i);
  const requestId = requestMatch?.[1] ?? null;
  const status = statusMatch?.[1]?.toLowerCase() ?? null;
  return { raw: text, requestId, status, source: "text" };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
  if (!filePath) return { status: "missing", command: null, output: "no artifact" };
  const r = run("codesign", ["--verify", "--deep", "--strict", filePath]);
  return {
    status: r.status === 0 ? "valid" : "invalid",
    command: "codesign --verify --deep --strict <path>",
    rc: r.status,
    output: shortText(r.status === 0 ? r.stdout : r.stderr),
  };
}

function runSpctl(filePath) {
  if (!filePath) return { status: "missing", command: null, output: "no artifact" };
  const r = run("spctl", ["-a", "-t", "open", "--context", "context:primary-signature", "-v", filePath]);
  return {
    status: r.status === 0 ? "pass" : "fail",
    command: "spctl -a -t open --context context:primary-signature -v <path>",
    rc: r.status,
    output: shortText(r.status === 0 ? r.stdout : r.stderr),
  };
}

function buildNotaryCommand(filePath) {
  if (process.env.APPLE_KEYCHAIN_PROFILE) {
    return {
      method: "keychain-profile",
      args: ["notarytool", "submit", filePath, "--keychain-profile", process.env.APPLE_KEYCHAIN_PROFILE, "--wait", "--output-format", "json"],
    };
  }
  if (process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_ID && process.env.APPLE_TEAM_ID) {
    return {
      method: "app-specific-password",
      args: [
        "notarytool",
        "submit",
        filePath,
        "--apple-id",
        process.env.APPLE_ID,
        "--team-id",
        process.env.APPLE_TEAM_ID,
        "--password",
        process.env.APPLE_APP_SPECIFIC_PASSWORD,
        "--wait",
        "--output-format",
        "json",
      ],
    };
  }
  return null;
}

const options = parseArgs(process.argv.slice(2));

loadDotEnv(path.join(cwd, ".env.production"));
loadDotEnv(path.join(cwd, ".env"));

const packageJson = JSON.parse(await fsp.readFile(path.join(cwd, "package.json"), "utf8"));

const checks = [];

if (process.platform !== "darwin") {
  checks.push(check("blocked", "執行環境", `目前為 ${process.platform}`, "請在 macOS 主機執行。"));
} else {
  checks.push(check("ready", "執行環境", "目前為 macOS", "N/A"));
}

const requiredSigningEnv = ["APPLE_TEAM_ID", "APPLE_ID"];
const notarizationMethods = [];
if (process.env.APPLE_KEYCHAIN_PROFILE) notarizationMethods.push("APPLE_KEYCHAIN_PROFILE");
if (process.env.APPLE_APP_SPECIFIC_PASSWORD) notarizationMethods.push("APPLE_APP_SPECIFIC_PASSWORD");
const hasNotaryCredential = notarizationMethods.length > 0;

if (requiredSigningEnv.every((name) => process.env[name])) {
  checks.push(check("ready", "Apple signing env", "APPLE_TEAM_ID / APPLE_ID 已設定", ""));
} else {
  checks.push(check("blocked", "Apple signing env", `缺少：${requiredSigningEnv.filter((name) => !process.env[name]).join(", ")}`, "設定 APPLE_TEAM_ID、APPLE_ID。"));
}

if (hasNotaryCredential) {
  checks.push(check("ready", "Apple notarization credential", `使用 ${notarizationMethods.join(" / ")}`, ""));
} else {
  checks.push(check("blocked", "Apple notarization credential", "缺少憑證鏈路", "設定 APPLE_KEYCHAIN_PROFILE 或 APPLE_APP_SPECIFIC_PASSWORD。"));
}

const commandChecks = {
  xcrunVersion: run("xcrun", ["--version"]),
  codesign: run("xcrun", ["--find", "codesign"]),
  notarytool: run("xcrun", ["--find", "notarytool"]),
  stapler: run("xcrun", ["--find", "stapler"]),
  security: run("security", ["find-identity", "-v", "-p", "codesigning"]),
};

checks.push(check(commandChecks.xcrunVersion.status === 0 ? "ready" : "blocked", "xcrun 可用性", commandChecks.xcrunVersion.status === 0 ? "可用" : "不可用", "安裝 Xcode Command Line Tools。"));
checks.push(check(commandChecks.codesign.status === 0 ? "ready" : "blocked", "codesign 可用性", commandChecks.codesign.status === 0 ? "可用" : "未找到", "確認 Xcode CLI 安裝/路徑。"));
checks.push(check(commandChecks.notarytool.status === 0 ? "ready" : "blocked", "notarytool 可用性", commandChecks.notarytool.status === 0 ? "可用" : "未找到", "安裝支援 notarytool 的 Xcode CLI。"));
checks.push(check(commandChecks.stapler.status === 0 ? "ready" : "blocked", "stapler 可用性", commandChecks.stapler.status === 0 ? "可用" : "未找到", "確認 Xcode CLI 安裝。"));
checks.push(check(commandChecks.security.status === 0 ? "ready" : "blocked", "security 工具", commandChecks.security.status === 0 ? "可用" : "不可用", "在 macOS 安裝並使用 security CLI。"));

const developerIdentities =
  commandChecks.security.status === 0 ? parseDeveloperIdentities(`${commandChecks.security.stdout}\n${commandChecks.security.stderr}`) : [];
checks.push(check(developerIdentities.length > 0 ? "ready" : "blocked", "Developer ID Application", developerIdentities.length > 0 ? `找到 ${developerIdentities.length} 組身份` : "未找到", "匯入 Developer ID Application 到鑰匙圈。"));

let artifactPath = options.artifact;
if (!artifactPath) {
  const dmgArtifact = await newestArtifact("src-tauri/target/aarch64-apple-darwin/release/bundle/dmg", ".dmg");
  artifactPath = dmgArtifact?.filePath;
}
if (artifactPath) artifactPath = path.resolve(artifactPath);
const artifact = artifactPath
  ? { filePath: artifactPath, name: path.basename(artifactPath), relativePath: path.relative(cwd, artifactPath).replace(/\\/g, "/") }
  : null;

if (artifact && fs.existsSync(artifact.filePath)) {
  checks.push(check("ready", "DMG artifact", artifact.relativePath, "檢查 DMG 是否正確產出。"));
} else {
  checks.push(check("blocked", "DMG artifact", "未找到", "先執行 npm run tauri:build:prod:dmg。"));
}

let signature = null;
let spctl = null;
let notary = null;
let notarizeLog = [];
let stapler = null;
let finalSpctl = null;

if (artifact) {
  signature = runCodesign(artifact.filePath);
  spctl = runSpctl(artifact.filePath);
  checks.push(check(signature.status === "valid" ? "ready" : "blocked", "codesign 驗證", `DMG codesign=${signature.status}`, "先完成簽章（Tauri 或手動 codesign）。"));
  checks.push(check(spctl.status === "pass" ? "ready" : "warning", "spctl 驗證", `DMG spctl=${spctl.status}`, "簽章後再執行一次 spctl。"));
}

if (options.skipNotarize) {
  checks.push(check("warning", "notarize 執行", "已跳過 --skip-notarize", ""));
} else if (artifact && checks.every((item) => item.status !== "blocked")) {
  const notaryCommand = buildNotaryCommand(artifact.filePath);
  if (!notaryCommand) {
    checks.push(check("blocked", "notarize 設定", "未配置可用憑證", "設定 APPLE_KEYCHAIN_PROFILE 或 APPLE_APP_SPECIFIC_PASSWORD + APPLE_ID + APPLE_TEAM_ID。"));
  } else {
    const command = ["xcrun", ...notaryCommand.args];
    notarizeLog.push(`run: ${command.join(" ")}`);
    if (!options.dryRun) {
      const startedAt = new Date().toISOString();
      const r = run("xcrun", notaryCommand.args);
      const info = parseNotaryStatus(r.stdout || r.stderr);
      notary = {
        method: notaryCommand.method,
        status: r.status === 0 ? "pass" : "fail",
        rc: r.status,
        output: shortText(r.stdout || r.stderr),
        requestId: info.requestId ?? null,
        rawStatus: info.status ?? null,
        startedAt,
      };
      checks.push(check(
        r.status === 0 ? "ready" : "blocked",
        "notarytool submit",
        r.status === 0 ? "notarytool 完成" : "notarytool 提交/等待失敗",
        r.status === 0 ? "" : "確認憑證、網路與 DMG 是否可公證。",
      ));
      notarizeLog.push(`result:${r.status}`);
      if (notary.requestId && notary.method === "keychain-profile") {
        const logResult = run("xcrun", ["notarytool", "log", notary.requestId, "--keychain-profile", process.env.APPLE_KEYCHAIN_PROFILE ?? "", "--output-format", "json"]);
        notarizeLog.push(`notary-log: ${shortText(logResult.stdout || logResult.stderr)}`);
      }
    } else {
      notarizeLog.push("dry-run: skipped execution");
      checks.push(check("warning", "notarytool submit", "dry-run 跳過", ""));
    }
  }
} else if (!artifact) {
  checks.push(check("blocked", "notarytool submit", "缺少 artifact", "建立 DMG 後再執行。"));
}

if (artifact && !options.skipStaple) {
  if (notary && notary.status === "pass") {
    const r = run("xcrun", ["stapler", "staple", artifact.filePath]);
    stapler = {
      status: r.status === 0 ? "pass" : "fail",
      rc: r.status,
      output: shortText(r.stdout || r.stderr),
      command: "xcrun stapler staple <path>",
    };
    checks.push(check(
      r.status === 0 ? "ready" : "blocked",
      "stapler staple",
      r.status === 0 ? "stapler 完成" : "stapler 失敗",
      r.status === 0 ? "" : "確認 notary 結果與憑證鎖定。",
    ));
  } else if (options.skipNotarize) {
    checks.push(check("warning", "stapler staple", "notary 尚未執行，已略過 staple", ""));
  } else {
    checks.push(check("warning", "stapler staple", "notary 未通過，略過 staple", ""));
  }
} else if (options.skipStaple) {
  checks.push(check("warning", "stapler staple", "已用 --skip-staple 略過", ""));
}

if (artifact) {
  finalSpctl = runSpctl(artifact.filePath);
  checks.push(check(finalSpctl.status === "pass" ? "ready" : "warning", "spctl 最終驗證", `DMG spctl=${finalSpctl.status}`, "確認 stapler 後結果。"));
}

const blocked = checks.filter((item) => item.status === "blocked");
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
    signing: envStatus(["APPLE_TEAM_ID", "APPLE_ID"]),
    notarization: envStatus(["APPLE_KEYCHAIN_PROFILE", "APPLE_APP_SPECIFIC_PASSWORD"]),
    certificateImport: envStatus(["APPLE_CERT_BASE64", "APPLE_CERT_PASSWORD"]),
  },
  artifact,
  checks,
  steps: {
    signature,
    spctl: { beforeStaple: spctl, final: finalSpctl },
    notary,
    stapler,
    notarizeLog,
  },
  warnings: [],
};

if (!artifact) {
  report.warnings.push("請先執行 npm run tauri:build:prod:dmg。");
}
if (signature && signature.status !== "valid") {
  report.warnings.push("DMG 尚未通過 codesign，建議先完成簽章流程再執行公證。");
}
if (notary && notary.status !== "pass") {
  report.warnings.push("公證未通過，請先補齊憑證與網路憑據。");
}
if (stapler && stapler.status !== "pass") {
  report.warnings.push("Staple 未完成，請補做 stapler 後再上架。");
}
await fsp.mkdir(options.reportDir, { recursive: true });
const reportPath = path.join(options.reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-mac-signing-notarize.json`);
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`macOS notarization report: ${reportPath}`);
for (const item of blocked) {
  console.warn(`BLOCKED: ${item.label} - ${item.detail}`);
}
console.log(`Result: ${report.result}`);
if (report.warnings.length > 0) {
  for (const warning of report.warnings) {
    console.warn(`WARN: ${warning}`);
  }
}
if (notary) {
  console.log(`Notary method: ${notary.method}`);
}
if (stapler) {
  console.log(`Stapler: ${stapler.status}`);
}

if (report.result === "FAIL") process.exitCode = 1;
