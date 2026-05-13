import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const appName = "ClawDesk.app";
const bundleDir = path.join(cwd, "src-tauri", "target", "aarch64-apple-darwin", "release", "bundle");
const reportDir = path.join(cwd, "artifacts", "dmg-smoke");
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-report.json`);

function parseArgs(argv) {
  const options = {
    build: true,
  };

  for (const arg of argv) {
    if (arg === "--no-build") {
      options.build = false;
    }
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function walkFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function newestDmg() {
  const files = (await walkFiles(bundleDir)).filter((file) => file.endsWith(".dmg"));
  if (files.length === 0) {
    throw new Error(`No DMG found under ${bundleDir}`);
  }
  const withStats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return withStats[0].file;
}

function parseMountPoint(output) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    const volumeIndex = line.indexOf("/Volumes/");
    if (volumeIndex >= 0) return line.slice(volumeIndex);
  }
  return null;
}

function attachedClawDeskMounts() {
  const result = run("hdiutil", ["info"]);
  if (!result.ok) return [];

  const mounts = [];
  const lines = result.stdout.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/ClawDesk|OpenClaw|New project/.test(line)) continue;

    for (let nextIndex = index; nextIndex < Math.min(index + 40, lines.length); nextIndex += 1) {
      const match = lines[nextIndex].match(/(\/Volumes\/\S+)/);
      if (match) {
        mounts.push(match[1]);
        break;
      }
    }
  }
  return [...new Set(mounts)];
}

function detachMount(mountPath) {
  return run("hdiutil", ["detach", mountPath, "-force", "-quiet"]);
}

async function writeReport(report) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`DMG smoke report: ${reportFile}`);
}

async function requireMountedResource(mountedAppPath, relativePath) {
  const resolved = path.join(mountedAppPath, "Contents", "Resources", relativePath);
  await fs.access(resolved);
  return path.relative(mountedAppPath, resolved);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = {
    startedAt: new Date().toISOString(),
    checks: [],
    issues: [],
    status: "fail",
  };

  const check = async (name, action) => {
    try {
      const details = await action();
      report.checks.push({ name, ok: true, details });
      console.log(`PASS ${name}`);
      return details;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.checks.push({ name, ok: false, error: message });
      report.issues.push({ name, error: message });
      console.log(`FAIL ${name}: ${message}`);
      throw error;
    }
  };

  let mountPoint = null;

  try {
    await check("cleanup stale DMG mounts", async () => {
      const staleMounts = attachedClawDeskMounts();
      for (const staleMount of staleMounts) {
        detachMount(staleMount);
      }
      return { staleMounts };
    });

    await check("build DMG bundle", async () => {
      if (options.build) {
        const result = run("npm", ["run", "tauri:build:m4"], { stdio: "inherit" });
        if (!result.ok) throw new Error(`npm run tauri:build:m4 failed with status ${result.status}`);
      }
      const dmgPath = await newestDmg();
      report.dmgPath = dmgPath;
      return { dmgPath };
    });

    await check("mount DMG read-only", async () => {
      const result = run("hdiutil", ["attach", report.dmgPath, "-readonly", "-nobrowse"]);
      if (!result.ok) throw new Error(result.stderr || result.stdout || `hdiutil attach failed with status ${result.status}`);
      mountPoint = parseMountPoint(result.stdout);
      if (!mountPoint) throw new Error(`Could not parse mount point from hdiutil output: ${result.stdout}`);
      return { mountPoint };
    });

    await check("DMG contains ClawDesk.app", async () => {
      const mountedAppPath = path.join(mountPoint, appName);
      const stat = await fs.stat(mountedAppPath);
      if (!stat.isDirectory()) throw new Error(`${mountedAppPath} is not an app directory`);
      return { mountedAppPath };
    });

    await check("DMG app contains backend simulator resources", async () => {
      const mountedAppPath = path.join(mountPoint, appName);
      const resources = [];
      for (const relativePath of [
        "backend/server.mjs",
        "backend/production-gateway-sim.mjs",
        "backend/contracts.mjs",
        "backend/adapters/index.mjs",
        "backend/adapters/mock.mjs",
        "backend/adapters/production.mjs",
      ]) {
        resources.push(await requireMountedResource(mountedAppPath, relativePath));
      }
      return { resources };
    });

    await check("detach DMG", async () => {
      const result = detachMount(mountPoint);
      if (!result.ok) throw new Error(result.stderr || result.stdout || `hdiutil detach failed with status ${result.status}`);
      const stillMounted = await fs.stat(mountPoint).then(() => true).catch(() => false);
      if (stillMounted) throw new Error(`Mount point still exists after detach: ${mountPoint}`);
      return { mountPoint };
    });

    report.status = "pass";
  } finally {
    if (mountPoint) {
      detachMount(mountPoint);
    }
    report.finishedAt = new Date().toISOString();
    await writeReport(report);
    if (report.status !== "pass") {
      process.exitCode = 1;
    }
  }
}

await main();
