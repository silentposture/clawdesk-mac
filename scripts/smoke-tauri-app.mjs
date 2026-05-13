import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const appName = "ClawDesk";
const bundleId = "dev.openclaw.desktop";
const gatewayPort = Number(process.env.OPENCLAW_MOCK_PORT ?? process.env.CLAWDESK_MOCK_PORT ?? 18890);
const gatewayHealthUrl = `http://127.0.0.1:${gatewayPort}/health`;
const appPath = path.join(cwd, "src-tauri", "target", "aarch64-apple-darwin", "release", "bundle", "macos", `${appName}.app`);
const appExecutable = path.join(appPath, "Contents", "MacOS", "openclaw-desktop");
const appResourcesDir = path.join(appPath, "Contents", "Resources");
const reportDir = path.join(cwd, "artifacts", "tauri-app-smoke");
const reportFile = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "_")}-report.json`);

function parseArgs(argv) {
  const options = {
    build: true,
    timeoutMs: 30000,
  };

  for (const arg of argv) {
    if (arg === "--no-build") {
      options.build = false;
    } else if (arg.startsWith("--timeout-ms=")) {
      const parsed = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = parsed;
    }
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(options.env ?? {}) },
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function pidsFor(pattern) {
  const result = run("pgrep", ["-f", pattern]);
  if (!result.ok && result.status !== 1) {
    throw new Error(`pgrep failed for ${pattern}: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function terminatePids(pids, signal = "TERM") {
  for (const pid of pids) {
    run("kill", [`-${signal}`, pid]);
  }
}

async function isGatewayHealthy() {
  try {
    const response = await fetch(gatewayHealthUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForCondition(label, predicate, timeoutMs, intervalMs = 250) {
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeoutMs) {
    lastValue = await predicate();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}${lastValue ? `: ${String(lastValue)}` : ""}`);
}

async function appExists() {
  await fs.access(appExecutable);
}

async function requireResource(relativePath) {
  const resolved = path.join(appResourcesDir, relativePath);
  await fs.access(resolved);
  return path.relative(appPath, resolved);
}

async function writeReport(report) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Tauri app smoke report: ${reportFile}`);
}

async function quitApp() {
  run("osascript", ["-e", `tell application id "${bundleId}" to quit`]);
  run("osascript", ["-e", `tell application "${appName}" to quit`]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = {
    startedAt: new Date().toISOString(),
    appPath,
    gatewayHealthUrl,
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

  let appProcess;
  try {
    await check("cleanup pre-existing local app/gateway", async () => {
      const appPids = pidsFor(appExecutable);
      const gatewayPids = pidsFor("sidecars/mock-gateway/server.mjs");
      if (appPids.length > 0 || gatewayPids.length > 0) {
        terminatePids([...appPids, ...gatewayPids]);
        await waitForCondition(
          "pre-existing process cleanup",
          async () => pidsFor(appExecutable).length === 0 && pidsFor("sidecars/mock-gateway/server.mjs").length === 0,
          5000,
          200,
        );
      }
      if (await isGatewayHealthy()) {
        throw new Error(`Gateway still responds on ${gatewayPort} after local process cleanup`);
      }
      return { appPidsStopped: appPids, gatewayPidsStopped: gatewayPids, gatewayPort };
    });

    await check("build .app bundle", async () => {
      if (options.build) {
        const result = run("npm", ["run", "tauri:build:app"], { stdio: "inherit" });
        if (!result.ok) throw new Error(`npm run tauri:build:app failed with status ${result.status}`);
      }
      await appExists();
      return { appPath };
    });

    await check("packaged backend simulator resources exist", async () => {
      const resources = [];
      for (const relativePath of [
        "backend/server.mjs",
        "backend/production-gateway-sim.mjs",
        "backend/contracts.mjs",
        "backend/adapters/index.mjs",
        "backend/adapters/mock.mjs",
        "backend/adapters/production.mjs",
      ]) {
        resources.push(await requireResource(relativePath));
      }
      return { resources };
    });

    const beforeAppPids = pidsFor(appExecutable);
    const beforeGatewayPids = pidsFor("sidecars/mock-gateway/server.mjs");
    await check("launch .app executable", async () => {
      appProcess = spawn(appExecutable, [], {
        cwd,
        detached: false,
        stdio: ["ignore", "ignore", "ignore"],
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (appProcess.exitCode !== null) {
        throw new Error(`app exited early with code ${appProcess.exitCode}`);
      }
      return { pid: appProcess.pid };
    });

    await check("Gateway health is available after app launch", async () => {
      await waitForCondition("Gateway health", isGatewayHealthy, options.timeoutMs, 300);
      const response = await fetch(gatewayHealthUrl);
      return await response.json();
    });

    await check("app and sidecar processes are present", async () => {
      const appPids = pidsFor(appExecutable).filter((pid) => !beforeAppPids.includes(pid));
      const gatewayPids = pidsFor("sidecars/mock-gateway/server.mjs").filter((pid) => !beforeGatewayPids.includes(pid));
      if (appPids.length === 0) throw new Error("ClawDesk app process not found");
      if (gatewayPids.length === 0) throw new Error("mock Gateway sidecar process not found");
      return { appPids, gatewayPids };
    });

    await check("quit app and cleanup sidecar", async () => {
      await quitApp();
      let forcedTermination = false;
      const appGone = async () => pidsFor(appExecutable).filter((pid) => !beforeAppPids.includes(pid)).length === 0;
      await waitForCondition("new app process cleanup", appGone, Math.min(options.timeoutMs, 10000), 300).catch(() => {
        if (appProcess && appProcess.exitCode === null) {
          forcedTermination = true;
          appProcess.kill("SIGTERM");
        }
      });
      await waitForCondition("new app process cleanup after forced termination", appGone, options.timeoutMs, 300);

      await waitForCondition(
        "Gateway shutdown",
        async () => !(await isGatewayHealthy()),
        options.timeoutMs,
        300,
      );
      await waitForCondition(
        "new sidecar process cleanup",
        async () => pidsFor("sidecars/mock-gateway/server.mjs").filter((pid) => !beforeGatewayPids.includes(pid)).length === 0,
        options.timeoutMs,
        300,
      );
      return { gatewayPort, forcedTermination };
    });

    report.status = "pass";
  } finally {
    if (appProcess && appProcess.exitCode === null) {
      appProcess.kill("SIGTERM");
    }
    report.finishedAt = new Date().toISOString();
    await writeReport(report);
    if (report.status !== "pass") {
      process.exitCode = 1;
    }
  }
}

await main();
