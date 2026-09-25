/**
 * 渲染端 i18n 运行时基础设施（与具体窗口无关）。
 *
 * - 各窗口（settings / sidebar / tasks / chat-react ...）的 i18n/index.ts 调用
 *   initWindowI18n({ resources, fallbackLng }) 把自己窗口的翻译资源挂到本地
 *   i18next 实例上。
 * - 本目录不持有任何翻译资源，也不在模块顶层 init（避免跨窗口 import 时
 *   副作用污染）。每个 Electron renderer 进程天然独立一份 i18next 单例。
 * - 暴露 initWindowI18n / useTranslation / t / setLocale / subscribeLocaleChanged
 *   供窗口代码使用。
 */
import i18next, { type i18n as I18nInstance } from "i18next";
import { useCallback, useSyncExternalStore } from "react";

export interface WindowI18nOptions {
  /** 该窗口的翻译资源，如 { en: { translation: {...} }, "zh-CN": { translation: {...} } } */
  resources: Record<string, Record<string, unknown>>;
  /** 主语言 fallback（默认 zh-CN） */
  fallbackLng?: string;
  /** 初始语言；不传则用 fallbackLng */
  lng?: string;
}

let initialized = false;

/**
 * 在当前 renderer 进程中初始化一份独立的 i18next 实例。
 * 同一进程内多次调用是幂等的，第二次调用会被忽略（避免 HMR 重入）。
 */
export function initWindowI18n(options: WindowI18nOptions): I18nInstance {
  if (initialized) return i18next;
  initialized = true;
  void i18next.init({
    lng: options.lng ?? options.fallbackLng ?? "zh-CN",
    fallbackLng: options.fallbackLng ?? "zh-CN",
    resources: options.resources,
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key) => key,
  });
  return i18next;
}

/** 供非 React 模块直接使用的翻译函数。语言切换时不会自动重渲染。 */
export const t: I18nInstance["t"] = i18next.t.bind(i18next);

/** 切换当前窗口的语言（仅影响本进程）。 */
export function setLocale(locale: string): void {
  if (locale.trim()) void i18next.changeLanguage(locale.trim());
}

/** 读取当前语言。 */
export function getLocale(): string {
  return i18next.language;
}

/**
 * 订阅语言切换事件。返回一个取消订阅函数。
 * 用于非 React 模块（例如 settings.ts vanilla TS）监听语言变更并触发重渲染。
 */
export function subscribeLocaleChanged(onChange: (locale: string) => void): () => void {
  const handler = (locale: string) => onChange(locale);
  i18next.on("languageChanged", handler);
  return () => {
    i18next.off("languageChanged", handler);
  };
}

/**
 * 声明式 HTML 翻译：对 rootEl 子树里所有带 data-i18n* 属性的元素应用 t()。
 *
 * 支持的属性：
 * - data-i18n             → 元素的 textContent（仅替换自身，不动 svg/icon 子节点）
 * - data-i18n-placeholder → input/textarea 的 placeholder
 * - data-i18n-title       → 元素的 title 属性
 * - data-i18n-aria-label  → aria-label
 *
 * 自动订阅 languageChanged，运行时切语言会重新应用；返回取消订阅函数。
 *
 * 注意：调用方必须已 initWindowI18n。
 */
export function applyTranslations(rootEl: ParentNode = document): () => void {
  const apply = () => {
    rootEl.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
      // data-i18n 只挂在叶子文本节点上：textContent 只覆盖自身的直接文本，
      // 不会删除 svg / img / 子元素（这些是元素节点而非文本节点）。
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    rootEl.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key && "placeholder" in el) (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(key);
    });
    rootEl.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.title = t(key);
    });
    rootEl.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", t(key));
    });
  };
  apply();
  return subscribeLocaleChanged(apply);
}

/**
 * React 组件翻译 hook：语言切换时自动重渲染。
 * 用法：const { t } = useTranslation(); t("settings.navMemory")
 */
export function useTranslation() {
  const locale = useSyncExternalStore(
    (onChange) => i18next.on("languageChanged", () => onChange()),
    () => i18next.language,
    () => i18next.language,
  );
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => i18next.t(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
  return { t: translate, locale };
}
