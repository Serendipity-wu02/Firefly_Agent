import { DEFAULT_UI_COLORS, normalizeUiColors } from "../../shared/ui-colors";
import * as fs from "fs";
import * as path from "path";
import { logger, LogTag } from "../logger";
import {
  DEFAULT_WINDOW_CORNER_RADIUS,
  normalizeWindowCornerRadius,
} from "../../shared/window-corner-radius";
import { DEFAULT_UI_FONT, normalizeUiFont } from "../../shared/ui-font";
import {
  DEFAULT_CUSTOM_STYLE,
  normalizeCustomStyleConfig,
  normalizeStyleId,
} from "../../shared/style-sampling";
import { normalizeUiTheme } from "../../shared/ui-theme";
import { normalizeUiIcon } from "../../shared/ui-icon";
import { normalizeChatAppearance } from "../../shared/chat-appearance";
import {
  normalizeChatSocialContextEnabled,
  normalizeDefaultChatMode,
  normalizeMobileMessageSegmentationMode,
  normalizeProactiveChatMode,
  normalizeProactiveDeliveryTarget,
  normalizeSegmentedOutputMode,
} from "../../shared/preferences";
import { normalizeWindowVisibilitySettings } from "../window-visibility-settings";
import { normalizeCitaSettings } from "../cita/settings";
import { getGeneralSettingsPath } from "../settings-store";
import type { GeneralSettings } from "./general-settings";

import type { ToolModeOverrides } from "../orchestrator/tools/registry/tool-registry";
import type { ConversationMode } from "../../shared/chat-types";
import type { SkillModeOverrides } from "../skills/types";
import { normalizeLspServerOverrides } from "../lsp/server-catalog";
import {
  applyInstallerLaunchAtLoginSelection,
  consumeInstallerLaunchAtLoginSelection,
} from "./launch-at-login";

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  plugins: {},
  maxParallelToolCalls: 4,
  citaEnabled: false,
  citaSemanticEngine: "remote",
  chatSocialContextEnabled: false,
  petAlwaysOnTop: true,
  petVisible: true,
  petZoom: 1,
  sidebarVisible: true,
  tasksVisible: true,
  toastSoundEnabled: true,
  launchAtLogin: false,
  language: "zh-CN",
  uiTheme: "pearl-white",
  uiColors: { ...DEFAULT_UI_COLORS },
  windowCornerRadius: DEFAULT_WINDOW_CORNER_RADIUS,
  uiThemeRadius: false,
  uiFont: DEFAULT_UI_FONT,
  uiIcon: "firefly",
  defaultChatMode: "chat",
  currentStyleId: "default",
  customStyle: DEFAULT_CUSTOM_STYLE,
  segmentedOutputMode: "off",
  mobileMessageSegmentation: "off",
  proactiveChatMode: "off",
  proactiveDeliveryTarget: "local",

  weatherSource: "open-meteo",
  weatherEnabled: false,
  amapKey: "",
  travelEnabled: false,
  playwrightMcpEnabled: false,
  searchEngine: "off",
  searchBochaKey: "",
  searchTavilyKey: "",
  searchMinimaxKey: "",
  searchAnySearchKey: "",
  emailEnabled: false,
  emailSmtpHost: "",
  emailSmtpPort: 465,
  emailSmtpSecure: true,
  emailSmtpUser: "",
  emailSmtpPass: "",
  emailFromName: "",
  asrMosslandKey: "",
  asrEngine: "off",
  asrAliyunAppKey: "",
  asrAliyunAccessKeyId: "",
  asrAliyunAccessKeySecret: "",
  asrLanguage: "zh",
  screenshotHotkey: "Alt+Shift+S",
  chatLineHeight: 1.75,
  toolModeOverrides: {},
  chatToolsEnabled: false,
  skillModeOverrides: {},
  lspServerOverrides: [],
};

const listeners = new Set<(before: GeneralSettings, after: GeneralSettings) => void>();

let generalSettingsCache: GeneralSettings | null = null;
let generalSettingsReadFailed = false;

export function assertGeneralSettingsReadable(): void {
  loadGeneralSettings();
  if (generalSettingsReadFailed) throw new Error("GENERAL_SETTINGS_READ_FAILED: 应用设置读取失败，原文件已保留");
}

export function onGeneralSettingsChanged(
  listener: (before: GeneralSettings, after: GeneralSettings) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyGeneralSettingsChanged(before: GeneralSettings, after: GeneralSettings): void {
  for (const listener of listeners) {
    listener(before, after);
  }
}

export function normalizeGeneralSettings(
  input: Partial<GeneralSettings> | null | undefined,
): GeneralSettings {
  const windowVisibility = normalizeWindowVisibilitySettings(input);
  const cita = normalizeCitaSettings({
    enabled: input?.citaEnabled,
    semanticEngine: input?.citaSemanticEngine,
  });
  const clamp = (value: unknown, fallback: number) => {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : fallback;
  };
  const clampPort = (value: unknown, fallback: number) => {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? Math.max(1, Math.min(65535, Math.round(num))) : fallback;
  };
  const clampMs = (value: unknown, fallback: number) => {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? Math.max(1000, Math.min(120000, Math.round(num))) : fallback;
  };
  const normalizeMaxParallelToolCalls = (value: unknown): number => {
    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numberValue)
      ? Math.max(1, Math.min(8, Math.trunc(numberValue)))
      : DEFAULT_GENERAL_SETTINGS.maxParallelToolCalls;
  };
  return {
    plugins: Object.fromEntries(
      Object.entries(input?.plugins ?? {}).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    ),
    maxParallelToolCalls: normalizeMaxParallelToolCalls(input?.maxParallelToolCalls),
    citaEnabled: cita.enabled,
    citaSemanticEngine: cita.semanticEngine,
    chatSocialContextEnabled: normalizeChatSocialContextEnabled(input?.chatSocialContextEnabled),
    petAlwaysOnTop: input?.petAlwaysOnTop === undefined
      ? DEFAULT_GENERAL_SETTINGS.petAlwaysOnTop
      : Boolean(input.petAlwaysOnTop),
    petVisible: input?.petVisible === undefined
      ? DEFAULT_GENERAL_SETTINGS.petVisible
      : Boolean(input.petVisible),
    petZoom: typeof input?.petZoom === "number"
      ? Math.max(0.5, Math.min(2, input.petZoom))
      : DEFAULT_GENERAL_SETTINGS.petZoom,
    petWindowX: typeof input?.petWindowX === "number" && isFinite(input.petWindowX)
      ? Math.round(input.petWindowX)
      : undefined,
    petWindowY: typeof input?.petWindowY === "number" && isFinite(input.petWindowY)
      ? Math.round(input.petWindowY)
      : undefined,
    disableGpuElectron: input?.disableGpuElectron,
    sidebarVisible: windowVisibility.sidebarVisible,
    tasksVisible: windowVisibility.tasksVisible,
    toastSoundEnabled: input?.toastSoundEnabled === undefined
      ? DEFAULT_GENERAL_SETTINGS.toastSoundEnabled
      : Boolean(input.toastSoundEnabled),
    launchAtLogin: Boolean(input?.launchAtLogin),
    language: "zh-CN",
    uiTheme: normalizeUiTheme(input?.uiTheme),
    uiColors: normalizeUiColors(input?.uiColors),
    windowCornerRadius: normalizeWindowCornerRadius(input?.windowCornerRadius),
    uiThemeRadius: input?.uiThemeRadius ?? true,
    uiFont: normalizeUiFont(input?.uiFont),
    uiIcon: normalizeUiIcon(input?.uiIcon),
    defaultChatMode: normalizeDefaultChatMode(input?.defaultChatMode),
    currentStyleId: normalizeStyleId(input?.currentStyleId),
    customStyle: normalizeCustomStyleConfig(input?.customStyle),
    segmentedOutputMode: normalizeSegmentedOutputMode(input?.segmentedOutputMode),
    mobileMessageSegmentation: normalizeMobileMessageSegmentationMode(input?.mobileMessageSegmentation),
    proactiveChatMode: normalizeProactiveChatMode(input?.proactiveChatMode),
    proactiveDeliveryTarget: normalizeProactiveDeliveryTarget(input?.proactiveDeliveryTarget),

    weatherSource: ["open-meteo", "amap"].includes(String(input?.weatherSource))
      ? (input!.weatherSource as "open-meteo" | "amap")
      : "open-meteo",
    weatherEnabled: Boolean(input?.weatherEnabled),
    amapKey: typeof input?.amapKey === "string" ? input.amapKey : "",
    travelEnabled: Boolean(input?.travelEnabled),
    playwrightMcpEnabled: Boolean(input?.playwrightMcpEnabled),
    searchEngine: ["off", "bocha", "tavily", "minimax", "anySearch"].includes(String(input?.searchEngine))
      ? (input!.searchEngine as "off" | "bocha" | "tavily" | "minimax" | "anySearch")
      : "off",
    searchBochaKey: typeof input?.searchBochaKey === "string" ? input.searchBochaKey : "",
    searchTavilyKey: typeof input?.searchTavilyKey === "string" ? input.searchTavilyKey : "",
    searchMinimaxKey: typeof input?.searchMinimaxKey === "string" ? input.searchMinimaxKey : "",
    searchAnySearchKey: typeof input?.searchAnySearchKey === "string" ? input.searchAnySearchKey : "",
    emailEnabled: Boolean(input?.emailEnabled),
    emailSmtpHost: typeof input?.emailSmtpHost === "string" ? input.emailSmtpHost : "",
    emailSmtpPort: clampPort(input?.emailSmtpPort, DEFAULT_GENERAL_SETTINGS.emailSmtpPort),
    emailSmtpSecure: input?.emailSmtpSecure === undefined
      ? (clampPort(input?.emailSmtpPort, DEFAULT_GENERAL_SETTINGS.emailSmtpPort) === 465)
      : Boolean(input.emailSmtpSecure),
    emailSmtpUser: typeof input?.emailSmtpUser === "string" ? input.emailSmtpUser : "",
    emailSmtpPass: typeof input?.emailSmtpPass === "string" ? input.emailSmtpPass : "",
    emailFromName: typeof input?.emailFromName === "string" ? input.emailFromName : "",
    asrMosslandKey: typeof input?.asrMosslandKey === "string" ? input.asrMosslandKey : typeof (input as {ttsMosslandKey?: unknown})?.ttsMosslandKey === "string" ? (input as {ttsMosslandKey: string}).ttsMosslandKey : "",
    asrEngine: ["off", "aliyun", "mossland", "local"].includes(String(input?.asrEngine))
      ? (input!.asrEngine as "off" | "aliyun" | "mossland" | "local")
      : "off",
    asrAliyunAppKey: typeof input?.asrAliyunAppKey === "string" ? input.asrAliyunAppKey : "",
    asrAliyunAccessKeyId: typeof input?.asrAliyunAccessKeyId === "string" ? input.asrAliyunAccessKeyId : "",
    asrAliyunAccessKeySecret: typeof input?.asrAliyunAccessKeySecret === "string" ? input.asrAliyunAccessKeySecret : "",
    asrLanguage: ["zh", "en", "auto"].includes(String(input?.asrLanguage))
      ? (input!.asrLanguage as "zh" | "en" | "auto")
      : "zh",
    screenshotHotkey: typeof input?.screenshotHotkey === "string" && input.screenshotHotkey.trim()
      ? input.screenshotHotkey.trim()
      : DEFAULT_GENERAL_SETTINGS.screenshotHotkey,

    ...normalizeChatAppearance(input),
    toolModeOverrides: normalizeToolModeOverrides(input?.toolModeOverrides),
    chatToolsEnabled: Boolean(input?.chatToolsEnabled),
    skillModeOverrides: normalizeSkillModeOverrides(input?.skillModeOverrides),
    lspServerOverrides: normalizeLspServerOverrides(input?.lspServerOverrides),
  };
}

/** 规范化工具-模式覆盖层：仅保留合法的 { toolId: { mode: boolean } } 结构。
 *  非法值（非对象、非 boolean）被丢弃，空对象兜底。 */
function normalizeToolModeOverrides(
  input: unknown,
): ToolModeOverrides {
  if (!input || typeof input !== "object") return {};
  const result: ToolModeOverrides = {};
  const raw = input as Record<string, unknown>;
  for (const [toolId, modeMap] of Object.entries(raw)) {
    if (!modeMap || typeof modeMap !== "object") continue;
    const filtered: Partial<Record<ConversationMode, boolean>> = {};
    for (const [mode, value] of Object.entries(modeMap as Record<string, unknown>)) {
      if (mode !== "chat" && mode !== "work" && mode !== "code") continue;
      if (typeof value === "boolean") {
        filtered[mode as ConversationMode] = value;
      }
    }
    if (Object.keys(filtered).length > 0) {
      result[toolId] = filtered;
    }
  }
  return result;
}

const SKILL_MODES = new Set(["work", "code"] as const);

/** 规范化 Skill-模式覆盖层：仅保留合法的 { skillId: { work|code: boolean } } 结构。
 *  非法值被丢弃，空对象兜底。 */
function normalizeSkillModeOverrides(
  input: unknown,
): SkillModeOverrides {
  if (!input || typeof input !== "object") return {};
  const result: SkillModeOverrides = {};
  const raw = input as Record<string, unknown>;
  for (const [skillId, modeMap] of Object.entries(raw)) {
    if (!modeMap || typeof modeMap !== "object") continue;
    const filtered: Partial<Record<"work" | "code", boolean>> = {};
    for (const [mode, value] of Object.entries(modeMap as Record<string, unknown>)) {
      if (!SKILL_MODES.has(mode as "work" | "code")) continue;
      if (typeof value === "boolean") {
        filtered[mode as "work" | "code"] = value;
      }
    }
    if (Object.keys(filtered).length > 0) {
      result[skillId] = filtered;
    }
  }
  return result;
}

function loadGeneralSettings0(): GeneralSettings {
  try {
    const filePath = getGeneralSettingsPath();
    let present = true;
    try {
      fs.statSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      present = false;
    }
    const existing = present ? JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<GeneralSettings> : {};
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error("Invalid general settings");
    const installerSelection = consumeInstallerLaunchAtLoginSelection(
      path.join(path.dirname(filePath), "installer-options.json"),
      fs,
    );
    const withInstallerSelection = applyInstallerLaunchAtLoginSelection(existing, installerSelection);
    if (installerSelection !== null) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // Persist only the installer's explicit choice; retirement must not rewrite saved keys.
      fs.writeFileSync(filePath, JSON.stringify(withInstallerSelection, null, 2));
    }
    return normalizeGeneralSettings(withInstallerSelection);
  } catch {
    generalSettingsReadFailed = true;
    logger.warn(LogTag.Runtime, "general settings read failed; writes blocked");
    return { ...DEFAULT_GENERAL_SETTINGS };
  }
}

export function loadGeneralSettings(): GeneralSettings {
  if (generalSettingsCache !== null) return generalSettingsCache;
  return (generalSettingsCache = loadGeneralSettings0());
}

export function saveGeneralSettings(partial: Partial<GeneralSettings>): GeneralSettings {
  assertGeneralSettingsReadable();
  const before = loadGeneralSettings();
  assertGeneralSettingsReadable();
  const normalized = normalizeGeneralSettings({ ...before, ...partial });
  const filePath = getGeneralSettingsPath();
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
  generalSettingsCache = normalized;
  notifyGeneralSettingsChanged(before, normalized);
  return normalized;
}
