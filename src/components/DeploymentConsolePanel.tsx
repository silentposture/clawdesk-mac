import { CheckCircle2, CircleDashed, PlayCircle, RotateCcw, Server, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildDeploymentConsoleSnapshot,
  summarizeDeploymentChecks,
  type DeploymentCheck,
  type DeploymentConsoleSnapshot,
  type DeploymentPlan,
  type DeploymentStatus,
} from "../lib/deploymentConsole";
import type { GatewayInfo } from "../lib/tauri";
import {
  getLocalStackStatus,
  restartLocalStack,
  startLocalStack,
  stopLocalStack,
  type LocalStackStatus,
} from "../lib/tauri";
import { useI18n } from "../lib/i18n";

interface DeploymentConsolePanelProps {
  gateway?: GatewayInfo;
  onClose: () => void;
}

interface HealthPayload {
  ok?: boolean;
  name?: string;
  mode?: string;
  backend?: DeploymentStatus;
}

interface LicensePayload {
  status?: {
    licenseProvider?: string;
    entitlementAuthority?: string;
    canonicalPlanKey?: string;
    status?: string;
    lastValidationCode?: string;
  };
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; payload?: unknown }> {
  const response = await fetch(url);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    payload: text ? JSON.parse(text) : undefined,
  };
}

function checkIcon(status: DeploymentCheck["status"]): JSX.Element {
  if (status === "pass") return <CheckCircle2 size={16} />;
  return <CircleDashed size={16} />;
}

export function DeploymentConsolePanel({ gateway, onClose }: DeploymentConsolePanelProps): JSX.Element {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthPayload>();
  const [backendStatus, setBackendStatus] = useState<DeploymentStatus>();
  const [plan, setPlan] = useState<DeploymentPlan>();
  const [license, setLicense] = useState<LicensePayload>();
  const [localStack, setLocalStack] = useState<LocalStackStatus>();
  const [checks, setChecks] = useState<DeploymentCheck[]>([]);
  const [error, setError] = useState<string>();

  const snapshot: DeploymentConsoleSnapshot = useMemo(
    () => buildDeploymentConsoleSnapshot({ health, backendStatus, plan, license }),
    [health, backendStatus, plan, license],
  );
  const checkSummary = summarizeDeploymentChecks(checks);

  useEffect(() => {
    void load();
    void refreshLocalStack();
  }, [gateway?.baseUrl]);

  async function optionalGet(path: string): Promise<unknown | undefined> {
    if (!gateway?.baseUrl) return undefined;
    const response = await fetchJson(`${gateway.baseUrl}${path}`);
    return response.ok ? response.payload : undefined;
  }

  async function load() {
    if (!gateway?.baseUrl) return;
    setError(undefined);
    try {
      const [healthPayload, backendPayload, planPayload, licensePayload] = await Promise.all([
        optionalGet("/health"),
        optionalGet("/backend/status"),
        optionalGet("/backend/deployment-plan"),
        optionalGet("/license/status"),
      ]);
      setHealth(healthPayload as HealthPayload | undefined);
      setBackendStatus(backendPayload as DeploymentStatus | undefined);
      setPlan(planPayload as DeploymentPlan | undefined);
      setLicense(licensePayload as LicensePayload | undefined);
    } catch {
      setError(t("deployment.error"));
    }
  }

  async function refreshLocalStack() {
    setLocalStack(await getLocalStackStatus());
  }

  async function runLifecycle(action: "start" | "stop" | "restart") {
    setError(undefined);
    try {
      const next =
        action === "start"
          ? await startLocalStack()
          : action === "stop"
            ? await stopLocalStack()
            : await restartLocalStack();
      setLocalStack(next);
    } catch {
      setError(t("deployment.lifecycleError"));
    }
  }

  async function runVerification() {
    if (!gateway?.baseUrl) return;
    const baseUrl = gateway.baseUrl;
    const nextChecks: DeploymentCheck[] = [];

    async function probe(id: string, label: string, path: string, required = true) {
      try {
        const response = await fetchJson(`${baseUrl}${path}`);
        if (response.ok) {
          nextChecks.push({ id, label, status: "pass", detail: `HTTP ${response.status}` });
        } else {
          nextChecks.push({ id, label, status: required ? "fail" : "skip", detail: `HTTP ${response.status}` });
        }
      } catch {
        nextChecks.push({ id, label, status: required ? "fail" : "skip", detail: t("deployment.unavailable") });
      }
    }

    await probe("health", t("deployment.check.health"), "/health");
    await probe("deployment-plan", t("deployment.check.plan"), "/backend/deployment-plan", false);
    await probe("fingerprint", t("deployment.check.fingerprint"), "/machine/fingerprint");
    await probe("license", t("deployment.check.license"), "/license/status");
    await probe("updates", t("deployment.check.updates"), "/updates/check");
    setChecks(nextChecks);
    await load();
  }

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="deployment-panel" role="dialog" aria-modal="true" aria-labelledby="deployment-title">
        <header className="provider-header">
          <div>
            <h2 id="deployment-title">{t("deployment.title")}</h2>
            <p>{t("deployment.subtitle")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="commercial-grid">
          <article className="commercial-card">
            <Server size={23} />
            <h3>{t("deployment.status")}</h3>
            <dl className="status-list">
              <div><dt>{t("deployment.gatewayReady")}</dt><dd>{String(snapshot.gatewayReady)}</dd></div>
              <div><dt>{t("deployment.backendReady")}</dt><dd>{String(snapshot.backendReady)}</dd></div>
              <div><dt>{t("deployment.gatewayMode")}</dt><dd>{snapshot.gatewayMode}</dd></div>
              <div><dt>{t("deployment.backendService")}</dt><dd>{snapshot.backendService}</dd></div>
              <div><dt>{t("deployment.canonicalLicenseReadonly")}</dt><dd>{snapshot.canonicalLicenseReadonly}</dd></div>
              <div><dt>{t("deployment.legacyLicenseReadonly")}</dt><dd>{snapshot.legacyLicenseReadonly}</dd></div>
            </dl>
          </article>

          <article className="commercial-card">
            <PlayCircle size={23} />
            <h3>{t("deployment.verify")}</h3>
            <p>{t("deployment.verifyHint")}</p>
            <button className="primary-button" type="button" onClick={runVerification}>
              <PlayCircle size={16} />
              {t("deployment.run")}
            </button>
            <p>
              {t("common.pass")} {checkSummary.passed} · {t("common.fail")} {checkSummary.failed} · {t("common.skip")} {checkSummary.skipped}
            </p>
          </article>
        </section>

        <section className="commercial-card">
          <Server size={23} />
          <h3>{t("deployment.lifecycle")}</h3>
          <dl className="status-list">
            <div><dt>{t("deployment.lifecycleAvailable")}</dt><dd>{String(localStack?.available ?? false)}</dd></div>
            <div><dt>{t("deployment.lifecycleRunning")}</dt><dd>{String(localStack?.running ?? false)}</dd></div>
            <div><dt>{t("deployment.backendPid")}</dt><dd>{localStack?.backendPid ?? t("deployment.none")}</dd></div>
            <div><dt>{t("deployment.gatewayPid")}</dt><dd>{localStack?.gatewayPid ?? t("deployment.none")}</dd></div>
            <div><dt>{t("deployment.backendUrl")}</dt><dd>{localStack?.backendUrl ?? t("deployment.none")}</dd></div>
            <div><dt>{t("deployment.gatewayUrl")}</dt><dd>{localStack?.gatewayUrl ?? t("deployment.none")}</dd></div>
            <div><dt>{t("deployment.backendHealthy")}</dt><dd>{String(localStack?.backendHealthy ?? false)}</dd></div>
            <div><dt>{t("deployment.gatewayHealthy")}</dt><dd>{String(localStack?.gatewayHealthy ?? false)}</dd></div>
          </dl>
          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => runLifecycle("start")}>
              <PlayCircle size={16} />
              {t("deployment.start")}
            </button>
            <button className="secondary-button" type="button" onClick={() => runLifecycle("restart")}>
              <RotateCcw size={16} />
              {t("deployment.restart")}
            </button>
            <button className="secondary-button" type="button" onClick={() => runLifecycle("stop")}>
              <Square size={16} />
              {t("deployment.stop")}
            </button>
          </div>
          <div className="deployment-log">
            {(localStack?.logs ?? []).slice(-6).map((line, index) => (
              <code key={`${line}-${index}`}>{line}</code>
            ))}
          </div>
        </section>

        <section className="release-readiness-grid">
          {checks.map((check) => (
            <article className={`release-readiness-item ${check.status === "pass" ? "ready" : check.status === "fail" ? "blocked" : "warning"}`} key={check.id}>
              <span>{checkIcon(check.status)} {check.status}</span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </article>
          ))}
        </section>

        <section className="commercial-grid">
          <article className="commercial-card">
            <h3>{t("deployment.minimumServices")}</h3>
            <p>{snapshot.minimumServices.length > 0 ? snapshot.minimumServices.join(", ") : t("deployment.none")}</p>
          </article>
          <article className="commercial-card">
            <h3>{t("deployment.productionModules")}</h3>
            <p>{snapshot.productionModules.length > 0 ? snapshot.productionModules.join(", ") : t("deployment.none")}</p>
          </article>
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </div>
  );
}
