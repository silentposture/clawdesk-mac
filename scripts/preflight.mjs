import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const reportDir = path.join(process.cwd(), "artifacts", "preflight");
const requiredPaths = [
  "package.json",
  "package-lock.json",
  "src/App.tsx",
  "src/lib/tauri.ts",
  "scripts/qa-loop.mjs",
  "scripts/generate-legal-consent.mjs",
  "scripts/smoke-gui.mjs",
  "src/lib/legalConsentManifest.ts",
  "sidecars/mock-gateway/server.mjs",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.prod.conf.json",
];
const commands = ["node", "npm", "cargo"];
const ports = [18890, 18790, 5173];

function run(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandVersion(command) {
  const locator = run("bash", ["-lc", `command -v ${command}`]);
  if (locator.status !== 0) {
    return { command, ok: false, path: null, version: null };
  }

  const version = run(command, ["--version"]);
  return {
    command,
    ok: version.status === 0,
    path: locator.stdout.trim(),
    version: version.stdout.trim() || version.stderr.trim() || null,
  };
}

async function pathStatus(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  try {
    const stat = await fs.stat(absolutePath);
    return { path: relativePath, ok: true, type: stat.isDirectory() ? "directory" : "file" };
  } catch {
    return { path: relativePath, ok: false, type: null };
  }
}

function portStatus(port) {
  const result = run("bash", ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN | tail -n +2`]);
  const lines = (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    port,
    listening: lines.length > 0,
    processes: lines.map((line) => {
      const [command, pid] = line.split(/\s+/);
      return { command, pid };
    }),
  };
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const commandChecks = commands.map(commandVersion);
  const fileChecks = await Promise.all(requiredPaths.map(pathStatus));
  const portChecks = ports.map(portStatus);
  const legalManifestCheck = run("node", ["scripts/generate-legal-consent.mjs", "--check"]);

  const failures = [
    ...commandChecks.filter((item) => !item.ok).map((item) => `missing-command:${item.command}`),
    ...fileChecks.filter((item) => !item.ok).map((item) => `missing-path:${item.path}`),
    ...(legalManifestCheck.status === 0 ? [] : ["stale-legal-consent-manifest"]),
  ];

  const report = {
    createdAt: new Date().toISOString(),
    cwd: process.cwd(),
    result: failures.length === 0 ? "PASS" : "FAIL",
    commands: commandChecks,
    files: fileChecks,
    legalManifest: {
      ok: legalManifestCheck.status === 0,
      stderr: legalManifestCheck.stderr.trim(),
    },
    ports: portChecks,
    warnings: portChecks
      .filter((item) => item.listening)
      .map((item) => `port-in-use:${item.port}`),
    failures,
  };

  const file = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-preflight.json`);
  await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Preflight report: ${file}`);
  console.log(`Result: ${report.result}`);
  if (report.warnings.length > 0) {
    console.log(`Warnings: ${report.warnings.join(", ")}`);
  }
  if (failures.length > 0) {
    console.error(`Failures: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

await main();
