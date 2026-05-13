import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const artifactsRoot = path.join(cwd, "artifacts");
const outputDir = path.join(artifactsRoot, "release-summary");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function newestJsonIn(dirPath) {
  if (!(await exists(dirPath))) return null;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) return null;
  const name = files[files.length - 1];
  const filePath = path.join(dirPath, name);
  const raw = await fs.readFile(filePath, "utf8");
  return {
    name,
    filePath,
    data: JSON.parse(raw),
  };
}

function rel(filePath) {
  return path.relative(cwd, filePath);
}

function statusMark(value) {
  return value ? "PASS" : "FAIL";
}

function extractSummary(reportKey, report) {
  if (!report) {
    return {
      key: reportKey,
      present: false,
      status: "MISSING",
      detail: "no report found",
      path: null,
    };
  }

  if (reportKey === "qa-loop") {
    const status = report.data.result === "PASS";
    const summary = report.data.summary || {};
    return {
      key: reportKey,
      present: true,
      status: statusMark(status),
      detail: `result=${report.data.result}, steps=${summary.totalSteps ?? "n/a"}, failed=${summary.failedSteps ?? "n/a"}`,
      path: rel(report.filePath),
    };
  }

  if (reportKey === "release-guard") {
    const status = report.data.result === "PASS";
    const readiness = report.data.readiness?.summary?.overall ?? "unknown";
    return {
      key: reportKey,
      present: true,
      status: statusMark(status),
      detail: `result=${report.data.result}, readiness=${readiness}`,
      path: rel(report.filePath),
    };
  }

  if (reportKey === "preflight-strict") {
    const result = String(report.data.result || "").toUpperCase();
    const blocked = (report.data.checks || []).filter((item) => item.status === "blocked").length;
    const onlyExternalBlocked = result === "FAIL" && blocked > 0;
    return {
      key: reportKey,
      present: true,
      status: onlyExternalBlocked ? "WARN" : statusMark(result === "PASS"),
      detail: `result=${report.data.result}, blocked=${blocked}`,
      path: rel(report.filePath),
    };
  }

  if (reportKey === "gui-smoke") {
    const failed = report.data.counts?.failed ?? report.data.failed ?? 0;
    const status = Number(failed) === 0;
    return {
      key: reportKey,
      present: true,
      status: statusMark(status),
      detail: `failed=${failed}`,
      path: rel(report.filePath),
    };
  }

  if (reportKey === "dmg-smoke" || reportKey === "tauri-app-smoke") {
    const statusText = String(report.data.status || report.data.result || "").toLowerCase();
    const checks = Array.isArray(report.data.checks) ? report.data.checks : [];
    const checksAllPass = checks.length > 0 ? checks.every((item) => item && item.ok === true) : false;
    const status =
      statusText === "pass" ||
      statusText === "ok" ||
      report.data.result === "PASS" ||
      report.data.ok === true ||
      checksAllPass;
    return {
      key: reportKey,
      present: true,
      status: statusMark(status),
      detail: `status=${report.data.status ?? report.data.result ?? (status ? "PASS" : "FAIL")}`,
      path: rel(report.filePath),
    };
  }

  return {
    key: reportKey,
    present: true,
    status: "PASS",
    detail: "report found",
    path: rel(report.filePath),
  };
}

function renderMarkdown(payload) {
  const lines = [];
  lines.push("# Release Summary");
  lines.push("");
  lines.push(`- generatedAt: ${payload.generatedAt}`);
  lines.push(`- overall: ${payload.overall}`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  for (const item of payload.items) {
    lines.push(`- ${item.key}: ${item.status}`);
    lines.push(`  - detail: ${item.detail}`);
    if (item.path) lines.push(`  - report: ${item.path}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const dirs = {
    "qa-loop": path.join(artifactsRoot, "qa-loop"),
    "gui-smoke": path.join(artifactsRoot, "gui-smoke"),
    "tauri-app-smoke": path.join(artifactsRoot, "tauri-app-smoke"),
    "dmg-smoke": path.join(artifactsRoot, "dmg-smoke"),
    "release-guard": path.join(artifactsRoot, "release-guard"),
  };

  const strictPreflightDir = path.join(artifactsRoot, "production-release-preflight");
  const preflightReport = await newestJsonIn(strictPreflightDir);
  const strictReport =
    preflightReport && /-strict-/.test(preflightReport.name)
      ? preflightReport
      : await (async () => {
          if (!(await exists(strictPreflightDir))) return null;
          const entries = await fs.readdir(strictPreflightDir);
          const strictNames = entries.filter((name) => name.endsWith(".json") && /-strict-/.test(name)).sort();
          if (strictNames.length === 0) return null;
          const name = strictNames[strictNames.length - 1];
          const filePath = path.join(strictPreflightDir, name);
          const raw = await fs.readFile(filePath, "utf8");
          return { name, filePath, data: JSON.parse(raw) };
        })();

  const loaded = {};
  for (const [key, dirPath] of Object.entries(dirs)) {
    loaded[key] = await newestJsonIn(dirPath);
  }
  loaded["preflight-strict"] = strictReport;

  const order = [
    "qa-loop",
    "gui-smoke",
    "tauri-app-smoke",
    "dmg-smoke",
    "preflight-strict",
    "release-guard",
  ];

  const items = order.map((key) => extractSummary(key, loaded[key]));
  const hasFail = items.some((item) => item.status === "FAIL");
  const hasWarnOrMissing = items.some((item) => item.status === "WARN" || item.status === "MISSING");
  const overall = hasFail ? "FAIL" : hasWarnOrMissing ? "WARN" : "PASS";

  const payload = {
    generatedAt: new Date().toISOString(),
    overall,
    items,
  };

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = payload.generatedAt.replace(/[:.]/g, "_");
  const jsonPath = path.join(outputDir, `${stamp}-release-summary.json`);
  const mdPath = path.join(outputDir, `${stamp}-release-summary.md`);
  const latestJsonPath = path.join(outputDir, "latest-release-summary.json");
  const latestMdPath = path.join(outputDir, "latest-release-summary.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(payload), "utf8");
  await fs.writeFile(latestJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(latestMdPath, renderMarkdown(payload), "utf8");

  console.log(`Release summary JSON: ${jsonPath}`);
  console.log(`Release summary Markdown: ${mdPath}`);
  console.log(`Latest summary Markdown: ${latestMdPath}`);
  console.log(`Overall: ${overall}`);
}

await main();
