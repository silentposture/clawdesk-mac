export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  model: string;
  modelProvider: "chatgpt-pro" | "openai-api" | "gemini-api" | "ollama" | "mock";
  workspaceId: string;
  toolPermissions: string[];
  knowledgeBaseIds: string[];
  memoryScope: "private" | "project" | "shared";
  learningMode: "off" | "observe" | "rehearse-only";
  allowedProjectFolders: string[];
  sharedKnowledge: boolean;
}

export interface AgentKnowledgeItem {
  id: string;
  agentId: string;
  title: string;
  shared: boolean;
}

export interface AgentTaskCard {
  id: string;
  title: string;
  orchestrator: string;
  assignedAgentIds: string[];
  status: "orchestrator" | "waiting-approval" | "completed" | "failed";
  risk: "low" | "medium" | "high";
  projectFolder: string;
}

export const defaultAgents: AgentProfile[] = [
  {
    id: "personal-assistant",
    name: "個人助理",
    role: "整理日常任務、提醒與跨工具協作。",
    model: "ChatGPT Pro / local adapter",
    modelProvider: "chatgpt-pro",
    workspaceId: "desktop-mvp",
    toolPermissions: ["calendar.read", "mail.draft", "file.read"],
    knowledgeBaseIds: ["kb-drive-sales"],
    memoryScope: "private",
    learningMode: "rehearse-only",
    allowedProjectFolders: ["~/ClawDesk/projects/personal"],
    sharedKnowledge: false,
  },
  {
    id: "document-assistant",
    name: "文書助理",
    role: "處理 Word、Excel、PowerPoint 與 PDF 文件。",
    model: "ChatGPT Pro / document adapter",
    modelProvider: "chatgpt-pro",
    workspaceId: "docs-brief",
    toolPermissions: ["office.read", "office.write-with-approval"],
    knowledgeBaseIds: ["kb-drive-sales"],
    memoryScope: "project",
    learningMode: "observe",
    allowedProjectFolders: ["~/ClawDesk/projects/docs-brief"],
    sharedKnowledge: false,
  },
  {
    id: "automation-assistant",
    name: "自動化助理",
    role: "建立排程、工作流與 MCP 工具串接。",
    model: "ChatGPT Pro / workflow adapter",
    modelProvider: "chatgpt-pro",
    workspaceId: "desktop-mvp",
    toolPermissions: ["workflow.run-with-approval", "mcp.connect"],
    knowledgeBaseIds: ["kb-db-salescrm"],
    memoryScope: "project",
    learningMode: "rehearse-only",
    allowedProjectFolders: ["~/ClawDesk/projects/desktop-mvp"],
    sharedKnowledge: false,
  },
  {
    id: "research-assistant",
    name: "研究助理",
    role: "整理網路資料、來源與長篇 Context。",
    model: "ChatGPT Pro / research adapter",
    modelProvider: "chatgpt-pro",
    workspaceId: "live-canvas",
    toolPermissions: ["browser.read", "knowledge.write"],
    knowledgeBaseIds: ["kb-image-corpus"],
    memoryScope: "shared",
    learningMode: "off",
    allowedProjectFolders: ["~/ClawDesk/projects/research"],
    sharedKnowledge: true,
  },
];

export const defaultAgentTasks: AgentTaskCard[] = [
  {
    id: "task-orchestrator-brief",
    title: "整理本週商務文件並產生工作流草稿",
    orchestrator: "automation-assistant",
    assignedAgentIds: ["document-assistant", "research-assistant"],
    status: "orchestrator",
    risk: "medium",
    projectFolder: "~/ClawDesk/projects/docs-brief",
  },
  {
    id: "task-waiting-approval",
    title: "預演 Outlook 回覆草稿與 OneDrive 搜尋",
    orchestrator: "personal-assistant",
    assignedAgentIds: ["personal-assistant", "document-assistant"],
    status: "waiting-approval",
    risk: "medium",
    projectFolder: "~/ClawDesk/projects/personal",
  },
  {
    id: "task-completed-memory",
    title: "更新 pinned facts 與長期記憶摘要",
    orchestrator: "research-assistant",
    assignedAgentIds: ["research-assistant"],
    status: "completed",
    risk: "low",
    projectFolder: "~/ClawDesk/projects/research",
  },
];

export function canAgentReadKnowledge(agent: AgentProfile, item: AgentKnowledgeItem): boolean {
  return item.agentId === agent.id || item.shared || agent.memoryScope === "shared" || agent.sharedKnowledge;
}

export function canAgentUseProjectFolder(agent: AgentProfile, folder: string): boolean {
  const normalized = folder.trim().replace(/\/+$/, "");
  return agent.allowedProjectFolders.some((allowed) => normalized === allowed.replace(/\/+$/, ""));
}

export function summarizeAgentTask(task: AgentTaskCard): string {
  return `${task.title}：${task.status}，${task.assignedAgentIds.length} 個 Agent，風險 ${task.risk}`;
}
