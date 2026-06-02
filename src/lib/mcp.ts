export type McpStatus = "disabled" | "available" | "connected" | "requires-approval";

export type McpRisk = "low" | "medium" | "high";
export type McpTier = "core" | "business" | "engineering";

export interface McpProtocol {
  id: string;
  name: string;
  auth: string;
  transport: "https" | "stdio" | "http" | "mock" | "sse" | "websocket";
  description: string;
  scopes?: string[];
  endpoints?: string[];
  localAdapter?: boolean;
}

export interface McpScopeGrant {
  id: string;
  label: string;
  risk: McpRisk;
  requiredFor: string[];
}

export interface McpTool {
  id: string;
  name: string;
  app:
    | "Word"
    | "Excel"
    | "PowerPoint"
    | "Outlook"
    | "OneDrive"
    | "Teams"
    | "Google Drive"
    | "Google Docs"
    | "Google Sheets"
    | "Google Slides"
    | "Gmail"
    | "Google Calendar"
    | "Chrome"
    | "Browser"
    | "VS Code"
    | "Xcode"
    | "JetBrains"
    | "GitHub"
    | "GitLab"
    | "Docker"
    | "Terminal"
    | "AutoCAD"
    | "Fusion 360"
    | "SolidWorks"
    | "MATLAB"
    | "Jupyter"
    | "AWS"
    | "Azure"
    | "Google Cloud"
    | "Cloudflare"
    | "Vercel"
    | "Supabase";
  description: string;
  risk: McpRisk;
  permission: "ask" | "trusted-workspace";
}

export interface McpConnector {
  id: string;
  name: string;
  tier: McpTier;
  vendor: "Microsoft" | "Google" | "Local" | "Developer" | "Engineering" | "Cloud";
  status: McpStatus;
  transport: "stdio" | "http" | "mock";
  description: string;
  tools: McpTool[];
  protocols?: McpProtocol[];
  scopes?: McpScopeGrant[];
  revokeSupported?: boolean;
  auditSupported?: boolean;
}

export interface McpConnectionGrant {
  grantId: string;
  connectorId: string;
  status: "active" | "revoked";
  scopes: string[];
  issuedAt: string;
  revokedAt?: string | null;
  expiresAt?: string | null;
  auditId: string;
}

export interface McpAuditEvent {
  id: string;
  action: string;
  connectorId: string;
  scopeCount?: number;
  status?: string;
  createdAt: string;
}

export interface McpActionPreview {
  connectorId: string;
  toolId: string;
  title: string;
  target: string;
  risk: McpRisk;
  requiresApproval: boolean;
  summary: string;
  protocol?: {
    id: string;
    name: string;
    auth: string;
    transport: McpProtocol["transport"];
  };
  grant?: {
    grantId?: string;
    status: "active" | "revoked" | "missing";
    scopes: string[];
    missingScopes: string[];
  };
}

export const microsoftOfficeToolIds = [
  "word.summarize",
  "word.redline",
  "excel.inspect",
  "excel.build-chart",
  "powerpoint.outline",
  "outlook.draft-reply",
  "onedrive.search",
] as const;

export function summarizeConnector(connector: McpConnector): string {
  const connected = connector.status === "connected" ? "已連線" : "未連線";
  return `${connector.name}：${mcpTierLabel(connector.tier)}，${connected}，${connector.tools.length} 個工具`;
}

export function recommendedScopes(connector: McpConnector): string[] {
  if (connector.scopes?.length) {
    return connector.scopes.filter((scope) => scope.risk !== "high").map((scope) => scope.id);
  }
  return connector.protocols?.flatMap((protocol) => protocol.scopes ?? []).slice(0, 4) ?? [];
}

export function mcpTierLabel(tier: McpTier): string {
  if (tier === "core") return "Core";
  if (tier === "business") return "Business";
  return "Engineering";
}

export function groupConnectorsByTier(connectors: McpConnector[]): Record<McpTier, McpConnector[]> {
  return {
    core: connectors.filter((connector) => connector.tier === "core"),
    business: connectors.filter((connector) => connector.tier === "business"),
    engineering: connectors.filter((connector) => connector.tier === "engineering"),
  };
}

export function connectorSupportsTool(connector: McpConnector, toolId: string): boolean {
  return connector.tools.some((tool) => tool.id === toolId);
}

export function planMcpAction(connector: McpConnector, toolId: string, target: string): McpActionPreview {
  const tool = connector.tools.find((item) => item.id === toolId);
  if (!tool) {
    throw new Error(`MCP 工具不存在：${toolId}`);
  }

  return {
    connectorId: connector.id,
    toolId: tool.id,
    title: `${tool.app} · ${tool.name}`,
    target,
    risk: tool.risk,
    requiresApproval: tool.permission === "ask" || tool.risk !== "low",
    summary: `${tool.description} 目標：${target}`,
  };
}
