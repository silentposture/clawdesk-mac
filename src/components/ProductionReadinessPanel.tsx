import { AlertTriangle, CheckCircle2, CircleDashed, Rocket, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildProductionReadinessView,
  type ProductionReadinessView,
} from "../lib/productionReadiness";
import type { GatewayInfo } from "../lib/tauri";
import { useI18n } from "../lib/i18n";

interface ProductionReadinessPanelProps {
  gateway?: GatewayInfo;
  onClose: () => void;
}

interface HealthPayload {
  mode?: string;
  sidecar?: boolean;
  backend?: {
    mode?: string;
    adapterMode?: string;
    adapterReadiness?: {
      productionEnv?: {
        required?: { name: string; present: boolean }[];
        missing?: string[];
        ready?: boolean;
      };
    };
    productionEnv?: {
      required?: { name: string; present: boolean }[];
      missing?: string[];
      ready?: boolean;
    };
  };
}

function statusIcon(status: "ready" | "warning" | "blocked"): JSX.Element {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "warning") return <AlertTriangle size={16} />;
  return <CircleDashed size={16} />;
}

export function ProductionReadinessPanel({ gateway, onClose }: ProductionReadinessPanelProps): JSX.Element {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthPayload>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!gateway?.baseUrl) return;
      setError(undefined);
      try {
        const response = await fetch(`${gateway.baseUrl}/health`);
        if (!response.ok) throw new Error("health unavailable");
        const payload = (await response.json()) as HealthPayload;
        if (!cancelled) setHealth(payload);
      } catch {
        if (!cancelled) setError(t("production.error"));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [gateway?.baseUrl, t]);

  const view: ProductionReadinessView = useMemo(
    () => buildProductionReadinessView(gateway, health),
    [gateway, health],
  );

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="production-panel" role="dialog" aria-modal="true" aria-labelledby="production-title">
        <header className="provider-header">
          <div>
            <h2 id="production-title">{t("production.title")}</h2>
            <p>{t("production.subtitle")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="release-readiness-card" aria-label={t("production.summary")}>
          <header>
            <div>
              <Rocket size={22} />
              <h3>{t("production.summary")}</h3>
              <p>{t("production.noSecrets")}</p>
            </div>
            <strong>
              Ready {view.summary.ready} · Warning {view.summary.warning} · Blocked {view.summary.blocked}
            </strong>
          </header>
          <dl className="status-list production-env-summary">
            <div><dt>{t("production.overall")}</dt><dd>{view.summary.overall}</dd></div>
            <div><dt>{t("production.gateway")}</dt><dd>{view.input.hasProductionGateway ? t("production.ready") : t("production.missing")}</dd></div>
            <div><dt>{t("production.missingEnv")}</dt><dd>{view.missingProductionEnv.length > 0 ? view.missingProductionEnv.join(", ") : t("production.none")}</dd></div>
          </dl>
        </section>

        <section className="release-readiness-grid">
          {view.matrix.map((item) => (
            <article className={`release-readiness-item ${item.status}`} key={item.id}>
              <span>{statusIcon(item.status)} {item.status}</span>
              <strong>{item.label}</strong>
              <small>{item.current}</small>
              <p>{item.required}</p>
              <p>{item.nextAction}</p>
            </article>
          ))}
        </section>

        {error ? <p className="panel-error">{error}</p> : null}
      </section>
    </div>
  );
}
