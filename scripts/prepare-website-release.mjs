import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const outDir = path.join(cwd, "artifacts", "website", "clawdesk");

function parseArgs(argv) {
  return {
    metadataPath: valueArg(argv, "--metadata"),
    source: valueArg(argv, "--source"),
  };
}

function valueArg(argv, name) {
  const equals = argv.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function copyFile(src, dst) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}

async function copyIfExists(src, dst) {
  try {
    await copyFile(src, dst);
    return true;
  } catch {
    return false;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isReleaseMetadata(data) {
  return Boolean(
    data &&
      typeof data.version === "string" &&
      data.installer &&
      typeof data.installer === "object" &&
      typeof data.installer.fileName === "string" &&
      typeof data.installer.relativePath === "string" &&
      data.installer.signature &&
      typeof data.installer.signature === "object",
  );
}

async function resolveMetadata(options) {
  const packageJson = await readJson(path.join(cwd, "package.json"));
  const candidates = [];

  if (options.metadataPath) {
    candidates.push(path.join(cwd, options.metadataPath));
  }

  if (options.source) {
    candidates.push(path.join(cwd, "artifacts", options.source, `latest-${options.source}-beta.json`));
  } else {
    candidates.push(path.join(cwd, "artifacts", "macos-release", "latest-macos-beta.json"));
    candidates.push(path.join(cwd, "artifacts", "windows-release", "latest-windows-beta.json"));
  }

  if (options.source !== "windows") {
    candidates.push(path.join(cwd, "artifacts", "windows-release", "latest-windows-beta.json"));
  }
  if (options.source !== "macos") {
    candidates.push(path.join(cwd, "artifacts", "macos-release", "latest-macos-beta.json"));
  }

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    try {
      const metadata = await readJson(candidate);
      if (isReleaseMetadata(metadata)) {
        return { metadata, sourcePath: candidate, warnings: [] };
      }
    } catch {
      continue;
    }
  }

  return {
    metadata: {
      version: packageJson.version,
      installer: {
        fileName: "app.dmg",
        relativePath: "",
        sha256: "N/A",
        signature: { status: "missing" },
      },
    },
    sourcePath: null,
    warnings: ["未找到可讀取 release metadata，已改用 fallback metadata。"],
  };
}

async function transformDownloadPage() {
  const src = path.join(cwd, "docs", "download", "beta-windows.html");
  let html;
  try {
    html = await fs.readFile(src, "utf8");
    html = html
      .replaceAll('href="../legal/', 'href="./legal/')
      .replaceAll('href="../support/', 'href="./support/');
  } catch {
    html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ClawDesk 下載</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; margin: 2rem; }
      code { background: #f3f3f3; padding: 0.25rem 0.5rem; }
    </style>
  </head>
  <body>
    <h1>ClawDesk</h1>
    <p>MAC 版尚未提供官方下載頁範本，請補齊 <code>docs/download/beta-windows.html</code>。</p>
  </body>
</html>`;
  }
  await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
  if (!html.includes("<!doctype html>") || html.includes("尚未提供官方下載頁範本")) {
    return "missing-template";
  }
  return null;
}

const metadataResult = await resolveMetadata(parseArgs(process.argv.slice(2)));
const metadata = metadataResult.metadata;
const metadataSourcePath = metadataResult.sourcePath;
const copied = [];
const warnings = [...metadataResult.warnings];

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const downloadTemplateState = await transformDownloadPage();
copied.push("index.html");
if (downloadTemplateState) warnings.push(downloadTemplateState);

for (const [src, dst] of [
  ["docs/download/FAQ.md", "FAQ.md"],
  ["docs/support/CONTACT.md", "support/CONTACT.md"],
  ["docs/support/AUTO_REPLY_TEMPLATE.txt", "support/AUTO_REPLY_TEMPLATE.txt"],
  ["docs/legal/EULA.md", "legal/EULA.md"],
  ["docs/legal/DEVELOPER_DISCLOSURE.md", "legal/DEVELOPER_DISCLOSURE.md"],
  ["docs/legal/PRIVACY.md", "legal/PRIVACY.md"],
  ["docs/legal/REFUND_POLICY.md", "legal/REFUND_POLICY.md"],
  ["docs/legal/DIGITAL_CONTENT_WAIVER.md", "legal/DIGITAL_CONTENT_WAIVER.md"],
  ["docs/legal/AI_AGENT_RISK_NOTICE.md", "legal/AI_AGENT_RISK_NOTICE.md"],
  ["docs/legal/OPENCLAW_MIT_NOTICE.md", "legal/OPENCLAW_MIT_NOTICE.md"],
  ["docs/legal/THIRD_PARTY_NOTICES.md", "legal/THIRD_PARTY_NOTICES.md"],
  ["docs/legal/OPENCLAW_UPSTREAM_LICENSE.md", "legal/OPENCLAW_UPSTREAM_LICENSE.md"],
]) {
  if (await copyIfExists(path.join(cwd, src), path.join(outDir, dst))) copied.push(dst);
  else warnings.push(`missing:${src}`);
}

const outputMetadataName = metadataSourcePath ? path.basename(metadataSourcePath) : "latest-macos-beta.json";
await fs.writeFile(path.join(outDir, outputMetadataName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
copied.push(outputMetadataName);

if (metadata.installer.relativePath) {
  const installerSource = path.join(cwd, metadata.installer.relativePath);
  const installerTarget = path.join(outDir, metadata.installer.fileName);
  if (await copyIfExists(installerSource, installerTarget)) copied.push(metadata.installer.fileName);
  else warnings.push(`missing-installer:${metadata.installer.relativePath}`);
} else {
  warnings.push("missing-installer:metadata.installer.relativePath");
}

if (metadata.installer.signature.status !== "valid") {
  warnings.push(`signature-${metadata.installer.signature.status}:do-not-publish-paid-beta`);
}

const manifest = {
  createdAt: new Date().toISOString(),
  publishTarget: "https://naviaworks.net/clawdesk/",
  sourceMetadata: metadataSourcePath ? path.relative(cwd, metadataSourcePath).replace(/\\/g, "/") : "fallback-metadata",
  copied,
  warnings,
  release: {
    version: metadata.version,
    installer: metadata.installer.fileName,
    sha256: metadata.installer.sha256,
    signature: metadata.installer.signature.status,
  },
};

await fs.writeFile(path.join(outDir, "publish-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(
  path.join(outDir, "README_UPLOAD.md"),
  `# ClawDesk Website Upload Package

Upload this folder's contents to:

\`\`\`text
https://naviaworks.net/clawdesk/
\`\`\`

Entry point:

\`\`\`text
index.html
\`\`\`

Installer:

\`\`\`text
${metadata.installer.fileName}
\`\`\`

SHA256:

\`\`\`text
${metadata.installer.sha256}
\`\`\`

Signature status:

\`\`\`text
${metadata.installer.signature.status}
\`\`\`

Warnings:

${warnings.length > 0 ? warnings.map((item) => `- ${item}`).join("\n") : "- none"}

Do not publish as a paid Beta while signature status is not \`valid\`.
`,
  "utf8",
);
copied.push("README_UPLOAD.md", "publish-manifest.json");

console.log(JSON.stringify({ result: warnings.length > 0 ? "WARN" : "PASS", outDir, copied, warnings }, null, 2));
