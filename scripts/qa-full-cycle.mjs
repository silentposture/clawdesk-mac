import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const reportDir = path.join(cwd, "artifacts", "qa-loop");
const guardedPorts = [18890, 18790, 5173, 19110, 19120, 19130, 19140];

function commandInvocation(command, args) {
  if (process.platform !== "win32") return { command, args };
  if (command.endsWith(".exe")) return { command, args };
  if (command === "cargo" || command === "node") return { command: `${command}.exe`, args };
  const cmdCommand = command.endsWith(".cmd") ? command : `${command}.cmd`;
  return { command: "cmd.exe", args: ["/d", "/s", "/c", cmdCommand, ...args] };
}

function listPortPids(port) {
  const finder = process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
        ],
        { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false },
      )
    : spawnSync("bash", ["-lc", `lsof -ti tcp:${port}`], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });

  return (finder.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function nowIso() {
  return new Date().toISOString();
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function runStep(step) {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const command = `${step.cmd} ${step.args.join(" ")}`;
  const invocation = commandInvocation(step.cmd, step.args);

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env: { ...process.env, ...(step.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, step.timeoutMs ?? 420000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        name: step.name,
        command,
        startedAt,
        endedAt: nowIso(),
        durationMs: Date.now() - startedMs,
        ok: false,
        status: null,
        signal: null,
        output: `${stdout}\n${stderr}\n${error.message}`.trim(),
      });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      const output = `${stdout}\n${stderr}${timedOut ? "\nTimed out" : ""}`.trim();
      resolve({
        name: step.name,
        command,
        startedAt,
        endedAt: nowIso(),
        durationMs: Date.now() - startedMs,
        ok: status === 0,
        status,
        signal,
        output,
      });
    });
  });
}

function cleanupPorts() {
  for (const port of guardedPorts) {
    const pids = listPortPids(port);
    for (const pid of pids) {
      if (process.platform === "win32") {
        spawnSync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`], {
          cwd,
          stdio: ["ignore", "ignore", "ignore"],
          shell: false,
        });
      } else {
        spawnSync("kill", ["-9", pid], {
          cwd,
          stdio: ["ignore", "ignore", "ignore"],
        });
      }
    }
  }
}

function classifyIssue(stepResult) {
  if (stepResult.ok) return null;
  if (stepResult.name === "release-preflight-strict") {
    const text = stepResult.output;
    const externalMarkers = [
      "缺少：CLAWDESK_GATEWAY_BASE_URL",
      "缺少：APPLE_TEAM_ID",
      "缺少 APPLE_APP_SPECIFIC_PASSWORD",
      "找不到 Developer ID Application",
    ];
    const onlyExternal = externalMarkers.some((marker) => text.includes(marker));
    if (onlyExternal) {
      return {
        severity: "Major",
        category: "ExternalDependency",
        title: "Production strict preflight blocked by missing secrets/certificates",
        detail:
          "此失敗符合預期，屬於外部前置條件未就緒（production secrets、Apple signing/notarization、Developer ID）。",
      };
    }
  }
  if (stepResult.name === "sign-macos-notarize" && stepResult.output.includes("BLOCKED:")) {
    return {
      severity: "Major",
      category: "ExternalDependency",
      title: "macOS notarize/公證檢查缺少外部前置條件",
      detail: "環境缺少 Apple signing/notarization 憑證、DMG 或工具，僅屬外部阻塞。",
    };
  }

  return {
    severity: "Blocker",
    category: "ProgramDefect",
    title: `${stepResult.name} failed`,
    detail: "命令執行失敗，需修正程式或測試流程後重跑。",
  };
}

async function checkWorkflowGate() {
  const workflowPath = path.join(cwd, ".github", "workflows", "release-macos.yml");
  const text = await fs.readFile(workflowPath, "utf8");
  const hasVerifyJob = /\n\s*verify:\n/.test(text);
  const hasBuildJob = /\n\s*build-sign-notarize:\n/.test(text);
  const hasNeedsVerify = /build-sign-notarize:[\s\S]*?\n\s*needs:\s*[\r\n]+\s*-\s*verify/.test(text);
  return {
    ok: hasVerifyJob && hasBuildJob && hasNeedsVerify,
    detail: hasVerifyJob && hasBuildJob && hasNeedsVerify
      ? "verify gate 順序正確，build-sign-notarize 依賴 verify。"
      : "workflow gate 順序不正確或缺少 needs: verify。",
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# QA Cycle Report");
  lines.push("");
  lines.push(`- 日期：${report.createdAt}`);
  lines.push(`- 平台：macOS-first`);
  lines.push(`- 最終判定：${report.result}`);
  lines.push(`- 全部步驟：${report.summary.totalSteps}，成功：${report.summary.passedSteps}，失敗：${report.summary.failedSteps}`);
  lines.push("");
  lines.push("## 問題清單");
  if (report.issues.length === 0) {
    lines.push("");
    lines.push("- 無 Blocker/Major 問題。");
  } else {
    lines.push("");
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.category} - ${issue.title}`);
      lines.push(`  - 說明：${issue.detail}`);
      lines.push(`  - 對應步驟：${issue.step}`);
    }
  }
  lines.push("");
  lines.push("## CI 發佈鏈路檢查");
  lines.push("");
  lines.push(`- release-macos gate：${report.workflowGate.ok ? "PASS" : "FAIL"}`);
  lines.push(`- 說明：${report.workflowGate.detail}`);
  lines.push("");
  lines.push("## 步驟結果");
  lines.push("");
  for (const step of report.steps) {
    lines.push(`- ${step.name}: ${step.ok ? "PASS" : "FAIL"} (${step.durationMs} ms)`);
  }
  lines.push("");
  lines.push("## 結論");
  lines.push("");
  if (report.result === "PASS") {
    lines.push("- 本機可控範圍測試全綠；僅剩外部依賴（若有）待補齊。");
  } else {
    lines.push("- 仍有 Blocker/流程錯誤，需先修復再進入下一輪。");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.mkdir(reportDir, { recursive: true });

  const stepPlan = [
    { name: "npm-test", cmd: "npm", args: ["test"], timeoutMs: 180000 },
    {
      group: "parallel-verify",
      parallel: true,
      steps: [
        { name: "verify-mvp", cmd: "npm", args: ["run", "verify:mvp"], timeoutMs: 180000 },
        { name: "verify-backend", cmd: "npm", args: ["run", "verify:backend"], timeoutMs: 180000 },
        { name: "verify-backend-sim", cmd: "npm", args: ["run", "verify:backend:sim"], timeoutMs: 180000 },
        { name: "verify-backend-production", cmd: "npm", args: ["run", "verify:backend:production"], timeoutMs: 180000 },
      ],
    },
    { name: "verify-production-gateway-sim", cmd: "npm", args: ["run", "verify:production-gateway:sim"], timeoutMs: 180000, cleanupBefore: true, cleanupAfter: true },
    { name: "tauri-build-m4", cmd: "npm", args: ["run", "tauri:build:m4"], timeoutMs: 1800000, cleanupBefore: true, cleanupAfter: true },
    { name: "smoke-gui-prod", cmd: "npm", args: ["run", "smoke:gui:prod"], timeoutMs: 300000, cleanupBefore: true, cleanupAfter: true },
    { name: "smoke-tauri-app", cmd: "node", args: ["scripts/smoke-tauri-app.mjs", "--no-build"], timeoutMs: 360000, cleanupBefore: true, cleanupAfter: true },
    { name: "smoke-dmg", cmd: "node", args: ["scripts/smoke-dmg.mjs", "--no-build"], timeoutMs: 300000, cleanupBefore: true, cleanupAfter: true },
    { name: "sign-macos-notarize", cmd: "npm", args: ["run", "sign:mac:notarize"], timeoutMs: 900000, cleanupBefore: true, cleanupAfter: true },
    { name: "cargo-test", cmd: "cargo", args: ["test", "--manifest-path", "src-tauri/Cargo.toml"], timeoutMs: 300000 },
    { name: "release-preflight-production", cmd: "npm", args: ["run", "release:preflight:production"], timeoutMs: 120000 },
    { name: "release-preflight-strict", cmd: "npm", args: ["run", "release:preflight:production:strict"], timeoutMs: 120000 },
    { name: "release-guard", cmd: "npm", args: ["run", "release:guard"], timeoutMs: 120000 },
  ];

  const results = [];
  const issues = [];
  for (const item of stepPlan) {
    if (item.parallel) {
      console.log(`\n=== ${item.group} ===`);
      cleanupPorts();
      const outcomes = await Promise.all(item.steps.map((step) => runStep(step)));
      for (const outcome of outcomes) {
        console.log(`\n--- ${outcome.name}: ${outcome.ok ? "PASS" : "FAIL"} (${outcome.durationMs} ms) ---`);
        if (outcome.output) console.log(outcome.output);
        results.push(outcome);
        const issue = classifyIssue(outcome);
        if (issue) issues.push({ ...issue, step: outcome.name });
      }
      cleanupPorts();
      continue;
    }

    console.log(`\n=== ${item.name} ===`);
    if (item.cleanupBefore) cleanupPorts();
    const outcome = await runStep(item);
    if (outcome.output) console.log(outcome.output);
    if (item.cleanupAfter) cleanupPorts();
    results.push(outcome);
    const issue = classifyIssue(outcome);
    if (issue) issues.push({ ...issue, step: item.name });
  }

  const workflowGate = await checkWorkflowGate();
  if (!workflowGate.ok) {
    issues.push({
      severity: "Blocker",
      category: "ProgramDefect",
      title: "release-macos workflow gate check failed",
      detail: workflowGate.detail,
      step: "workflow-gate-check",
    });
  }

  const hasBlocker = issues.some((item) => item.severity === "Blocker");
  const summary = {
    totalSteps: results.length,
    passedSteps: results.filter((item) => item.ok).length,
    failedSteps: results.filter((item) => !item.ok).length,
  };

  const report = {
    createdAt: nowIso(),
    result: hasBlocker ? "FAIL" : "PASS",
    summary,
    workflowGate,
    issues,
    steps: results.map((item) => ({
      name: item.name,
      command: item.command,
      ok: item.ok,
      status: item.status,
      signal: item.signal,
      durationMs: item.durationMs,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
    })),
  };

  const stamp = safeName(nowIso());
  const jsonPath = path.join(reportDir, `${stamp}-qa-full-cycle.json`);
  const mdPath = path.join(cwd, "QA_CYCLE_REPORT.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, toMarkdown(report), "utf8");

  console.log(`\nQA full-cycle JSON report: ${jsonPath}`);
  console.log(`QA markdown report: ${mdPath}`);
  console.log(`Result: ${report.result}`);
  if (report.result !== "PASS") process.exitCode = 1;
}

await main();
