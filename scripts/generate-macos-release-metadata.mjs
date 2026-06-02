import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const bundleRoot = path.join(cwd, "src-tauri", "target", "aarch64-apple-darwin", "release", "bundle");
const metadataDir = path.join(cwd, "artifacts", "macos-release");
const metadataPath = path.join(metadataDir, "latest-macos-beta.json");

const packageJson = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const requireSignature = process.argv.includes("--require-signature");

function runCodesign(filePath) {
  try {
    const result = spawnSync("codesign", ["--verify", "--deep", "--strict", filePath], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    if (result.status === 0) {
      return {
        status: "valid",
        codesign: "codesign",
        stdout: String(result.stdout ?? "").slice(0, 1200),
        stderr: String(result.stderr ?? "").slice(0, 1200),
      };
    }

    return {
      status: "invalid",
      codesign: "codesign",
      stdout: String(result.stdout ?? "").slice(0, 1200),
      stderr: String(result.stderr ?? "").slice(0, 1200),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: "unknown",
        reason: "codesign-not-found",
      };
    }

    return {
      status: "invalid",
      reason: String(error?.message ?? "codesign-unexpected-error").slice(0, 1200),
    };
  }
}

async function newestDmg(rootPath) {
  const stack = [rootPath];
  const found = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".dmg")) continue;
      const stat = await fs.stat(fullPath);
      found.push({
        name: entry.name,
        filePath: fullPath,
        relativePath: path.relative(cwd, fullPath),
        bytes: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found[0] ?? null;
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function stableMetadataForCheck(input) {
  return {
    productName: input.productName,
    channel: input.channel,
    version: input.version,
    developer: input.developer,
    supportEmail: input.supportEmail,
    installer: {
      fileName: input.installer?.fileName,
      relativePath: input.installer?.relativePath,
      bytes: input.installer?.bytes,
      sha256: input.installer?.sha256,
      signatureStatus: input.installer?.signature?.status,
    },
    legal: input.legal,
  };
}

const installer = await newestDmg(bundleRoot);
if (!installer) {
  console.error(`No macOS dmg found under ${bundleRoot}`);
  process.exit(1);
}

const signature = runCodesign(installer.filePath);
const metadata = {
  createdAt: new Date().toISOString(),
  productName: "ClawDesk",
  channel: "beta-direct",
  version: packageJson.version,
  updatedDate: new Date().toISOString().slice(0, 10),
  developer: "Alisonsoftware",
  supportEmail: "alison.ai.tech.studio@gmail.com",
  installer: {
    fileName: installer.name,
    relativePath: installer.relativePath.replace(/\\/g, "/"),
    bytes: installer.bytes,
    sha256: await sha256(installer.filePath),
    signature,
  },
  legal: [
    "docs/legal/EULA.md",
    "docs/legal/PRIVACY.md",
    "docs/legal/REFUND_POLICY.md",
    "docs/legal/DIGITAL_CONTENT_WAIVER.md",
    "docs/legal/AI_AGENT_RISK_NOTICE.md",
    "docs/legal/OPENCLAW_MIT_NOTICE.md",
    "docs/legal/THIRD_PARTY_NOTICES.md",
  ],
};

const failures = [];
if (!metadata.installer.fileName.includes("ClawDesk")) failures.push("installer-name-missing-product");
if (!metadata.installer.fileName.includes(metadata.version)) failures.push("installer-name-missing-version");
if (metadata.installer.bytes < 1024 * 1024) failures.push("installer-too-small");
if (requireSignature && metadata.installer.signature.status !== "valid") failures.push("signature-invalid");

await fs.mkdir(metadataDir, { recursive: true });

if (checkOnly) {
  const existing = JSON.parse(await fs.readFile(metadataPath, "utf8").catch(() => "{}"));
  if (JSON.stringify(stableMetadataForCheck(existing), null, 2) !== JSON.stringify(stableMetadataForCheck(metadata), null, 2)) {
    failures.push("metadata-stale");
  }
} else {
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

console.log(`macOS release metadata: ${metadataPath}`);
console.log(`Installer: ${metadata.installer.fileName}`);
console.log(`SHA256: ${metadata.installer.sha256}`);
console.log(`Signature: ${metadata.installer.signature.status}`);

if (failures.length > 0) {
  console.error(`Failures: ${failures.join(", ")}`);
  process.exitCode = 1;
}
