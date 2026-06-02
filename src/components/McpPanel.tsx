import {
  Boxes,
  Braces,
  Building2,
  Calendar,
  Chrome,
  Cloud,
  Code2,
  Container,
  FileText,
  GitBranch,
  Globe2,
  Mail,
  Presentation,
  Search,
  Server,
  Sheet,
  SquareTerminal,
  X,
  PlugZap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { McpActionPreview, McpConnectionGrant, McpConnector, McpTool } from "../lib/mcp";
import { mcpTierLabel, planMcpAction, recommendedScopes, summarizeConnector } from "../lib/mcp";

interface McpPanelProps {
  gatewayBaseUrl?: string;
  onClose: () => void;
}

const appIcons: Record<McpTool["app"], typeof FileText> = {
  Word: FileText,
  Excel: Sheet,
  PowerPoint: Presentation,
  Outlook: Mail,
  OneDrive: Cloud,
  Teams: PlugZap,
  "Google Drive": Cloud,
  "Google Docs": FileText,
  "Google Sheets": Sheet,
  "Google Slides": Presentation,
  Gmail: Mail,
  "Google Calendar": Calendar,
  Chrome,
  Browser: Globe2,
  "VS Code": Code2,
  Xcode: Code2,
  JetBrains: Code2,
  GitHub: GitBranch,
  GitLab: GitBranch,
  Docker: Container,
  Terminal: SquareTerminal,
  AutoCAD: Building2,
  "Fusion 360": Boxes,
  SolidWorks: Boxes,
  MATLAB: Braces,
  Jupyter: Braces,
  AWS: Server,
  Azure: Cloud,
  "Google Cloud": Cloud,
  Cloudflare: Globe2,
  Vercel: Server,
  Supabase: Server,
};

const riskLabel: Record<McpTool["risk"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function McpPanel({ gatewayBaseUrl, onClose }: McpPanelProps): JSX.Element {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [grants, setGrants] = useState<McpConnectionGrant[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState("microsoft-office");
  const [target, setTarget] = useState("~/Documents/ClawDesk");
  const [preview, setPreview] = useState<McpActionPreview>();
  const [oauthMessage, setOauthMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const selectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === selectedConnectorId),
    [connectors, selectedConnectorId],
  );

  useEffect(() => {
    void loadConnectors();
  }, [gatewayBaseUrl]);

  async function loadConnectors() {
    if (!gatewayBaseUrl) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${gatewayBaseUrl}/mcp/connectors`);
      if (!response.ok) throw new Error("bad response");
      const payload = (await response.json()) as { connectors: McpConnector[]; grants?: McpConnectionGrant[] };
      setConnectors(payload.connectors);
      setGrants(payload.grants ?? []);
      setSelectedConnectorId(payload.connectors[0]?.id ?? "microsoft-office");
    } catch {
      setError("無法讀取 MCP 連接器清單。");
    } finally {
      setBusy(false);
    }
  }

  async function connect(connectorId: string) {
    if (!gatewayBaseUrl) return;
    const connector = connectors.find((item) => item.id === connectorId);
    if (!connector) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${gatewayBaseUrl}/mcp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId,
          scopes: recommendedScopes(connector),
        }),
      });
      if (!response.ok) throw new Error("bad response");
      await loadConnectors();
    } catch {
      setError("MCP 連接器啟用失敗。");
      setBusy(false);
    }
  }

  async function revoke(connectorId: string) {
    if (!gatewayBaseUrl) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${gatewayBaseUrl}/mcp/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId }),
      });
      if (!response.ok) throw new Error("bad response");
      setPreview(undefined);
      await loadConnectors();
    } catch {
      setError("MCP 授權撤銷失敗。");
      setBusy(false);
    }
  }

  async function startMicrosoftOAuth() {
    if (!gatewayBaseUrl) return;
    setBusy(true);
    setError(undefined);
    setOauthMessage(undefined);
    try {
      const response = await fetch(`${gatewayBaseUrl}/mcp/microsoft/oauth/start?scopes=${encodeURIComponent("openid profile offline_access User.Read Files.Read Files.ReadWrite Mail.ReadWrite Calendars.Read")}`);
      const payload = (await response.json()) as { authorizationUrl?: string; configured?: boolean; faultCode?: string; missingEnv?: string[] };
      if (!response.ok) throw new Error("bad response");
      setOauthMessage(
        payload.configured
          ? `Microsoft OAuth URL 已建立：${payload.authorizationUrl}`
          : `Microsoft OAuth 尚未設定 production credentials：${payload.missingEnv?.join("、") ?? payload.faultCode}`,
      );
    } catch {
      setError("Microsoft OAuth 啟動失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(tool: McpTool) {
    if (!gatewayBaseUrl || !selectedConnector) return;
    setBusy(true);
    setError(undefined);
    try {
      const localPreview = planMcpAction(selectedConnector, tool.id, target.trim() || "~/Documents");
      const response = await fetch(`${gatewayBaseUrl}/mcp/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localPreview),
      });
      if (!response.ok) throw new Error("bad response");
      setPreview((await response.json()) as McpActionPreview);
    } catch {
      setError("無法建立 MCP 動作預覽。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="mcp-panel" role="dialog" aria-modal="true" aria-labelledby="mcp-title">
        <header className="provider-header">
          <div>
            <h2 id="mcp-title">MCP 連接器中心</h2>
            <p>先以本機 mock adapter 建立文書、開發、工程、雲端與瀏覽器能力邊界，正式整合時可替換為各服務的 MCP server 或 API。</p>
          </div>
          <button className="icon-button" type="button" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="mcp-layout">
          <aside className="mcp-connectors">
            {connectors.map((connector) => (
              <button
                className={connector.id === selectedConnectorId ? "active" : ""}
                key={connector.id}
                type="button"
                onClick={() => setSelectedConnectorId(connector.id)}
              >
                <PlugZap size={17} />
                <span>
                  <strong>{connector.name}</strong>
                  <small>{summarizeConnector(connector)}</small>
                </span>
              </button>
            ))}
          </aside>

          <section className="mcp-detail">
            {selectedConnector ? (
              <>
                <div className="mcp-detail-head">
                  <div>
                    <span>{mcpTierLabel(selectedConnector.tier)} · {selectedConnector.vendor} · {selectedConnector.transport}</span>
                    <h3>{selectedConnector.name}</h3>
                    <p>{selectedConnector.description}</p>
                    {selectedConnector.protocols?.length ? (
                      <small>
                        協定：{selectedConnector.protocols.map((protocol) => protocol.name).join("、")}
                      </small>
                    ) : null}
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy || selectedConnector.status === "connected"}
                    onClick={() => connect(selectedConnector.id)}
                  >
                    {selectedConnector.status === "connected" ? "已啟用" : "啟用"}
                  </button>
                  {selectedConnector.status === "connected" ? (
                    <button className="secondary-button" type="button" disabled={busy} onClick={() => revoke(selectedConnector.id)}>
                      撤銷授權
                    </button>
                  ) : null}
                  {selectedConnector.id === "microsoft-office" ? (
                    <button className="secondary-button" type="button" disabled={busy} onClick={startMicrosoftOAuth}>
                      Microsoft OAuth
                    </button>
                  ) : null}
                </div>
                {oauthMessage ? <p className="panel-success">{oauthMessage}</p> : null}
                {selectedConnector.scopes?.length ? (
                  <div className="mcp-preview">
                    <span>授權範圍</span>
                    <p>
                      {selectedConnector.scopes.map((scope) => `${scope.label} (${scope.risk})`).join("、")}
                    </p>
                    <small>
                      目前 grant：
                      {grants.find((grant) => grant.connectorId === selectedConnector.id)?.scopes.join("、") ?? "尚未授權"}
                    </small>
                  </div>
                ) : null}

                <label className="mcp-target">
                  <span>目標路徑 / 資源</span>
                  <input value={target} onChange={(event) => setTarget(event.target.value)} />
                </label>

                <div className="mcp-tool-grid">
                  {selectedConnector.tools.map((tool) => {
                    const Icon = appIcons[tool.app];
                    return (
                      <article className="mcp-tool" key={tool.id}>
                        <div>
                          <Icon size={18} />
                          <span>
                            <strong>{tool.name}</strong>
                            <small>{tool.app} · 風險 {riskLabel[tool.risk]}</small>
                          </span>
                        </div>
                        <p>{tool.description}</p>
                        <button className="secondary-button" type="button" onClick={() => runPreview(tool)} disabled={busy}>
                          <Search size={15} />
                          預覽動作
                        </button>
                      </article>
                    );
                  })}
                </div>

                {preview ? (
                  <div className="mcp-preview">
                    <span>動作預覽</span>
                    <strong>{preview.title}</strong>
                    <p>{preview.summary}</p>
                    {preview.protocol ? (
                      <small>
                        協定：{preview.protocol.name} ({preview.protocol.auth})，傳輸 {preview.protocol.transport}
                      </small>
                    ) : null}
                    <small>{preview.requiresApproval ? "需要使用者授權後才會執行" : "低風險受信任工作區動作"}</small>
                    {preview.grant ? (
                      <small>
                        Grant：{preview.grant.status}
                        {preview.grant.missingScopes.length ? `，缺少 scope：${preview.grant.missingScopes.join("、")}` : "，scope 已滿足"}
                      </small>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mcp-empty">尚未載入 MCP 連接器。</div>
            )}
            {error ? <p className="panel-error">{error}</p> : null}
          </section>
        </div>
      </section>
    </div>
  );
}
