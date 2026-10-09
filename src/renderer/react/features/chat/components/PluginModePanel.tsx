import { AppstoreOutlined, LoadingOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketListResult,
  MarketPluginEntry,
  MarketSourceStatus,
  PluginListEntry,
  PluginManagementApi,
  PluginOverview,
  PluginRuntimeStatus,
} from "../../../../../shared/plugin-management";
import { isNewerVersion } from "../../../../../shared/version";
import { useTranslation } from "../../../i18n";
import { useFeedback } from "../../../components/feedback/FeedbackProvider";
import "./PluginModePanel.css";

interface PluginModePanelProps {
  api?: PluginManagementApi;
}


/** 从索引源地址推导展示名：认识的源走 i18n 友好名，其余直接显示主机名 */
function marketSourceLabel(url: string, t: (key: string) => string): string {
  if (url === "bundled:registry") return t("pluginPanel.market.sourceBundled");
  try {
    const { hostname, host } = new URL(url);
    if (hostname === "gitee.com" || hostname.endsWith(".gitee.com")) return t("pluginPanel.market.sourceGitee");
    if (hostname === "github.com" || hostname.endsWith(".github.com") || hostname === "raw.githubusercontent.com") {
      return t("pluginPanel.market.sourceGithub");
    }
    return host;
  } catch {
    return url;
  }
}

type HeaderAction = "refresh" | "import" | null;
type PanelView = "installed" | "market";

interface MarketState {
  phase: "idle" | "loading" | "ready" | "error";
  plugins: MarketPluginEntry[];
  error?: string;
  /** 各索引源的实时死活（含拉取失败时的全死状态），用于头部徽章展示 */
  sources?: MarketSourceStatus[];
  mode?: MarketListResult["mode"];
}

const STATUS_ORDER: Record<PluginRuntimeStatus, number> = {
  running: 0,
  starting: 1,
  failed: 2,
  stopping: 3,
  disabled: 4,
};

export function normalizePluginOverview(
  value: PluginOverview | PluginListEntry[],
): PluginOverview {
  return Array.isArray(value) ? { plugins: value, issues: [] } : value;
}

export function pluginToggleTarget(plugin: PluginListEntry): boolean {
  return plugin.status !== "running";
}

/** 市场卡片按钮的展示形态：由本地安装情况推导，渲染端只做展示判断，安装安全校验全在主进程 */
type MarketCardAction =
  | { kind: "install" }
  | { kind: "update" }
  | { kind: "replace" }
  | { kind: "installed"; version: string }
  | { kind: "installedLocalNewer"; version: string };

export function resolveMarketAction(
  entry: MarketPluginEntry,
  installed: PluginListEntry | undefined,
): MarketCardAction {
  if (!installed) return { kind: "install" };
  // 市场来源的已装插件才提供"更新"，本地来源（含内置）一律走替换确认
  if (installed.origin === "market") {
    if (isNewerVersion(entry.version, installed.version)) return { kind: "update" };
    if (isNewerVersion(installed.version, entry.version)) {
      return { kind: "installedLocalNewer", version: installed.version };
    }
    return { kind: "installed", version: installed.version };
  }
  return { kind: "replace" };
}

export function PluginModePanel({ api: providedApi }: PluginModePanelProps) {
  const { t } = useTranslation();
  // 统一反馈入口：删除插件走危险确认
  const feedback = useFeedback();
  const api = providedApi ?? window.plugins;
  const [overview, setOverview] = useState<PluginOverview>({ plugins: [], issues: [] });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [headerAction, setHeaderAction] = useState<HeaderAction>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PanelView>("installed");
  const [market, setMarket] = useState<MarketState>({ phase: "idle", plugins: [] });
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [confirmingInstall, setConfirmingInstall] = useState(false);
  const mounted = useRef(true);
  const marketRequest = useRef(0);
  const overviewRequest = useRef(0);
  // State alone cannot block two clicks in the same React batch.
  const installationPending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      marketRequest.current += 1;
      overviewRequest.current += 1;
    };
  }, [api]);

  const reload = useCallback(async () => {
    if (!api) throw new Error(t("pluginPanel.apiUnavailable"));
    const request = ++overviewRequest.current;
    const result = await api.list();
    if (mounted.current && request === overviewRequest.current) setOverview(normalizePluginOverview(result));
  }, [api, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    reload()
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reload]);

  // 每次切入市场视图都重新拉取列表；preferred 指定偏好源时把它提到探测首位；不监听不轮询
  const loadMarket = useCallback(async (preferred?: string) => {
    const request = ++marketRequest.current;
    if (!api) {
      setMarket({ phase: "error", plugins: [], error: t("pluginPanel.apiUnavailable") });
      return;
    }
    setMarket({ phase: "loading", plugins: [] });
    setMarketError(null);
    setMarketNotice(null);
    try {
      const result = await api.marketList(preferred);
      if (!mounted.current || request !== marketRequest.current) return;
      if (!result.ok) {
        setMarket({ phase: "error", plugins: [], error: result.error ?? t("pluginPanel.unknownError"), sources: result.sources, mode: result.mode });
      } else {
        setMarket({ phase: "ready", plugins: result.plugins, sources: result.sources, mode: result.mode });
      }
    } catch (cause) {
      if (!mounted.current || request !== marketRequest.current) return;
      setMarket({
        phase: "error",
        plugins: [],
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [api, t]);

  useEffect(() => {
    if (view === "market") void loadMarket();
    return () => { marketRequest.current += 1; };
  }, [view, loadMarket]);

  const visiblePlugins = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    const filtered = keyword
      ? overview.plugins.filter((plugin) =>
          plugin.name.toLowerCase().includes(keyword)
          || plugin.description.toLowerCase().includes(keyword)
          || plugin.author.toLowerCase().includes(keyword)
          || plugin.id.toLowerCase().includes(keyword))
      : overview.plugins;
    return [...filtered].sort((left, right) => {
      const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      return statusDiff || left.name.localeCompare(right.name, "zh-CN");
    });
  }, [filter, overview.plugins]);

  const refreshPlugins = useCallback(async () => {
    if (!api) return;
    setHeaderAction("refresh");
    setError(null);
    try {
      setOverview(normalizePluginOverview(await api.rescan()));
    } catch (cause) {
      setError(t("pluginPanel.refreshFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setHeaderAction(null);
    }
  }, [api, t]);

  const importPlugin = useCallback(async () => {
    if (!api) return;
    setHeaderAction("import");
    setError(null);
    try {
      const result = await api.importZip();
      if (!result.ok && !result.canceled) {
        setError(t("pluginPanel.importFailed", { error: result.error ?? t("pluginPanel.unknownError") }));
      } else if (result.ok) {
        if (result.overview) setOverview(normalizePluginOverview(result.overview));
        else await reload();
      }
    } catch (cause) {
      setError(t("pluginPanel.importFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setHeaderAction(null);
    }
  }, [api, reload, t]);

  const installFromMarket = useCallback(async (entry: MarketPluginEntry) => {
    if (!api || entry.compatible === false || installationPending.current) return;
    const installed = overview.plugins.find((plugin) => plugin.id === entry.id);
    const action = resolveMarketAction(entry, installed);
    if (action.kind === "installed" || action.kind === "installedLocalNewer") return;
    installationPending.current = true;
    const request = marketRequest.current;
    const isCurrent = () => mounted.current && request === marketRequest.current;
    setInstallingId(entry.id);
    setConfirmingInstall(true);
    setMarketError(null);
    setMarketNotice(null);
    try {
      const actionLabel = t(`pluginPanel.market.${action.kind === "replace" ? "replaceInstall" : action.kind}`);
      const confirmed = await feedback.confirm({
        title: actionLabel,
        message: [
          t("pluginPanel.market.installConfirm", { action: actionLabel, name: entry.name, version: entry.version }),
          t(`pluginPanel.market.${!installed ? "freshInstallState" : installed.configuredEnabled ? "preserveEnabledState" : "preserveDisabledState"}`),
          action.kind === "replace" ? t("pluginPanel.market.replaceWarning") : "",
          action.kind === "update" ? t("pluginPanel.market.updateWarning") : "",
          t("pluginPanel.market.capabilities", { capabilities: entry.capabilities?.join(", ") || t("pluginPanel.market.capabilitiesUnknown") }),
          t("pluginPanel.market.executionWarning"),
        ].filter(Boolean).join("\n\n"),
        confirmText: actionLabel,
        cancelText: t("common.cancel"),
        dangerous: true,
      });
      if (!confirmed || !isCurrent()) return;
      setConfirmingInstall(false);
      const result = await api.marketInstall(entry.id);
      if (!result.ok) {
        if (isCurrent()) setMarketError(t("pluginPanel.market.installFailed", { error: result.error ?? t("pluginPanel.unknownError") }));
      } else {
        if (isCurrent()) {
          const successKey = !installed ? "installSuccess" : installed.configuredEnabled ? "replacementSuccessEnabled" : "replacementSuccessDisabled";
          setMarketNotice(t(`pluginPanel.market.${successKey}`, { action: actionLabel, name: result.plugin.name }));
        }
        // Refresh installed state even when the user returned to the installed list.
        if (mounted.current) await reload();
      }
    } catch (cause) {
      if (isCurrent()) setMarketError(t("pluginPanel.market.installFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      installationPending.current = false;
      if (mounted.current) {
        setInstallingId(null);
        setConfirmingInstall(false);
      }
    }
  }, [api, feedback, overview.plugins, reload, t]);

  const openPlugin = useCallback(async (plugin: PluginListEntry) => {
    if (!api) return;
    const action = `${plugin.id}:open`;
    setBusyAction(action);
    setError(null);
    try {
      const result = await api.open(plugin.id);
      if (!result.ok) setError(t("pluginPanel.openFailed", { error: result.error ?? t("pluginPanel.unknownError") }));
    } catch (cause) {
      setError(t("pluginPanel.openFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusyAction(null);
    }
  }, [api, t]);

  const togglePlugin = useCallback(async (plugin: PluginListEntry) => {
    if (!api) return;
    const action = `${plugin.id}:toggle`;
    setBusyAction(action);
    setError(null);
    try {
      const result = await api.setEnabled(plugin.id, pluginToggleTarget(plugin));
      if (!result.ok) {
        setError(t("pluginPanel.toggleFailed", { error: result.error ?? t("pluginPanel.unknownError") }));
      }
      await reload();
    } catch (cause) {
      setError(t("pluginPanel.toggleFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusyAction(null);
    }
  }, [api, reload, t]);

  const deletePlugin = useCallback(async (plugin: PluginListEntry) => {
    if (!api || plugin.source !== "user") return;
    // 删除插件程序目录：危险确认，默认聚焦取消
    const confirmed = await feedback.confirm({
      title: t("pluginPanel.delete"),
      message: t("pluginPanel.deleteConfirm", { name: plugin.name }),
      confirmText: t("pluginPanel.delete"),
      cancelText: t("common.cancel"),
      dangerous: true,
    });
    if (!confirmed) return;
    const action = `${plugin.id}:delete`;
    setBusyAction(action);
    setError(null);
    try {
      const result = await api.uninstall(plugin.id);
      if (!result.ok) {
        setError(t("pluginPanel.deleteFailed", { error: result.error ?? t("pluginPanel.unknownError") }));
      } else if (result.overview) {
        setOverview(normalizePluginOverview(result.overview));
      } else {
        await reload();
      }
    } catch (cause) {
      setError(t("pluginPanel.deleteFailed", { error: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusyAction(null);
    }
  }, [api, feedback, reload, t]);

  const inMarket = view === "market";
  const marketToggleLabel = inMarket ? t("pluginPanel.market.back") : t("pluginPanel.market.toggle");
  const catalogNotice = market.mode === "bundled"
    ? t("pluginPanel.market.bundledNotice")
    : market.mode === "offline-fallback"
      ? t("pluginPanel.market.fallbackNotice")
      : null;

  return (
    <div className="plugin-panel">
      <header className="plugin-panel__header">
        <div className="plugin-panel__heading">
          <h1 className="plugin-panel__title">{inMarket ? t("pluginPanel.market.title") : t("pluginPanel.title")}</h1>
          <p className="plugin-panel__subtitle">{inMarket ? t("pluginPanel.market.subtitle") : t("pluginPanel.subtitle")}</p>
          <p className="plugin-panel__subtitle plugin-panel__registry">
            {inMarket ? t("pluginPanel.market.catalogHint") : t("pluginPanel.registryLink")}
          </p>
        </div>
        <div className="plugin-panel__header-actions">
          <button
            type="button"
            className={`plugin-panel__icon-button${inMarket ? " is-accent" : ""}`}
            onClick={() => {
              marketRequest.current += 1;
              setMarket({ phase: "idle", plugins: [] });
              setMarketError(null);
              setMarketNotice(null);
              setView(inMarket ? "installed" : "market");
            }}
            disabled={!api}
            aria-label={marketToggleLabel}
            title={marketToggleLabel}
          >
            <AppstoreOutlined />
          </button>
          <button
            type="button"
            className="plugin-panel__icon-button"
            onClick={() => void (inMarket ? loadMarket() : refreshPlugins())}
            disabled={!api || headerAction !== null}
            aria-label={t("pluginPanel.refresh")}
            title={t("pluginPanel.refresh")}
          >
            <ReloadOutlined spin={headerAction === "refresh" || (inMarket && market.phase === "loading")} />
          </button>
          <button
            type="button"
            className="plugin-panel__icon-button is-accent"
            onClick={() => void importPlugin()}
            disabled={!api || headerAction !== null}
            aria-label={t("pluginPanel.add")}
            title={t("pluginPanel.add")}
          >
            <PlusOutlined />
          </button>
        </div>
      </header>

      {!inMarket && (
        <div className="plugin-panel__search-row">
          <input
            className="plugin-panel__search"
            placeholder={t("pluginPanel.searchPlaceholder")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      )}

      {inMarket ? (
        <>
          {market.sources && market.sources.length > 0 && (
            <div className="plugin-panel__source-switch" role="group" aria-label={t("pluginPanel.market.sourceSection")}>
              <span className="plugin-panel__source-switch-label">{t("pluginPanel.market.sourceSection")}</span>
              {market.sources.map((source) => {
                const stateLabel = source.used
                  ? t("pluginPanel.market.sourceUsed")
                  : source.ok
                    ? t("pluginPanel.market.sourceStandby")
                    : t("pluginPanel.market.sourceDead");
                return (
                  <button
                    type="button"
                    key={source.url}
                    className={`plugin-panel__source-chip${source.used ? " is-used" : source.ok ? " is-standby" : " is-dead"}`}
                    onClick={() => void loadMarket(source.url)}
                    disabled={!api || market.phase === "loading" || source.url === "bundled:registry"}
                    title={`${marketSourceLabel(source.url, t)} · ${stateLabel}`}
                  >
                    {marketSourceLabel(source.url, t)}
                  </button>
                );
              })}
            </div>
          )}
          {(catalogNotice || marketError || marketNotice) && (
            <div className="plugin-panel__notices" role="status">
              {catalogNotice && <div className="plugin-panel__notice">{catalogNotice}</div>}
              {marketError && <div className="plugin-panel__notice is-error">{marketError}</div>}
              {marketNotice && <div className="plugin-panel__notice">{marketNotice}</div>}
            </div>
          )}
          {market.phase === "loading" ? (
            <div className="plugin-panel__loading">{t("common.loading")}</div>
          ) : market.phase === "error" ? (
            <div className="plugin-panel__empty">
              <p>{t("pluginPanel.market.loadFailed", { error: market.error ?? t("pluginPanel.unknownError") })}</p>
              <button type="button" className="plugin-card-ui__button" onClick={() => void loadMarket()} disabled={!api}>
                {t("common.retry")}
              </button>
            </div>
          ) : market.plugins.length === 0 ? (
            <div className="plugin-panel__empty">{t("pluginPanel.market.emptyHint")}</div>
          ) : (
            <div className="plugin-panel__grid">
              {market.plugins.map((entry) => {
                const installed = overview.plugins.find((plugin) => plugin.id === entry.id);
                const action = resolveMarketAction(entry, installed);
                const installingThis = installingId === entry.id;
                const installBlocked = installingId !== null || entry.compatible === false;
                const bundled = entry.source === "bundled" || market.mode === "bundled" || (market.mode === "offline-fallback" && entry.source !== "remote");
                const compatibility = t(`pluginPanel.market.${entry.compatible === false ? "incompatible" : entry.compatible === true ? "compatible" : "compatibilityUnknown"}`);
                let label: string;
                let primary = false;
                let disabled = false;
                let hint: string | undefined;
                switch (action.kind) {
                  case "install":
                    label = t("pluginPanel.market.install");
                    primary = true;
                    break;
                  case "update":
                    label = t("pluginPanel.market.update");
                    primary = true;
                    break;
                  case "replace":
                    label = t("pluginPanel.market.replaceInstall");
                    hint = t("pluginPanel.market.replaceHint");
                    break;
                  case "installed":
                    label = t("pluginPanel.market.installed", { version: action.version });
                    disabled = true;
                    break;
                  case "installedLocalNewer":
                    label = t("pluginPanel.market.installedLocalNewer", { version: action.version });
                    disabled = true;
                    break;
                }
                return (
                  <article className="plugin-card-ui" key={entry.id}>
                    <div className="plugin-card-ui__main">
                      <span className="plugin-card-ui__icon" aria-hidden="true">
                        <AppstoreOutlined />
                      </span>
                      <div className="plugin-card-ui__body">
                        <div className="plugin-card-ui__name-row">
                          <strong className="plugin-card-ui__name">{entry.name}</strong>
                          <span className="plugin-card-ui__version">v{entry.version}</span>
                        </div>
                        <p className="plugin-card-ui__description" title={entry.description}>{entry.description}</p>
                        <p className="plugin-card-ui__developer">
                          {t("pluginPanel.developer", { author: entry.author.trim() || t("pluginPanel.unknownDeveloper") })}
                          <span className="plugin-card-ui__meta-sep"> · </span>
                          <span className="plugin-card-ui__downloads">
                            {bundled ? t("pluginPanel.market.sourceBundled") : t("pluginPanel.market.downloads", { downloads: entry.downloads })}
                          </span>
                        </p>
                      </div>
                    </div>
                    <p className={`plugin-card-ui__compatibility${entry.compatible === false ? " is-incompatible" : ""}`}>{compatibility}</p>
                    <details className="plugin-card-ui__details">
                      <summary>{t("pluginPanel.market.details")}</summary>
                      <p>{entry.description}</p>
                      <p>{t("pluginPanel.market.pluginId", { id: entry.id })}</p>
                      <p>{t("pluginPanel.market.apiVersion", { version: entry.pluginApiVersion ?? t("pluginPanel.market.notDeclared") })}</p>
                      <p>{t("pluginPanel.market.capabilities", { capabilities: entry.capabilities?.join(", ") || t("pluginPanel.market.capabilitiesUnknown") })}</p>
                      <p>{t("pluginPanel.market.executionWarning")}</p>
                    </details>
                    <div className="plugin-card-ui__actions">
                      <button
                        type="button"
                        className={`plugin-card-ui__button${primary ? " is-enabled" : ""}`}
                        onClick={() => void installFromMarket(entry)}
                        disabled={disabled || installBlocked}
                        title={entry.compatible === false ? compatibility : hint}
                      >
                        {installingThis && <LoadingOutlined spin />}
                        {installingThis ? ` ${t(confirmingInstall ? "pluginPanel.market.confirming" : "pluginPanel.market.installing")}` : label}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {(error || overview.issues.length > 0) && (
            <div className="plugin-panel__notices" role="status">
              {error && <div className="plugin-panel__notice is-error">{error}</div>}
              {overview.issues.map((issue, index) => (
                <div className="plugin-panel__notice" key={`${issue.path ?? issue.root}:${index}`}>{issue.message}</div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="plugin-panel__loading">{t("common.loading")}</div>
          ) : (
            <div className="plugin-panel__grid">
              {overview.plugins.length === 0 ? (
                <div className="plugin-panel__empty">{t("pluginPanel.emptyHint")}</div>
              ) : visiblePlugins.map((plugin) => {
                const transitioning = plugin.status === "starting" || plugin.status === "stopping";
                const cardBusy = busyAction?.startsWith(`${plugin.id}:`) === true;
                const canOpen = plugin.status === "running" && plugin.canOpen;
                const canDelete = plugin.source === "user" && !transitioning;
                const toggleText = plugin.status === "failed"
                  ? t("common.retry")
                  : plugin.status === "running"
                    ? t("pluginPanel.disable")
                    : t("pluginPanel.enable");
                return (
                  <article className={`plugin-card-ui is-${plugin.status}`} key={plugin.id}>
                    <div className="plugin-card-ui__main">
                      <span className="plugin-card-ui__icon" aria-hidden="true">
                        {plugin.icon
                          ? <img src={plugin.icon} alt="" />
                          : <AppstoreOutlined />}
                      </span>
                      <div className="plugin-card-ui__body">
                        <div className="plugin-card-ui__name-row">
                          <strong className="plugin-card-ui__name">{plugin.name}</strong>
                          <span className="plugin-card-ui__version">v{plugin.version}</span>
                          <span className={`plugin-card-ui__status is-${plugin.status}`}>
                            {t(`pluginPanel.status.${plugin.status}`)}
                          </span>
                        </div>
                        <p className="plugin-card-ui__description" title={plugin.description}>{plugin.description}</p>
                        <p className="plugin-card-ui__developer">
                          {t("pluginPanel.developer", { author: plugin.author.trim() || t("pluginPanel.unknownDeveloper") })}
                        </p>
                        {plugin.error && <p className="plugin-card-ui__error" title={plugin.error}>{plugin.error}</p>}
                      </div>
                    </div>
                    <div className="plugin-card-ui__actions">
                      {plugin.canOpen && (
                        <button
                          type="button"
                          className="plugin-card-ui__button"
                          onClick={() => void openPlugin(plugin)}
                          disabled={!canOpen || cardBusy}
                          title={!canOpen ? t("pluginPanel.openRequiresRunning") : t("pluginPanel.open")}
                        >
                          {t("pluginPanel.open")}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`plugin-card-ui__button${plugin.status === "running" ? " is-enabled" : ""}`}
                        onClick={() => void togglePlugin(plugin)}
                        disabled={transitioning || cardBusy}
                      >
                        {toggleText}
                      </button>
                      <button
                        type="button"
                        className="plugin-card-ui__button is-danger"
                        onClick={() => void deletePlugin(plugin)}
                        disabled={!canDelete || cardBusy}
                        title={plugin.source === "builtin" ? t("pluginPanel.builtinCannotDelete") : t("pluginPanel.delete")}
                      >
                        {t("pluginPanel.delete")}
                      </button>
                    </div>
                  </article>
                );
              })}
              {overview.plugins.length > 0 && visiblePlugins.length === 0 && (
                <div className="plugin-panel__empty">{t("pluginPanel.noMatch")}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PluginModePanel;
