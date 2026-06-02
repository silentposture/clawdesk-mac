import { Info, KeyRound, RefreshCw, Server, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LicenseStatus } from "../lib/licensing";
import type { GatewayInfo } from "../lib/tauri";
import { useI18n } from "../lib/i18n";
import { versionSummary } from "../lib/version";

interface AboutPanelProps {
  gateway?: GatewayInfo;
  gatewayStatus: "starting" | "ready" | "degraded" | "offline";
  identityIsDeveloper: boolean;
  onClose: () => void;
}

interface HealthPayload {
  name?: string;
  service?: string;
  productName?: string;
  compatibility?: string;
  contractVersion?: string;
  backendContractVersion?: string;
  adapterMode?: string;
  mode?: string;
  baseUrl?: string;
  wsUrl?: string;
  backend?: {
    mode?: string;
    status?: string;
    contractVersion?: string;
  };
}

interface LicensePayload {
  status?: LicenseStatus & {
    onlineValidationStatus?: string;
    keygenStatusCode?: string;
    offlineGrace?: boolean;
  };
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  eligibleLatestVersion: string;
  supportUpdatesUntil: string;
  canInstallLatest: boolean;
}

function fallback(value?: string | number | boolean | null): string {
  if (value === undefined || value === null || value === "") return "none";
  return String(value);
}

export function AboutPanel({ gateway, gatewayStatus, identityIsDeveloper, onClose }: AboutPanelProps): JSX.Element {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthPayload>();
  const [license, setLicense] = useState<LicensePayload["status"]>();
  const [update, setUpdate] = useState<UpdateInfo>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!gateway?.baseUrl) return;
      setError(undefined);
      try {
        const [healthResponse, licenseResponse, updateResponse] = await Promise.all([
          fetch(`${gateway.baseUrl}/health`),
          fetch(`${gateway.baseUrl}/license/status`),
          fetch(`${gateway.baseUrl}/updates/check`),
        ]);
        if (!healthResponse.ok || !licenseResponse.ok || !updateResponse.ok) {
          throw new Error("about status unavailable");
        }
        const [healthPayload, licensePayload, updatePayload] = await Promise.all([
          healthResponse.json() as Promise<HealthPayload>,
          licenseResponse.json() as Promise<LicensePayload>,
          updateResponse.json() as Promise<UpdateInfo>,
        ]);
        if (cancelled) return;
        setHealth(healthPayload);
        setLicense(licensePayload.status);
        setUpdate(updatePayload);
      } catch {
        if (!cancelled) setError(t("about.error"));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [gateway?.baseUrl, t]);

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header className="provider-header">
          <div>
            <h2 id="about-title">{t("about.title")}</h2>
            <p>{t("about.subtitle")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="commercial-grid">
          <section className="commercial-card">
            <Info size={23} />
            <h3>{t("about.product")}</h3>
            <dl className="status-list">
              <div><dt>{t("about.productName")}</dt><dd>{versionSummary.productName}</dd></div>
              <div><dt>{t("about.developer")}</dt><dd>{versionSummary.developer}</dd></div>
              <div><dt>{t("about.developerType")}</dt><dd>{versionSummary.developerType}</dd></div>
              <div><dt>{t("about.contact")}</dt><dd>{versionSummary.contactEmail}</dd></div>
              <div><dt>{t("about.version")}</dt><dd>{versionSummary.version}</dd></div>
              <div><dt>{t("about.buildId")}</dt><dd>{versionSummary.buildId}</dd></div>
              <div><dt>{t("about.releaseChannel")}</dt><dd>{versionSummary.releaseChannel}</dd></div>
              <div><dt>{t("about.compatibility")}</dt><dd>{health?.compatibility ?? versionSummary.compatibility}</dd></div>
            </dl>
          </section>

          <section className="commercial-card">
            <Server size={23} />
            <h3>{t("about.gateway")}</h3>
            <dl className="status-list">
              <div><dt>{t("about.gatewayStatus")}</dt><dd>{gatewayStatus}</dd></div>
              <div><dt>{t("about.gatewayMode")}</dt><dd>{gateway?.mode ?? health?.mode ?? health?.backend?.mode ?? "none"}</dd></div>
              <div><dt>{t("about.gatewayName")}</dt><dd>{health?.name ?? health?.service ?? "none"}</dd></div>
              <div><dt>{t("about.contract")}</dt><dd>{health?.contractVersion ?? health?.backendContractVersion ?? health?.backend?.contractVersion ?? "none"}</dd></div>
              <div><dt>{t("about.baseUrl")}</dt><dd>{gateway?.baseUrl ?? health?.baseUrl ?? "none"}</dd></div>
            </dl>
          </section>

          <section className="commercial-card">
            <KeyRound size={23} />
            <h3>{t("about.license")}</h3>
            <dl className="status-list">
              <div><dt>{t("about.paymentProvider")}</dt><dd>{fallback(license?.commerceProvider ?? license?.paymentProvider)}</dd></div>
              <div><dt>{t("about.licenseProvider")}</dt><dd>{fallback(license?.entitlementAuthority ?? license?.licenseProvider)}</dd></div>
              <div><dt>{t("about.plan")}</dt><dd>{fallback(license?.canonicalPlanKey ?? license?.plan)}</dd></div>
              <div><dt>{t("about.licenseStatus")}</dt><dd>{fallback(license?.status)}</dd></div>
              <div><dt>{t("about.onlineValidation")}</dt><dd>{fallback(license?.onlineValidationStatus ?? license?.keygenStatusCode ?? license?.lastValidationCode)}</dd></div>
              <div><dt>{t("about.offlineGrace")}</dt><dd>{fallback(license?.graceUntilUtc ?? license?.offlineGraceUntil ?? license?.offlineGrace)}</dd></div>
            </dl>
          </section>

          <section className="commercial-card">
            <RefreshCw size={23} />
            <h3>{t("about.updates")}</h3>
            <dl className="status-list">
              <div><dt>{t("about.currentVersion")}</dt><dd>{fallback(update?.currentVersion)}</dd></div>
              <div><dt>{t("about.latestVersion")}</dt><dd>{fallback(update?.latestVersion)}</dd></div>
              <div><dt>{t("about.eligibleVersion")}</dt><dd>{fallback(update?.eligibleLatestVersion)}</dd></div>
              <div><dt>{t("about.supportUntil")}</dt><dd>{fallback(update?.supportUpdatesUntil ?? license?.updatesUntilUtc ?? license?.supportUpdatesUntil)}</dd></div>
              <div><dt>{t("about.canInstall")}</dt><dd>{fallback(update?.canInstallLatest)}</dd></div>
            </dl>
          </section>
        </div>

        {identityIsDeveloper ? (
          <p className="panel-success about-developer">
            <ShieldCheck size={16} />
            {t("app.status.developerEnabled")}
          </p>
        ) : null}
        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </div>
  );
}
