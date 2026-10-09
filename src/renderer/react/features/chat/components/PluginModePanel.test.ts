// @vitest-environment jsdom

import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmOptions } from "../../../../shared/feedback-types";
import type {
  MarketInstallResult,
  MarketListResult,
  MarketPluginEntry,
  PluginListEntry,
  PluginManagementApi,
} from "../../../../../shared/plugin-management";

vi.mock("../../../i18n", async () => {
  const { default: messages } = await import("../../../i18n/zh-CN.json");
  const labels: Record<string, string> = {
        "common.loading": "加载中…",
        "common.retry": "重试",
        "pluginPanel.title": "功能插件",
        "pluginPanel.subtitle": "管理已安装的功能插件",
        "pluginPanel.searchPlaceholder": "搜索插件名称、描述或开发者…",
        "pluginPanel.refresh": "刷新插件",
        "pluginPanel.add": "添加插件",
        "pluginPanel.emptyHint": "暂无插件",
        "pluginPanel.noMatch": "无匹配插件",
        "pluginPanel.open": "打开",
        "pluginPanel.enable": "启用",
        "pluginPanel.disable": "停用",
        "pluginPanel.delete": "删除",
        "pluginPanel.status.running": "运行中",
        "pluginPanel.status.disabled": "已停用",
        "pluginPanel.status.starting": "启动中",
        "pluginPanel.status.stopping": "停用中",
        "pluginPanel.status.failed": "启动失败",
        "pluginPanel.builtinCannotDelete": "内置插件不可删除",
        "pluginPanel.market.title": "插件市场",
        "pluginPanel.market.toggle": "插件市场",
        "pluginPanel.market.back": "返回插件管理",
        "pluginPanel.market.install": "安装",
        "pluginPanel.market.update": "更新",
        "pluginPanel.market.installing": "安装中…",
        "pluginPanel.market.installed": "已安装 v{{version}}",
        "pluginPanel.market.installedLocalNewer": "已安装 v{{version}}（本地版本更高）",
        "pluginPanel.market.replaceInstall": "替换安装",
        "pluginPanel.market.replaceHint": "已存在同 ID 的本地插件",
        "pluginPanel.market.emptyHint": "市场暂无插件",
        "pluginPanel.market.downloads": "{{downloads}} 次下载",
        "pluginPanel.market.loadFailed": "获取插件列表失败：{{error}}",
        "pluginPanel.market.installFailed": "安装失败：{{error}}",
        "pluginPanel.market.installSuccess": "{{name}} 安装成功",
        "pluginPanel.market.sourceUsed": "数据源",
        "pluginPanel.market.sourceStandby": "可用",
        "pluginPanel.market.sourceSection": "数据源",
        "pluginPanel.market.sourceGitee": "Gitee",
        "pluginPanel.market.sourceGithub": "GitHub",
      };
  const t = (key: string, values?: Record<string, string>) => {
      if (key === "pluginPanel.developer") return `开发者：${values?.author}`;
      if (key === "pluginPanel.deleteConfirm") return `删除 ${values?.name}`;
      const localized = key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], messages);
      const template = labels[key] ?? (typeof localized === "string" ? localized : key);
      if (!values) return template;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ""));
  };
  return { useTranslation: () => ({ t }) };
});

// 统一反馈入口的稳定 spy：断言删除插件走危险确认而非浏览器默认弹窗
const feedbackSpies = vi.hoisted(() => ({
  notice: vi.fn(),
  alert: vi.fn(() => Promise.resolve()),
  confirm: vi.fn<(options: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(true)),
}));

vi.mock("../../../components/feedback/FeedbackProvider", () => ({
  useFeedback: () => feedbackSpies,
}));

import { PluginModePanel, pluginToggleTarget, resolveMarketAction } from "./PluginModePanel";

function plugin(overrides: Partial<PluginListEntry> = {}): PluginListEntry {
  return {
    id: "system-status",
    name: "系统状态",
    version: "0.1.0",
    description: "查询本机系统状态",
    author: "Test Author",
    entry: "index.cjs",
    apiVersion: 1,
    source: "user",
    path: "C:\\plugins\\system-status",
    defaultEnabled: false,
    configuredEnabled: true,
    enabled: true,
    status: "running",
    hasUnregister: true,
    canOpen: true,
    icon: "data:image/png;base64,AA==",
    ...overrides,
  };
}

function marketEntry(overrides: Partial<MarketPluginEntry> = {}): MarketPluginEntry {
  return {
    id: "market-demo",
    name: "市场演示",
    version: "1.2.0",
    description: "市场里的演示插件",
    author: "Test Author",
    downloads: 12,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function apiFor(items: PluginListEntry[]): PluginManagementApi {
  return {
    list: vi.fn(async () => ({ plugins: items, issues: [] })),
    setEnabled: vi.fn(async () => ({ ok: true })),
    open: vi.fn(async () => ({ ok: true })),
    rescan: vi.fn(async () => ({ plugins: items, issues: [] })),
    importZip: vi.fn(async () => ({ ok: false, canceled: true })),
    uninstall: vi.fn(async () => ({ ok: true, overview: { plugins: [], issues: [] } })),
    marketList: vi.fn(async () => ({ ok: true, plugins: [] })),
    marketInstall: vi.fn(async () => ({ ok: false, error: "not implemented" })),
  };
}

describe("PluginModePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    feedbackSpies.notice.mockClear();
    feedbackSpies.alert.mockClear().mockReturnValue(Promise.resolve());
    feedbackSpies.confirm.mockClear().mockReturnValue(Promise.resolve(true));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function renderPanel(api: PluginManagementApi): Promise<void> {
    await act(async () => {
      root.render(createElement(PluginModePanel, { api }));
    });
  }

  async function clickMarketToggle(): Promise<void> {
    const toggle = container.querySelector<HTMLButtonElement>(".plugin-panel__header-actions button");
    expect(toggle).toBeDefined();
    await act(async () => toggle?.click());
  }

  it("shows icon, plugin metadata, developer, and the three requested actions", async () => {
    const api = apiFor([plugin()]);
    await renderPanel(api);

    expect(container.textContent).toContain("系统状态");
    expect(container.textContent).toContain("查询本机系统状态");
    expect(container.textContent).toContain("开发者：Test Author");
    expect(container.querySelector<HTMLImageElement>(".plugin-card-ui__icon img")?.src).toContain("data:image/png");
    const cardButtons = [...container.querySelectorAll<HTMLButtonElement>(".plugin-card-ui__actions button")];
    expect(cardButtons.map((button) => button.textContent)).toEqual(["打开", "停用", "删除"]);
  });

  it("hides the open action when the plugin has no interface", async () => {
    const api = apiFor([plugin({ canOpen: false })]);
    await renderPanel(api);

    const cardButtons = [...container.querySelectorAll<HTMLButtonElement>(".plugin-card-ui__actions button")];
    expect(cardButtons.map((button) => button.textContent)).toEqual(["停用", "删除"]);
  });

  it("enables a disabled plugin and refreshes its state", async () => {
    const disabledPlugin = plugin({ configuredEnabled: false, enabled: false, status: "disabled" });
    const api = apiFor([disabledPlugin]);
    await renderPanel(api);
    const enable = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "启用");
    expect(enable).toBeDefined();

    await act(async () => enable?.click());

    expect(api.setEnabled).toHaveBeenCalledWith("system-status", true);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("keeps delete disabled for built-in plugins", async () => {
    const api = apiFor([plugin({ source: "builtin" })]);
    await renderPanel(api);

    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "删除");
    expect(deleteButton?.disabled).toBe(true);
    expect(deleteButton?.title).toBe("内置插件不可删除");
  });

  it("删除插件先走危险确认，确认后才卸载", async () => {
    const api = apiFor([plugin()]);
    await renderPanel(api);

    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "删除");
    expect(deleteButton?.disabled).toBe(false);

    await act(async () => deleteButton?.click());

    // 危险确认：标题为删除、dangerous 标记、默认聚焦取消
    expect(feedbackSpies.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "删除",
      dangerous: true,
    }));
    expect(api.uninstall).toHaveBeenCalledWith("system-status");
  });

  it("危险确认取消时不卸载插件", async () => {
    feedbackSpies.confirm.mockReturnValue(Promise.resolve(false));
    const api = apiFor([plugin()]);
    await renderPanel(api);

    const deleteButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "删除");
    await act(async () => deleteButton?.click());

    expect(feedbackSpies.confirm).toHaveBeenCalledTimes(1);
    expect(api.uninstall).not.toHaveBeenCalled();
  });

  it("切换到市场视图拉取列表并渲染卡片，切回后恢复插件视图", async () => {
    const api = apiFor([]);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugins: [marketEntry()],
    });
    await renderPanel(api);
    expect(api.marketList).not.toHaveBeenCalled();

    await clickMarketToggle();

    expect(api.marketList).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("插件市场");
    expect(container.textContent).toContain("市场演示");
    expect(container.textContent).toContain("12 次下载");
    // 市场视图隐藏搜索框
    expect(container.querySelector(".plugin-panel__search")).toBeNull();
    // 未安装的市场插件展示粉色主按钮「安装」
    const installButton = container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button");
    expect(installButton?.textContent).toBe("安装");
    expect(installButton?.className).toContain("is-enabled");

    await clickMarketToggle();

    expect(container.querySelector(".plugin-panel__search")).not.toBeNull();
    expect(container.textContent).toContain("管理已安装的功能插件");
  });

  it("市场卡片按钮状态随本地安装情况变化", async () => {
    const installed = [
      plugin({ id: "mkt-update", version: "1.1.0", origin: "market" }),
      plugin({ id: "mkt-same", version: "1.2.0", origin: "market" }),
      plugin({ id: "mkt-local-newer", version: "2.0.0", origin: "market" }),
      plugin({ id: "mkt-local" }),
      plugin({ id: "mkt-builtin", source: "builtin" }),
    ];
    const api = apiFor(installed);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugins: [
        marketEntry(),
        marketEntry({ id: "mkt-update" }),
        marketEntry({ id: "mkt-same" }),
        marketEntry({ id: "mkt-local-newer" }),
        marketEntry({ id: "mkt-local" }),
        marketEntry({ id: "mkt-builtin" }),
      ],
    });
    await renderPanel(api);
    await clickMarketToggle();

    const cards = [...container.querySelectorAll<HTMLElement>(".plugin-card-ui")];
    expect(cards).toHaveLength(6);
    const buttons = cards.map((card) => card.querySelector<HTMLButtonElement>("button"));
    expect(buttons.map((button) => button?.textContent)).toEqual([
      "安装",
      "更新",
      "已安装 v1.2.0",
      "已安装 v2.0.0（本地版本更高）",
      "替换安装",
      "替换安装",
    ]);
    expect(buttons.map((button) => button?.disabled)).toEqual([false, false, true, true, false, false]);
    // 替换安装按钮带提示文案
    expect(buttons[4]?.title).toBe("已存在同 ID 的本地插件");
  });

  it("市场列表拉取失败时展示错误信息", async () => {
    const api = apiFor([]);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "网络不可用",
      plugins: [],
    });
    await renderPanel(api);
    await clickMarketToggle();

    expect(container.textContent).toContain("获取插件列表失败：网络不可用");
  });

  it("点击数据源 chip 会以该源 url 重新拉取市场列表", async () => {
    const gitee = "https://mirror.example.test/registry.json";
    const github = "https://example.test/registry.json";
    const api = apiFor([]);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugins: [marketEntry()],
      sources: [
        { url: github, ok: true, used: true },
        { url: gitee, ok: true, used: false },
      ],
    });
    await renderPanel(api);
    await clickMarketToggle();

    // 首次进入自动拉取（无偏好源）
    expect(api.marketList).toHaveBeenCalledWith(undefined);

    const chips = [...container.querySelectorAll<HTMLButtonElement>(".plugin-panel__source-chip")];
    expect(chips).toHaveLength(2);
    const giteeChip = chips.find((chip) => chip.textContent === "mirror.example.test");
    expect(giteeChip).toBeDefined();
    await act(async () => giteeChip?.click());

    expect(api.marketList).toHaveBeenLastCalledWith(gitee);
    expect(api.marketList).toHaveBeenCalledTimes(2);
  });

  it.each([
    { installed: undefined, action: "安装" },
    { installed: plugin({ id: "market-demo", origin: "market", version: "1.0.0" }), action: "更新" },
    { installed: plugin({ id: "market-demo" }), action: "替换安装" },
  ])("requires explicit $action confirmation with version, declarations, and execution warning", async ({ installed, action }) => {
    const api = apiFor(installed ? [installed] : []);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry({ capabilities: ["network", "filesystem"], compatible: true })] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());

    expect(feedbackSpies.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: action,
      confirmText: action,
      dangerous: true,
      message: expect.stringContaining("市场演示 v1.2.0"),
    }));
    const confirmation = feedbackSpies.confirm.mock.calls[0]?.[0] as { message: string };
    expect(confirmation.message).toContain("network, filesystem");
    expect(confirmation.message).toContain("Node.js");
    expect(confirmation.message).toContain("应用权限");
    expect(confirmation.message).toContain("不代表沙箱隔离");
    expect(api.marketInstall).toHaveBeenCalledWith("market-demo");
  });

  it.each([
    { origin: "market" as const, enabled: true, action: "更新", confirmation: "保留启用设置，新代码可能立即运行", success: "保留启用设置" },
    { origin: "local" as const, enabled: false, action: "替换安装", confirmation: "保留停用设置", success: "保留停用设置" },
  ])("describes preserved state for $action (enabled=$enabled)", async ({ origin, enabled, action, confirmation, success }) => {
    const installed = plugin({ id: "market-demo", version: "1.0.0", origin, configuredEnabled: enabled, enabled, status: enabled ? "running" : "disabled" });
    const api = apiFor([installed]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    vi.mocked(api.marketInstall).mockResolvedValue({ ok: true, plugin: { id: "market-demo", name: "市场演示", version: "1.2.0" } });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    const options = feedbackSpies.confirm.mock.calls[0]?.[0];
    expect(options?.title).toBe(action);
    expect(options?.message).toContain(confirmation);
    expect(options?.message).not.toContain("安装完成后插件处于停用状态");
    const notice = container.querySelector(".plugin-panel__notices");
    expect(notice?.textContent).toContain(success);
    expect(notice?.textContent).toContain("市场演示");
    expect(notice?.textContent).not.toContain("默认停用");
  });

  it("states that only a fresh install starts disabled", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    expect(feedbackSpies.confirm.mock.calls[0]?.[0]?.message).toContain("首次安装后默认停用");
    expect(container.querySelector(".plugin-panel__subtitle")?.textContent).toContain("首次安装后默认停用");
  });

  it("canceling market confirmation never starts an installation", async () => {
    feedbackSpies.confirm.mockResolvedValue(false);
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    expect(feedbackSpies.confirm).toHaveBeenCalledTimes(1);
    expect(api.marketInstall).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.disabled).toBe(false);
  });

  it("blocks repeated same-tick installs while confirmation is pending", async () => {
    const confirmation = deferred<boolean>();
    feedbackSpies.confirm.mockReturnValue(confirmation.promise);
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    const button = container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button");
    await act(async () => { button?.click(); button?.click(); });
    expect(feedbackSpies.confirm).toHaveBeenCalledTimes(1);
    expect(api.marketInstall).not.toHaveBeenCalled();
    await act(async () => confirmation.resolve(true));
    expect(api.marketInstall).toHaveBeenCalledTimes(1);
  });

  it("leaving and reopening the market invalidates a pending confirmation", async () => {
    const confirmation = deferred<boolean>();
    feedbackSpies.confirm.mockReturnValue(confirmation.promise);
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    await clickMarketToggle();
    await clickMarketToggle();
    await act(async () => confirmation.resolve(true));
    expect(api.marketInstall).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.disabled).toBe(false);
  });

  it("displays incompatible API and disables installation", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry({ compatible: false, pluginApiVersion: 99 })] });
    await renderPanel(api);
    await clickMarketToggle();
    expect(container.textContent).toContain("不兼容");
    expect(container.textContent).toContain("插件 API：99");
    const button = container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button");
    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(feedbackSpies.confirm).not.toHaveBeenCalled();
    expect(api.marketInstall).not.toHaveBeenCalled();
  });

  it("exposes native plugin details with compatibility and capability declarations", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry({ compatible: true, pluginApiVersion: 1, capabilities: ["network"], source: "remote" })] });
    await renderPanel(api);
    await clickMarketToggle();
    const details = container.querySelector<HTMLDetailsElement>(".plugin-card-ui details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toBe("插件详情");
    expect(details?.textContent).toContain("market-demo");
    expect(details?.textContent).toContain("插件 API：1");
    expect(details?.textContent).toContain("声明的能力：network");
    expect(details?.textContent).toContain("不代表沙箱隔离");
    expect(container.textContent).toContain("兼容当前应用");
  });

  it("labels the bundled offline catalog as unpublished online and omits fabricated downloads", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({
      ok: true, mode: "bundled", plugins: [marketEntry({ source: "bundled", downloads: 0 })],
      sources: [{ url: "bundled:registry", ok: true, used: true }],
    });
    await renderPanel(api);
    await clickMarketToggle();
    expect(container.textContent).toContain("随应用提供的离线目录");
    expect(container.textContent).toContain("尚未发布在线市场");
    expect(container.textContent).not.toContain("0 次下载");
    const source = container.querySelector<HTMLButtonElement>(".plugin-panel__source-chip");
    expect(source?.textContent).toBe("随附离线目录");
    expect(source?.disabled).toBe(true);
  });

  it("explains remote failure while showing bundled fallback", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({
      ok: true, mode: "offline-fallback", plugins: [marketEntry({ source: "bundled", downloads: 0 })],
      sources: [{ url: "https://example.test/registry.json", ok: false, used: false }, { url: "bundled:registry", ok: true, used: true }],
    });
    await renderPanel(api);
    await clickMarketToggle();
    expect(container.textContent).toContain("在线目录不可用，正在显示随附离线目录");
    expect(container.textContent).not.toContain("0 次下载");
    expect(container.querySelector<HTMLButtonElement>(".plugin-panel__source-chip.is-dead")?.title).toContain("不可用");
  });

  it("refreshes market results rather than rescanning installed plugins", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList)
      .mockResolvedValueOnce({ ok: true, plugins: [marketEntry({ name: "旧列表" })] })
      .mockResolvedValueOnce({ ok: true, plugins: [marketEntry({ name: "新列表" })] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="刷新插件"]')?.click());
    expect(container.textContent).toContain("新列表");
    expect(container.textContent).not.toContain("旧列表");
    expect(api.rescan).not.toHaveBeenCalled();
  });

  it("offers a working retry after market failure", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList)
      .mockRejectedValueOnce(new Error("离线"))
      .mockResolvedValueOnce({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "重试");
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    expect(container.textContent).toContain("市场演示");
    expect(container.textContent).not.toContain("获取插件列表失败");
  });

  it.each(["success", "error"])("ignores stale %s after a newer market refresh", async (outcome) => {
    const old = deferred<MarketListResult>();
    const api = apiFor([]);
    vi.mocked(api.marketList)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ok: true, plugins: [marketEntry({ name: "最新目录" })] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="刷新插件"]')?.click());
    expect(container.textContent).toContain("最新目录");
    await act(async () => {
      if (outcome === "success") old.resolve({ ok: true, plugins: [marketEntry({ name: "旧目录" })] });
      else old.reject(new Error("过期失败"));
    });
    expect(container.textContent).toContain("最新目录");
    expect(container.textContent).not.toContain("旧目录");
    expect(container.textContent).not.toContain("过期失败");
  });

  it("ignores a response from a previous market visit after reopening", async () => {
    const old = deferred<MarketListResult>();
    const api = apiFor([]);
    vi.mocked(api.marketList)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ok: true, plugins: [marketEntry({ name: "新访问" })] });
    await renderPanel(api);
    await clickMarketToggle();
    await clickMarketToggle();
    await clickMarketToggle();
    expect(container.textContent).toContain("新访问");
    await act(async () => old.resolve({ ok: true, plugins: [marketEntry({ name: "旧访问" })] }));
    expect(container.textContent).toContain("新访问");
    expect(container.textContent).not.toContain("旧访问");
  });

  it.each([true, false])("does not show stale install feedback after reopening (success=%s)", async (success) => {
    const installation = deferred<MarketInstallResult>();
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    vi.mocked(api.marketInstall).mockReturnValue(installation.promise);
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    expect(api.marketInstall).toHaveBeenCalledTimes(1);
    await clickMarketToggle();
    await clickMarketToggle();
    await act(async () => installation.resolve(success
      ? { ok: true, plugin: { id: "market-demo", name: "上次安装", version: "1.2.0" } }
      : { ok: false, error: "上次安装失败" }));
    expect(container.textContent).not.toContain("上次安装");
    expect(container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.disabled).toBe(false);
    if (success) expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("unmounting while confirmation is pending prevents an install", async () => {
    const confirmation = deferred<boolean>();
    feedbackSpies.confirm.mockReturnValue(confirmation.promise);
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({ ok: true, plugins: [marketEntry()] });
    await renderPanel(api);
    await clickMarketToggle();
    await act(async () => container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button")?.click());
    await act(async () => root.render(null));
    await act(async () => confirmation.resolve(true));
    expect(api.marketInstall).not.toHaveBeenCalled();
  });

  it("uses parsed source hostnames rather than trusted words in URLs", async () => {
    const api = apiFor([]);
    vi.mocked(api.marketList).mockResolvedValue({
      ok: true, plugins: [], sources: [
        { url: "https://example.test/github/registry.json", ok: true, used: true },
        { url: "https://gitee.com.example.test/registry.json", ok: true, used: false },
      ],
    });
    await renderPanel(api);
    await clickMarketToggle();
    const labels = [...container.querySelectorAll(".plugin-panel__source-chip")].map((chip) => chip.textContent);
    expect(labels).toEqual(["example.test", "gitee.com.example.test"]);
  });

  it("安装成功后显示提示并刷新本地列表", async () => {
    const api = apiFor([]);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugins: [marketEntry()],
    });
    (api.marketInstall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugin: { id: "market-demo", name: "市场演示", version: "1.2.0" },
    });
    await renderPanel(api);
    await clickMarketToggle();

    const installButton = container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button");
    await act(async () => installButton?.click());

    expect(api.marketInstall).toHaveBeenCalledWith("market-demo");
    expect(container.textContent).toContain("市场演示 安装成功");
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("安装失败时展示错误信息", async () => {
    const api = apiFor([]);
    (api.marketList as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      plugins: [marketEntry()],
    });
    (api.marketInstall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: "插件包校验失败",
    });
    await renderPanel(api);
    await clickMarketToggle();

    const installButton = container.querySelector<HTMLButtonElement>(".plugin-card-ui__actions button");
    await act(async () => installButton?.click());

    expect(container.textContent).toContain("安装失败：插件包校验失败");
  });
});

describe("pluginToggleTarget", () => {
  it("retries failed plugins and disables running plugins", () => {
    expect(pluginToggleTarget(plugin({ status: "failed" }))).toBe(true);
    expect(pluginToggleTarget(plugin({ status: "running" }))).toBe(false);
  });
});

describe("resolveMarketAction", () => {
  it("非法版本号不触发更新判断", () => {
    const installed = plugin({ version: "1.2.0", origin: "market" });
    // 市场版本非法时既不算更新也不算本地更高，落到同版本展示态
    expect(resolveMarketAction(marketEntry({ version: "abc" }), installed)).toEqual({
      kind: "installed",
      version: "1.2.0",
    });
  });
});
