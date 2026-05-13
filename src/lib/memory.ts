export interface MemoryItem {
  id: string;
  agentId: string;
  title: string;
  body: string;
  pinned: boolean;
  shared: boolean;
  source: "markdown" | "yaml" | "sqlite-index";
  createdAt: string;
}

export interface ContextStatus {
  modelContextLimit: number;
  estimatedTokens: number;
  rollingSummary: string;
  pinnedFacts: string[];
  compressionRatio: number;
  lastCompressedAt?: string;
}

export interface WorkspaceTruthSource {
  projectRoot: string;
  namespaces: {
    memory: string;
    knowledge: string;
    uploads: string;
    backups: string;
    agents: string;
  };
  markdownStrategy: {
    dailyLog: string;
    longTermMemory: string;
    pinnedFacts: string;
    compressionLog: string;
  };
  sqliteRole: "index-and-metadata-only";
}

export function createMemoryItem(input: Omit<MemoryItem, "id" | "createdAt" | "source">, now = new Date().toISOString()): MemoryItem {
  return {
    ...input,
    id: `mem-${Date.parse(now) || 0}`,
    source: "markdown",
    createdAt: now,
  };
}

export function compressContext(status: ContextStatus, now = new Date().toISOString()): ContextStatus {
  const estimatedTokens = Math.max(800, Math.round(status.estimatedTokens * 0.42));
  return {
    ...status,
    estimatedTokens,
    rollingSummary: `${status.rollingSummary}\n已壓縮舊對話並保留釘選事實。`.trim(),
    compressionRatio: Number((estimatedTokens / status.estimatedTokens).toFixed(2)),
    lastCompressedAt: now,
  };
}

export function buildWorkspaceTruthSource(projectRoot: string): WorkspaceTruthSource {
  const normalized = projectRoot.trim().replace(/\/+$/, "");
  const root = normalized || "~/ClawDesk";
  return {
    projectRoot: root,
    namespaces: {
      memory: `${root}/memory`,
      knowledge: `${root}/knowledge`,
      uploads: `${root}/uploads`,
      backups: `${root}/backups`,
      agents: `${root}/agents`,
    },
    markdownStrategy: {
      dailyLog: `${root}/memory/daily`,
      longTermMemory: `${root}/memory/long-term.md`,
      pinnedFacts: `${root}/memory/pinned-facts.md`,
      compressionLog: `${root}/memory/context-compression.yml`,
    },
    sqliteRole: "index-and-metadata-only",
  };
}
