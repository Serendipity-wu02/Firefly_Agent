import { Popover, Slider } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n";
import { computeReasoningDropdown, type ReasoningDropdownView } from "../../../../lib/reasoning-dropdown";
import type { ReasoningPreference } from "../../../../../shared/reasoning";

interface ModelProfile { id: string; provider: string; displayName?: string; model: string; }
interface ModelCatalogApi {
  listModelProfiles?: () => Promise<{ profiles: ModelProfile[]; defaultModelProfileId?: string }>;
}

interface ReasoningState {
  providerKey: string;
  providerId: string;
  model: string;
  preference?: ReasoningPreference;
  thinkingOverride?: -1 | 0 | 1;
  transport?: "openai" | "anthropic" | "responses";
  /** The profile the main process actually resolved (session binding, pending welcome pick, default); echoed back on write. */
  modelProfileId?: string | null;
}

interface ChatReasoningApi {
  getReasoningState: (payload?: { sessionId?: string; modelProfileId?: string }) => Promise<ReasoningState>;
  setReasoning: (payload: { sessionId?: string; modelProfileId?: string | null; providerKey: string; preference: ReasoningPreference }) => Promise<void>;
}

function reasoningApi(): ChatReasoningApi | undefined {
  return (window as typeof window & { chat?: ChatReasoningApi }).chat;
}

function preferenceKey(preference: ReasoningPreference): string {
  return `${preference.mode}:${preference.effort ?? ""}:${preference.proMode ? "pro" : ""}`;
}

/** 滑块每一档下面的短标签：两个字以内，才能在 260px 的面板里排得下。 */
export function shortEffortLabel(label: string): string {
  switch (label) {
    case "跟随模型": return "自动";
    case "关闭": return "关";
    case "开启": return "开";
    case "始终开启": return "常开";
    default: return label;
  }
}

function ChevronIcon({ direction = "down" }: { direction?: "down" | "right" | "left" }) {
  const path = direction === "down" ? "m7 10 5 5 5-5" : direction === "right" ? "m10 7 5 5-5 5" : "m14 7-5 5 5 5";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}

/**
 * One control for "which model, how hard it thinks": the trigger shows both, the panel has a slider over the
 * levels the current model supports, and the model name opens the list of saved model profiles.
 */
export function ModelEffortControl({ sessionId, activeProfileId, onSelectModelProfile }: {
  sessionId?: string;
  activeProfileId?: string;
  onSelectModelProfile?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [providerKey, setProviderKey] = useState("");
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [view, setView] = useState<ReasoningDropdownView>();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"effort" | "models">("effort");
  const [preview, setPreview] = useState<number | null>(null);

  async function loadProfiles() {
    setLoadState("loading");
    try {
      const result = await ((window as typeof window & { settings?: ModelCatalogApi }).settings?.listModelProfiles?.());
      if (!result) throw new Error("MODEL_CATALOG_UNAVAILABLE");
      setProfiles(result.profiles);
      setDefaultProfileId(result.defaultModelProfileId);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  async function refreshReasoning() {
    const api = reasoningApi();
    if (!api) return;
    try {
      const state = await api.getReasoningState({ sessionId, modelProfileId: activeProfileId });
      setProviderKey(state.providerKey);
      setResolvedProfileId(state.modelProfileId ?? null);
      setView(computeReasoningDropdown(state.providerId, state.model, state.preference, state.thinkingOverride, state.transport));
    } catch {
      setView(undefined);
    }
  }

  useEffect(() => { void loadProfiles(); }, []);
  useEffect(() => { void refreshReasoning(); }, [sessionId, activeProfileId]);

  const active = profiles.find((item) => item.id === activeProfileId)
    ?? profiles.find((item) => item.id === defaultProfileId)
    ?? profiles[0];
  const modelName = active?.displayName || active?.model || t("modelSelector.chooseModel");

  const items = view?.items ?? [];
  const activeKey = view ? preferenceKey(view.activePreference) : "";
  const activeIndex = Math.max(0, items.findIndex((item) => preferenceKey(item.preference) === activeKey));
  const adjustable = Boolean(view && !view.disabled && items.length > 1);
  const shownIndex = preview ?? activeIndex;
  const shownLabel = adjustable ? items[shownIndex]?.label : view?.statusText;

  async function commit(index: number) {
    setPreview(null);
    const item = items[index];
    const api = reasoningApi();
    if (!item || item.disabled || !api || !providerKey) return;
    await api.setReasoning({ sessionId, modelProfileId: resolvedProfileId, providerKey, preference: item.preference });
    await refreshReasoning();
  }

  function chooseModel(id: string) {
    onSelectModelProfile?.(id);
    setPanel("effort");
    setOpen(false);
  }

  const effortPanel = (
    <div className="cy-model-panel cy-effort">
      <div className="cy-effort__head">
        {shownLabel && <span className="cy-effort__value">{shownLabel}</span>}
        <button type="button" className="cy-effort__model" title={t("modelSelector.switchTitle")} onClick={() => setPanel("models")}>
          <span>{modelName}</span>
          <ChevronIcon direction="right" />
        </button>
      </div>
      {adjustable ? (
        <Slider
          className="cy-effort__slider"
          min={0}
          max={items.length - 1}
          step={1}
          dots
          marks={Object.fromEntries(items.map((item, index) => [index, {
            label: <span className={`cy-effort__mark${index === shownIndex ? " is-current" : ""}${item.disabled ? " is-disabled" : ""}`}>{shortEffortLabel(item.label)}</span>,
          }]))}
          value={shownIndex}
          tooltip={{ open: false }}
          aria-label={t("modelEffort.sliderLabel")}
          onChange={(value) => { if (!items[value]?.disabled) setPreview(value); }}
          onChangeComplete={(value) => void commit(value)}
        />
      ) : (
        <p className="cy-effort__note">{t("modelEffort.unsupported")}</p>
      )}
    </div>
  );

  const modelsPanel = (
    <div className="cy-model-panel cy-model-list">
      <button type="button" className="cy-model-list__back" onClick={() => setPanel("effort")}>
        <ChevronIcon direction="left" />
        <span>{t("modelSelector.chooseModel")}</span>
      </button>
      {loadState === "loading" ? <span className="cy-model-list__note">{t("common.loading")}</span>
        : loadState === "error" ? <span className="cy-model-list__note" role="alert">{t("modelPanel.loadFailed")}</span>
        : profiles.length === 0 ? <span className="cy-model-list__note">{t("modelSelector.emptyHint")}</span>
        : profiles.map((profile) => (
          <button type="button" key={profile.id} className={`cy-model-list__item ${profile.id === active?.id ? "is-active" : ""}`} onClick={() => chooseModel(profile.id)}>
            <span className="cy-model-list__name"><strong>{profile.displayName || profile.provider}</strong><small>{profile.model}</small></span>
            {profile.id === active?.id && <CheckIcon />}
          </button>
        ))}
    </div>
  );

  return (
    <Popover
      content={panel === "models" ? modelsPanel : effortPanel}
      trigger="click"
      placement="topRight"
      open={open}
      overlayClassName="cy-model-popover"
      onOpenChange={(next) => {
        setOpen(next);
        if (next) { setPanel("effort"); void loadProfiles(); void refreshReasoning(); }
      }}
    >
      <button type="button" className="cy-composer__agent-button cy-model-effort" title={t("modelSelector.switchTitle")}>
        <span className="cy-model-effort__model">{modelName}</span>
        {view && (adjustable ? items[activeIndex]?.label : view.statusText) && (
          <span className="cy-model-effort__effort">{adjustable ? items[activeIndex]?.label : view.statusText}</span>
        )}
        <ChevronIcon />
      </button>
    </Popover>
  );
}
