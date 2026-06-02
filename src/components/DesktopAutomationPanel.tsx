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
import { useI18n } from "../lib/i18n";

interface DesktopAutomationPanelProps {
  gatewayBaseUrl?: string;
  onClose: () => void;
}

export function DesktopAutomationPanel({ gatewayBaseUrl, onClose }: DesktopAutomationPanelProps): JSX.Element {
  const { t } = useI18n();
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
      setError(t("desktopAutomation.error"));
    }
  }

  async function rehearse(risk: "low" | "high") {
    if (!gatewayBaseUrl) return;
    const request: DesktopActionRequest = {
      action: risk === "low" ? "read" : "click",
      targetLabel: t("desktopAutomation.previewAction"),
      risk,
    };
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
            <h2 id="desktop-automation-title">{t("desktopAutomation.title")}</h2>
            <p>{t("desktopAutomation.subtitle")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="commercial-grid">
          <section className="commercial-card">
            <LockKeyhole size={23} />
            <h3>{t("desktopAutomation.accessibilityTitle")}</h3>
            {status ? (
              <dl className="status-list">
                <div><dt>{t("desktopAutomation.platform")}</dt><dd>{status.platform}</dd></div>
                <div><dt>{t("desktopAutomation.trusted")}</dt><dd>{status.trusted}</dd></div>
                <div><dt>{t("desktopAutomation.activeWindowReadable")}</dt><dd>{status.canReadActiveWindow ? t("common.yes") : t("common.no")}</dd></div>
              </dl>
            ) : null}
            <p>{status?.setupHint ?? t("desktopAutomation.checkingStatus")}</p>
            <Tooltip text={t("desktopAutomation.settingsHint")}>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  window.open(status?.settingsUrl ?? "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
                }}
              >
                {t("desktopAutomation.openSettings")}
              </button>
            </Tooltip>
          </section>

          <section className="commercial-card">
            <Eye size={23} />
            <h3>{t("desktopAutomation.snapshotTitle")}</h3>
            {snapshot ? (
              <>
                <dl className="status-list">
                  <div><dt>{t("desktopAutomation.app")}</dt><dd>{snapshot.appName}</dd></div>
                  <div><dt>{t("desktopAutomation.window")}</dt><dd>{snapshot.windowTitle}</dd></div>
                  <div><dt>{t("desktopAutomation.source")}</dt><dd>{snapshot.fallback}</dd></div>
                </dl>
                <div className="stack-list">
                  {snapshot.elements.map((element) => (
                    <article key={element.id}>
                      <strong>{element.label}</strong>
                      <small>{element.role} · {element.enabled ? t("common.enabled") : t("common.disabled")}</small>
                      <p>{element.bounds.width} x {element.bounds.height} @ {element.bounds.x}, {element.bounds.y}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => void load()}>
              <RefreshCw size={15} />
              {t("desktopAutomation.refresh")}
            </button>
          </section>
        </div>

        <section className="commercial-card">
          <MousePointerClick size={23} />
          <h3>{t("desktopAutomation.flowTitle")}</h3>
          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={() => void rehearse("low")}>
              {t("desktopAutomation.lowRiskPreview")}
            </button>
            <button className="secondary-button" type="button" onClick={() => void rehearse("high")}>
              {t("desktopAutomation.highRiskPreview")}
            </button>
          </div>
          {rehearsal ? (
            <div className="mcp-preview">
              <span>{rehearsal.stage} · {t("desktopAutomation.riskLabel")} {rehearsal.risk}</span>
              <strong>{rehearsal.executable ? t("desktopAutomation.mockExecutable") : t("desktopAutomation.blocked")}</strong>
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
