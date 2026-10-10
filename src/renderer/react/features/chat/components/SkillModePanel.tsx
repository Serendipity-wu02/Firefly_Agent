import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import "./SkillModePanel.css";
import { ExternalSkillsCommitContext, ExternalSkillsPanel, useSkillConfirmationFocus } from "./ExternalSkillsPanel";

type SkillMode = "work" | "code";
type TabKey = SkillMode;
type SkillSource = "builtin" | "user";

interface SkillCatalogItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: SkillSource;
  modes: SkillMode[] | null;
  version?: string;
  references: string[];
}

type Overrides = Record<string, Partial<Record<SkillMode, boolean>>>;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "work", label: "Work" },
  { key: "code", label: "Code" },
];

const SOURCE_OPTIONS: Array<{ key: "all" | SkillSource; labelKey: string }> = [
  { key: "all", labelKey: "skillPanel.sourceAll" },
  { key: "builtin", labelKey: "skillPanel.sourceBuiltin" },
  { key: "user", labelKey: "skillPanel.sourceUser" },
];

// TODO: 为每个 skill 配置专属 SVG 图标；key 为 skill id。
const SKILL_ICON_SVGS: Record<string, React.ReactNode> = {};

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M36.7279 36.7279C33.4706 39.9853 28.9706 42 24 42C14.0589 42 6 33.9411 6 24C6 14.0589 14.0589 6 24 6C28.9706 6 33.4706 8.01472 36.7279 11.2721C38.3859 12.9301 42 17 42 17"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M42 8V17H33" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlaceholderIcon({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "S";
  return <span className="skill-card__icon-letter">{letter}</span>;
}

function hashHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function SkillIcon({ skillId, name }: { skillId: string; name: string }) {
  const hue = hashHue(skillId);
  return (
    <span
      className="skill-card__icon"
      style={{ background: `hsl(${hue}, 82%, 94%)`, color: `hsl(${hue}, 55%, 42%)` }}
    >
      {SKILL_ICON_SVGS[skillId] ?? <PlaceholderIcon name={name} />}
    </span>
  );
}

/** 与主进程 getEnabledForMode 同源的默认可见性计算（前端镜像） */
function isVisibleForMode(skill: SkillCatalogItem, mode: SkillMode, overrides: Overrides): boolean {
  const override = overrides[skill.id]?.[mode];
  if (override !== undefined) return override;
  if (!skill.modes) return true;
  return skill.modes.includes(mode);
}

export const SkillModePanel: React.FC = () => {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadGeneration = useRef(0);
  const refreshInFlight = useRef(false);
  const pendingSaves = useRef(new Set<string>());
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<"all" | SkillSource>("all");
  const [tab, setTab] = useState<TabKey>("code");
  const [view, setView] = useState<"installed" | "external">("installed");
  const [committing, setCommitting] = useState(false);
  const commitInFlight = useRef(false);
  const setCommitBusy = useCallback((busy: boolean) => { commitInFlight.current = busy; setCommitting(busy); }, []);
  const [enableCandidate, setEnableCandidate] = useState<SkillCatalogItem>();
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const enableInFlight = useRef(false), alive = useRef(false);
  const enableDialog = useRef<HTMLDivElement>(null), enableOpener = useRef<HTMLElement>(null);
  const modeButtons = useRef(new Map<string, HTMLButtonElement>());
  const closeEnable = useCallback(() => { if (!enableInFlight.current) setEnableCandidate(undefined); }, []);
  useSkillConfirmationFocus(enableDialog, !!enableCandidate, enableOpener, closeEnable, enabling);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const api = window.settings;
    if (!api?.getSkillCatalog || !api?.getSkillModeOverrides) throw new Error("SKILL_CATALOG_UNAVAILABLE");
    const [cat, ov] = await Promise.all([
      api?.getSkillCatalog?.() ?? Promise.resolve([]),
      api?.getSkillModeOverrides?.() ?? Promise.resolve({}),
    ]);
    if (generation === loadGeneration.current) {
      setCatalog(cat as SkillCatalogItem[]);
      setOverrides(ov as Overrides);
      setLoadFailed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    setLoading(true);
    load()
      .catch(() => { if (!cancelled) setLoadFailed(true); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; alive.current = false; loadGeneration.current++; };
  }, [load]);

  const handleRefresh = useCallback(async () => {
    if (refreshInFlight.current || pendingSaves.current.size || commitInFlight.current || enableInFlight.current) return;
    loadGeneration.current++;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const res = await window.settings?.rescanSkills?.();
      if (res && !res.ok) {
        console.warn("[SkillModePanel] rescan failed:", res.error);
      }
      await load();
    } catch (err) {
      setLoadFailed(true);
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  }, [load]);

  const toggleMode = useCallback(async (skillId: string, mode: SkillMode, next: boolean) => {
    const key = `${skillId}/${mode}`;
    if (loading || refreshInFlight.current || pendingSaves.current.has(key)) return;
    // An obsolete initial read must not replace a newer explicit user choice.
    loadGeneration.current++;
    // A synchronous admission fence also catches repeat clicks before React renders.
    pendingSaves.current.add(key);
    setSavingKeys(new Set(pendingSaves.current));
    const previous = overrides[skillId]?.[mode];
    setSaveErrors(prev => { const updated = { ...prev }; delete updated[key]; return updated; });
    setOverrides((prev) => ({
      ...prev,
      [skillId]: { ...prev[skillId], [mode]: next },
    }));
    try {
      const result = await window.settings?.setSkillModeOverride?.(skillId, mode, next);
      if (result?.ok !== true) throw new Error("SKILL_MODE_SAVE_FAILED");
    } catch {
      // Restore only this failed key; another mode may have saved in the meantime.
      setOverrides(prev => {
        const updated = { ...prev }, modes = { ...prev[skillId] };
        if (previous === undefined) delete modes[mode]; else modes[mode] = previous;
        if (Object.keys(modes).length) updated[skillId] = modes; else delete updated[skillId];
        return updated;
      });
      setSaveErrors(prev => ({ ...prev, [key]: t("skillPanel.saveFailed", { skill: skillId, mode: mode === "code" ? "Code" : "Work" }) }));
    } finally {
      pendingSaves.current.delete(key);
      setSavingKeys(new Set(pendingSaves.current));
    }
  }, [loading, overrides, t]);

  const confirmEnable = async () => {
    if (!enableCandidate || enableInFlight.current || pendingSaves.current.size) return;
    const candidate = enableCandidate, generation = ++loadGeneration.current;
    enableInFlight.current = true; setEnabling(true); setEnableError("");
    try {
      const result = await window.settings?.setSkillEnabled?.(candidate.id, true);
      if (result?.ok !== true) throw new Error("SKILL_ENABLE_FAILED");
      if (!alive.current || generation !== loadGeneration.current) return;
      enableOpener.current = modeButtons.current.get(candidate.id) ?? enableOpener.current;
      setCatalog(previous => previous.map(skill => skill.id === candidate.id ? { ...skill, enabled: true } : skill));
      setEnableCandidate(undefined);
    } catch {
      if (alive.current && generation === loadGeneration.current) {
        setEnableError(t("skillPanel.enableFailed", { skill: candidate.name })); setEnableCandidate(undefined);
      }
    } finally {
      enableInFlight.current = false;
      if (alive.current && generation === loadGeneration.current) setEnabling(false);
    }
  };

  const visibleSkills = useMemo(() => {
    const kw = filter.trim().toLowerCase();
    const candidates = catalog.filter((s) => {
      if (source !== "all" && s.source !== source) return false;
      return true;
    });
    // Global disabled state stays visible, independently of per-mode overrides.
    const shown = candidates;
    const searched = kw
      ? shown.filter(
          (s) =>
            s.id.toLowerCase().includes(kw) ||
            s.name.toLowerCase().includes(kw) ||
            s.description.toLowerCase().includes(kw),
        )
      : shown;
    return [...searched].sort((a, b) => {
      const aOn = isVisibleForMode(a, tab, overrides);
      const bOn = isVisibleForMode(b, tab, overrides);
      if (aOn !== bOn) return aOn ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }, [catalog, overrides, filter, source, tab]);

  return (
    <div className="skill-panel">
      <header className="skill-panel__header">
        <div className="skill-panel__header-row">
          <div>
            <h1 className="skill-panel__title">{t("skillPanel.title")}</h1>
            <p className="skill-panel__subtitle">
              {t("skillPanel.subtitle", { mode: TABS.find((item) => item.key === tab)?.label })}
            </p>
          </div>
          <div className="skill-panel__actions">
            <button
              type="button"
              className="skill-panel__icon-btn"
              title={t("skillPanel.rescan")}
              disabled={view === "external" || loading || refreshing || savingKeys.size > 0 || enabling || committing}
              onClick={handleRefresh}
            >
              <RefreshIcon />
            </button>
          </div>
        </div>
      </header>

      <div className="skill-panel__views" aria-label={t("skillPanel.views")}>
        <button type="button" aria-pressed={view === "installed"} disabled={committing || enabling} onClick={() => { if (!commitInFlight.current && !enableInFlight.current) setView("installed"); }}>{t("skillPanel.installed")}</button>
        <button type="button" aria-pressed={view === "external"} disabled={committing || enabling} onClick={() => { if (commitInFlight.current || enableInFlight.current) return; setEnableCandidate(undefined); setView("external"); }}>{t("skillPanel.marketplace")}</button>
      </div>

      <div role="status" aria-live="polite">
        {Object.entries(saveErrors).map(([key, message]) => <p key={key} className="skill-panel__subtitle">{message}</p>)}
        {enableError && <p>{enableError}</p>}
        {loadFailed && <p>{t("skillPanel.loadFailed")}</p>}
      </div>

      {view === "external" ? <ExternalSkillsCommitContext.Provider value={setCommitBusy}><ExternalSkillsPanel onImported={load} /></ExternalSkillsCommitContext.Provider> : <>

      <div className="skill-panel__search-row">
        <input
          className="skill-panel__search"
          placeholder={t("skillPanel.searchPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="skill-panel__tabs">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            className={"skill-panel__tab" + (tab === tabItem.key ? " is-active" : "")}
            onClick={() => setTab(tabItem.key)}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div className="skill-panel__filter-row">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={
              "skill-panel__filter-tab" + (source === opt.key ? " is-active" : "")
            }
            onClick={() => setSource(opt.key)}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skill-panel__loading">{t("common.loading")}</div>
      ) : (
        <div className="skill-panel__list">
          {visibleSkills.map((skill) => {
            const isOn = skill.enabled && isVisibleForMode(skill, tab, overrides);
            return (
              <div key={skill.id} className={"skill-card" + (isOn ? "" : " is-off")}>
                <div className="skill-card__top">
                  <SkillIcon skillId={skill.id} name={skill.name} />
                  <div className="skill-card__body">
                    <div className="skill-card__name">
                      {skill.name}
                      {!skill.enabled && <span className="skill-card__badge">{t("skillPanel.disabledBadge")}</span>}
                    </div>
                    <div className="skill-card__meta">
                      <span className={`skill-card__source skill-card__source--${skill.source}`}>
                        {t(skill.source === "builtin" ? "skillPanel.sourceBuiltin" : "skillPanel.sourceUser")}
                      </span>
                      {skill.version ? (
                        <span className="skill-card__version">v{skill.version}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    ref={node => { if (node) modeButtons.current.set(skill.id, node); else modeButtons.current.delete(skill.id); }}
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-busy={savingKeys.has(`${skill.id}/${tab}`)}
                    aria-label={t("skillPanel.modeVisibility", { skill: skill.name, mode: tab === "code" ? "Code" : "Work" })}
                    disabled={!skill.enabled || refreshing || enabling || savingKeys.has(`${skill.id}/${tab}`)}
                    className={"skill-card__pill" + (isOn ? " is-on" : "")}
                    onClick={() => toggleMode(skill.id, tab, !isOn)}
                  >
                    <span className="skill-card__pill-knob" />
                  </button>
                  {!skill.enabled && <button type="button" className="skill-card__enable" disabled={refreshing || enabling || savingKeys.size > 0} onClick={event => { enableOpener.current = event.currentTarget; setEnableError(""); setEnableCandidate(skill); }}>{t("skillPanel.enable")}</button>}
                </div>
                <div className="skill-card__desc">
                  {skill.description.split("\n")[0] || t("skillPanel.noDescription")}
                </div>
              </div>
            );
          })}
          {visibleSkills.length === 0 && <div className="skill-panel__empty">{t("skillPanel.noMatch")}</div>}
        </div>
      )}
      </>}
      {enableCandidate && <div className="skill-panel__confirm-overlay">
        <div ref={enableDialog} role="dialog" aria-modal="true" aria-labelledby="skill-enable-title"
          tabIndex={-1} className="skill-panel__confirm">
          <h2 id="skill-enable-title">{t("skillPanel.enableTitle", { skill: enableCandidate.name })}</h2>
          <p>{t("skillPanel.enableNotice")}</p>
          <div>
            <button type="button" disabled={enabling} onClick={closeEnable}>{t("common.cancel")}</button>
            <button type="button" disabled={enabling} onClick={() => void confirmEnable()}>{t("skillPanel.confirmEnable")}</button>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default SkillModePanel;
