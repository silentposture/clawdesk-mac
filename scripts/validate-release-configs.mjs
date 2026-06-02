import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

function parseArgs(argv) {
  return {
    store: argv.includes("--store"),
    macos: argv.includes("--macos"),
  };
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(cwd, relativePath), "utf8"));
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(cwd, relativePath));
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resourceKeys(config) {
  const resources = config.bundle?.resources ?? {};
  return typeof resources === "object" && !Array.isArray(resources) ? Object.keys(resources) : [];
}

async function validateStoreConfig() {
  const config = await readJson("src-tauri/tauri.microsoftstore.conf.json");
  const resources = resourceKeys(config);
  assert(config.productName === "ClawDesk", "Store config productName must be ClawDesk.");
  assert(config.bundle?.publisher === "Alisonsoftware", "Store config bundle.publisher must be Alisonsoftware.");
  assert(config.bundle?.targets?.includes("nsis"), "Store config must target nsis for Microsoft Store offline installer submission.");
  assert(config.bundle?.windows?.webviewInstallMode?.type === "offlineInstaller", "Store config must embed WebView2 offlineInstaller.");
  assert(config.bundle?.windows?.digestAlgorithm?.toLowerCase() === "sha256", "Store config must use SHA-256 digest.");
  assert(config.bundle?.windows?.timestampUrl, "Store config must define a timestamp URL for code signing.");
  assert(!resources.includes("../sidecars/mock-gateway/server.mjs"), "Store config must not bundle mock Gateway.");
  for (const required of [
    "../docs/legal/INSTALLER_TERMS.md",
    "../docs/legal/DEVELOPER_DISCLOSURE.md",
    "../docs/legal/OPENCLAW_MIT_NOTICE.md",
    "../docs/legal/THIRD_PARTY_NOTICES.md",
    "../docs/support/CONTACT.md",
  ]) {
    assert(resources.includes(required), `Store config must bundle ${required}.`);
  }
  return { target: "store-win", publisher: config.bundle.publisher, webviewInstallMode: config.bundle.windows.webviewInstallMode };
}

async function validateMacosConfig() {
  const config = await readJson("src-tauri/tauri.macos.conf.json");
  const resources = resourceKeys(config);
  assert(config.productName === "ClawDesk", "macOS config productName must be ClawDesk.");
  assert(config.bundle?.publisher === "Alisonsoftware", "macOS config bundle.publisher must be Alisonsoftware.");
  assert(config.bundle?.targets?.includes("app"), "macOS config must target app.");
  assert(config.bundle?.targets?.includes("dmg"), "macOS config must target dmg.");
  assert(config.bundle?.macOS?.dmg, "macOS config must define dmg layout.");
  assert(!resources.includes("../sidecars/mock-gateway/server.mjs"), "macOS release config must not bundle mock Gateway.");
  for (const required of [
    "../docs/legal/INSTALLER_TERMS.md",
    "../docs/legal/DEVELOPER_DISCLOSURE.md",
    "../docs/legal/OPENCLAW_MIT_NOTICE.md",
    "../docs/legal/THIRD_PARTY_NOTICES.md",
    "../docs/support/CONTACT.md",
  ]) {
    assert(resources.includes(required), `macOS config must bundle ${required}.`);
  }
  return { target: "macos", targets: config.bundle.targets };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const hasStoreConfig = await pathExists("src-tauri/tauri.microsoftstore.conf.json");
  const hasMacosConfig = await pathExists("src-tauri/tauri.macos.conf.json");

  if (options.store && !hasStoreConfig) {
    throw new Error("缺少 src-tauri/tauri.microsoftstore.conf.json，請補上 Windows Store 設定檔。");
  }
  if (options.macos && !hasMacosConfig) {
    throw new Error("缺少 src-tauri/tauri.macos.conf.json，請補上 macOS 設定檔。");
  }
  if (!options.store && !options.macos && !hasStoreConfig && !hasMacosConfig) {
    console.log(
      JSON.stringify(
        { result: "WARN", checks: [], skipped: ["缺少 src-tauri/tauri.microsoftstore.conf.json 與 src-tauri/tauri.macos.conf.json。"] },
        null,
        2,
      ),
    );
    return;
  }

  const checks = [];
  const checksFailed = [];

  const shouldRunStore = options.store || (!options.macos && hasStoreConfig);
  const shouldRunMacos = options.macos || (!options.store && hasMacosConfig);

  if (shouldRunStore) {
    checks.push(await validateStoreConfig());
  }
  if (shouldRunMacos) {
    checks.push(await validateMacosConfig());
  }

  if (options.store && !shouldRunStore) {
    checksFailed.push("缺少 windows store config，無法進行 --store 驗證。");
  }
  if (options.macos && !shouldRunMacos) {
    checksFailed.push("缺少 macOS config，無法進行 --macos 驗證。");
  }

  if (checks.length === 0) {
    checksFailed.push("缺少可驗證的發佈設定檔。");
  }

  if (checksFailed.length > 0) {
    console.log(JSON.stringify({ result: "WARN", checks, skipped: checksFailed }, null, 2));
    return;
  }

  console.log(JSON.stringify({ result: "PASS", checks }, null, 2));
}

await main();
