import { CheckCircle2, ChevronRight, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  defaultOpenClawSetupProfile,
  openClawSettingSections,
  setupCompletion,
  type OpenClawSetupProfile,
} from "../lib/openclawSettings";
import type { SandboxPolicy } from "../lib/security";
import { FolderPicker } from "./FolderPicker";
import { Tooltip } from "./Tooltip";
import { llmProviderCatalog, type ProviderId } from "../lib/providers";
import { useI18n } from "../lib/i18n";

interface OpenClawSettingsPanelProps {
  policy: SandboxPolicy;
  onPolicyChange: (policy: SandboxPolicy) => void;
  onClose: () => void;
}

const providerOptions = llmProviderCatalog.map((provider) => ({
  id: provider.id,
  label: provider.shortName,
}));
const providerLabels = Object.fromEntries(providerOptions.map((item) => [item.id, item.label])) as Record<
  ProviderId,
  string
>;

export function OpenClawSettingsPanel({
  policy,
  onPolicyChange,
  onClose,
}: OpenClawSettingsPanelProps): JSX.Element {
  const { t } = useI18n();
  const [profile, setProfile] = useState<OpenClawSetupProfile>({
    ...defaultOpenClawSetupProfile,
    workspaceFolder: policy.projectFolder,
    internetEnabled: policy.allowInternet,
    screenVisionEnabled: policy.allowScreenVision,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(openClawSettingSections[0].id);

  const activeSection = useMemo(
    () => openClawSettingSections.find((section) => section.id === activeSectionId) ?? openClawSettingSections[0],
    [activeSectionId],
  );
  const completion = setupCompletion(profile);
  const goalLabels: Record<OpenClawSetupProfile["goal"], string> = {
    personal: t("openclawSettings.goal.personal"),
    office: t("openclawSettings.goal.office"),
    automation: t("openclawSettings.goal.automation"),
    advanced: t("openclawSettings.goal.advanced"),
  };

  function handleWorkspaceFolderSelect(projectFolder: string) {
    const normalized = projectFolder.trim().replace(/\/+$/, "");
    setProfile({
      ...profile,
      workspaceFolder: normalized,
    });
  }

  function saveProfile() {
    onPolicyChange({
      ...policy,
      projectFolder: profile.workspaceFolder,
      backupFolder: `${profile.workspaceFolder.replace(/\/+$/, "")}/.clawdesk-backups`,
      allowInternet: profile.internetEnabled,
      allowScreenVision: profile.screenVisionEnabled,
    });
    onClose();
  }

  return (
    <div className="panel-backdrop" role="presentation">
      <section className="openclaw-settings-panel" role="dialog" aria-modal="true" aria-labelledby="openclaw-settings-title">
        <header className="provider-header">
          <div>
            <h2 id="openclaw-settings-title">{t("openclawSettings.title")}</h2>
            <p>{t("openclawSettings.subtitle")}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="guided-settings-layout">
          <section className="guided-card">
            <div className="completion-ring">
              <CheckCircle2 size={22} />
              <strong>{completion}%</strong>
              <span>{t("openclawSettings.completion")}</span>
            </div>
            <h3>{t("openclawSettings.quickQuestions")}</h3>
            <label>
              <span>{t("openclawSettings.goal")}</span>
              <select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as OpenClawSetupProfile["goal"] })}>
                {Object.entries(goalLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("openclawSettings.provider")}</span>
              <select
                value={profile.modelProvider}
                onChange={(event) => setProfile({ ...profile, modelProvider: event.target.value as OpenClawSetupProfile["modelProvider"] })}
              >
                {Object.entries(providerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <FolderPicker
              label={t("openclawSettings.projectFolder")}
              value={profile.workspaceFolder}
              helperText={t("openclawSettings.projectFolderHelp")}
              onSelect={handleWorkspaceFolderSelect}
            />
            <Tooltip text={t("openclawSettings.internetHelp")}>
              <label className="setup-toggle">
                <span>{t("openclawSettings.internet")}</span>
                <input
                  type="checkbox"
                  checked={profile.internetEnabled}
                  onChange={(event) => setProfile({ ...profile, internetEnabled: event.target.checked })}
                />
              </label>
            </Tooltip>
            <Tooltip text={t("openclawSettings.screenHelp")}>
              <label className="setup-toggle">
                <span>{t("openclawSettings.screen")}</span>
                <input
                  type="checkbox"
                  checked={profile.screenVisionEnabled}
                  onChange={(event) => setProfile({ ...profile, screenVisionEnabled: event.target.checked })}
                />
              </label>
            </Tooltip>
          </section>

          <section className="settings-explainer">
            <header>
              <Settings2 size={20} />
              <div>
                <h3>{t("openclawSettings.sectionsTitle")}</h3>
                <p>{t("openclawSettings.sectionsSubtitle")}</p>
              </div>
            </header>
            <div className="setting-section-list">
              {openClawSettingSections.map((section) => (
                <button
                  className={section.id === activeSection.id ? "active" : ""}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span>
                    <strong>{section.plainTitle}</strong>
                    <small>{section.title}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </section>

          <section className="setting-detail-card">
            <span>{activeSection.title}</span>
            <h3>{activeSection.plainTitle}</h3>
            <p>{activeSection.setupQuestion}</p>
            <div className="setting-item-list">
              {activeSection.items
                .filter((item) => advancedOpen || item.audience === "basic")
                .map((item) => (
                  <article key={item.id}>
                    <strong>{item.plainLabel}</strong>
                    <p>{item.description}</p>
                    <small>
                      {t("openclawSettings.keyDefault", { key: item.label, value: item.defaultValue })}
                    </small>
                  </article>
                ))}
            </div>
            <button className="secondary-button" type="button" onClick={() => setAdvancedOpen((current) => !current)}>
              <SlidersHorizontal size={15} />
              {advancedOpen ? t("openclawSettings.hideAdvanced") : t("openclawSettings.showAdvanced")}
            </button>
          </section>
        </div>

        <footer className="setup-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {t("openclawSettings.later")}
          </button>
          <button className="primary-button" type="button" onClick={saveProfile}>
            {t("openclawSettings.apply")}
          </button>
        </footer>
      </section>
    </div>
  );
}
