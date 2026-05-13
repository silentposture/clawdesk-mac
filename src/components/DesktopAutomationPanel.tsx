import { Eye, LockKeyhole, MousePointerClick, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AccessibilityStatus,
  DesktopActionRehearsal,
  DesktopActionRequest,
  DesktopWindowSnapshot,
} from "../lib/desktopAutomation";
import { buildDesktopActionRehearsal } from "../lib/desktopAutomation";
import { Tooltip } from "./Tooltip";

interface DesktopAutomationPanelProps {
  gatewayBaseUrl?: string;
  onClose: () => void;
}

export function DesktopAutomationPanel({ gatewayBaseUrl, onClose }: DesktopAutomationPanelProps): JSX.Element {
  const [status, setStatus] = useState<AccessibilityStatus>();
  const [snapshot, setSnapshot] = useState<DesktopWindowSnapshot>();
  const [rehearsal, setRehearsal] = useState<DesktopActionRehearsal>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void load();
  }, [gatewayBaseUrl]);

  async function load() {
    if (!gatewayBaseUrl) return;
    setError(undefined);
    try {
      const [statusResponse, snapshotResponse] = await Promise.all([
        fetch(`${gatewayBaseUrl}/desktop/accessibility/status`),
        fetch(`${gatewayBaseUrl}/desktop/window/snapshot`),
      ]);
      if (!statusResponse.ok || !snapshotResponse.ok) throw new Error("bad response");
      setStatus((await statusResponse.json()) as AccessibilityStatus);
      setSnapshot((await snapshotResponse.json()) as DesktopWindowSnapshot);
    } catch {
      setError("無法讀取 macOS 桌面代理狀態。");
    }
  }

  async function rehearse(risk: "low" | "high") {
    if (!gatewayBaseUrl) return;
    const request: DesktopActionRequest = { action: risk === "low" ? "read" : "click", targetLabel: "預覽動作", risk };
    try {
      const response = await fetch(`${gatewayBaseUrl}/desktop/actions/rehearse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error("bad response");
      setRehearsal((await response.json()) as DesktopActionRehearsal);
    } catch {
      setRehearsal(buildDesktopActionRehearsal(request, snapshot));
    }
  }

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="security-panel" role="dialog" aria-modal="true" aria-labelledby="desktop-automation-title">
        <header className="provider-header">
          <div>
            <h2 id="desktop-automation-title">macOS 桌面代理</h2>
            <p>v0.2 採 AX-first：先讀 Accessibility tree、元素 role/label/bounds/enabled；不足時才進 vision fallback preview。</p>
          </div>
          <button className="icon-button" type="button" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="commercial-grid">
          <section className="commercial-card">
            <LockKeyhole size={23} />
            <h3>Accessibility 權限</h3>
            {status ? (
              <dl className="status-list">
                <div><dt>平台</dt><dd>{status.platform}</dd></div>
                <div><dt>授權狀態</dt><dd>{status.trusted}</dd></div>
                <div><dt>可讀視窗</dt><dd>{status.canReadActiveWindow ? "是" : "否"}</dd></div>
              </dl>
            ) : null}
            <p>{status?.setupHint ?? "正在檢查授權狀態。"}</p>
            <Tooltip text="開啟系統設定後，需由使用者手動授權 ClawDesk。">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  window.open(status?.settingsUrl ?? "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
                }}
              >
                開啟系統設定
              </button>
            </Tooltip>
          </section>

          <section className="commercial-card">
            <Eye size={23} />
            <h3>Active Window Snapshot</h3>
            {snapshot ? (
              <>
                <dl className="status-list">
                  <div><dt>App</dt><dd>{snapshot.appName}</dd></div>
                  <div><dt>視窗</dt><dd>{snapshot.windowTitle}</dd></div>
                  <div><dt>來源</dt><dd>{snapshot.fallback}</dd></div>
                </dl>
                <div className="stack-list">
                  {snapshot.elements.map((element) => (
                    <article key={element.id}>
                      <strong>{element.label}</strong>
                      <small>{element.role} · {element.enabled ? "enabled" : "disabled"}</small>
                      <p>{element.bounds.width} x {element.bounds.height} @ {element.bounds.x}, {element.bounds.y}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => void load()}>
              <RefreshCw size={15} />
              重新觀察
            </button>
          </section>
        </div>

        <section className="commercial-card">
          <MousePointerClick size={23} />
          <h3>觀察 → 預演 → 授權執行</h3>
          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={() => void rehearse("low")}>
              低風險預演
            </button>
            <button className="secondary-button" type="button" onClick={() => void rehearse("high")}>
              高風險預演
            </button>
          </div>
          {rehearsal ? (
            <div className="mcp-preview">
              <span>{rehearsal.stage} · 風險 {rehearsal.risk}</span>
              <strong>{rehearsal.executable ? "可進入低風險 mock 執行" : "禁止自動執行"}</strong>
              <p>{rehearsal.summary}</p>
              {rehearsal.blockedReason ? <small>{rehearsal.blockedReason}</small> : null}
            </div>
          ) : null}
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </div>
  );
}
