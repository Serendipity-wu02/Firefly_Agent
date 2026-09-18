import type { CapabilityJsonValue } from "../../shared/capability-types";
import type { PermissionProfile } from "../../shared/permission-profile-types";
import type { BrowserSettingsSnapshot } from "../../shared/settings-types";
import { normalizeBrowserUrl } from "./browser-policy";
import type { BrowserScope } from "../../shared/sandbox-types";

export type BrowserAuthorizationFacts =
  | {
      readonly ok: true;
      readonly requestedScope: BrowserScope;
      readonly approvalSummary: string;
      readonly approvalReason: string;
    }
  | {
      readonly ok: false;
      readonly code: "BROWSER_SCOPE_INVALID" | "BROWSER_NETWORK_CONFIGURATION_UNAVAILABLE";
      readonly message: string;
    };

export interface BrowserAuthorizationFactsResolverOptions {
  /** Main-owned SettingsManager snapshot source; this function performs no I/O. */
  readonly getBrowserSettingsSnapshot: () => BrowserSettingsSnapshot | undefined;
  /** Main-owned permission source; it selects the Sandbox Origin policy only. */
  readonly getPermissionProfile: () => PermissionProfile;
}

export interface BrowserAuthorizationFactsContext {
  /** Normalized URLs extracted from the current user message by Main. */
  readonly browserRequestTargets: readonly string[];
}

function isExactBrowserInput(
  input: Readonly<Record<string, CapabilityJsonValue>>,
): input is Readonly<{ requestUrl: string }> {
  return Object.keys(input).length === 1
    && typeof input.requestUrl === "string"
    && input.requestUrl.trim().length > 0;
}

/**
 * Build one immutable Browser authorization fact set from the current Main
 * configuration. It only parses the request URL and reads Settings state;
 * it never resolves DNS, opens a socket, or invokes the Browser backend.
 */
export function createBrowserAuthorizationFactsResolver(
  options: BrowserAuthorizationFactsResolverOptions,
): (
  input: Readonly<Record<string, CapabilityJsonValue>>,
  context: BrowserAuthorizationFactsContext,
) => BrowserAuthorizationFacts {
  return (input, context): BrowserAuthorizationFacts => {
    if (!isExactBrowserInput(input)) {
      return {
        ok: false,
        code: "BROWSER_SCOPE_INVALID",
        message: "Browser authorization requires exactly one requestUrl string.",
      };
    }

    const normalized = normalizeBrowserUrl(input.requestUrl);
    if (!normalized.allowed) {
      return {
        ok: false,
        code: "BROWSER_SCOPE_INVALID",
        message: normalized.message,
      };
    }

    if (!context.browserRequestTargets.includes(normalized.url.href)) {
      return {
        ok: false,
        code: "BROWSER_SCOPE_INVALID",
        message: "Browser URL was not explicitly provided in the current user message.",
      };
    }

    const snapshot = options.getBrowserSettingsSnapshot();
    if (snapshot === undefined || snapshot.status === "unavailable") {
      return {
        ok: false,
        code: "BROWSER_NETWORK_CONFIGURATION_UNAVAILABLE",
        message: "The saved Browser network configuration is unavailable; no read was authorized.",
      };
    }

    const settings = snapshot.settings;
    const originAccess = options.getPermissionProfile() === "RESTRICTED_SCOPE"
      ? "configured"
      : "public";
    const requestedScope: BrowserScope = Object.freeze({
      kind: "browser",
      initialUrl: normalized.url.href,
      targetOrigin: normalized.url.origin,
      originAccess,
      transportMode: settings.transportMode,
      ...(settings.transportMode === "http_proxy"
        ? { proxyEndpoint: Object.freeze({ ...settings.httpProxy }) }
        : {}),
      networkRevision: snapshot.revision,
    });

    return Object.freeze({
      ok: true,
      requestedScope,
      approvalSummary: settings.transportMode === "http_proxy"
        ? `读取网页 ${normalized.url.href}（经显式 HTTP 代理）`
        : `读取网页 ${normalized.url.href}（直连）`,
      approvalReason: settings.transportMode === "http_proxy"
        ? "用户当前消息明确提供了该网页地址；网页域名由已保存的显式 HTTP 代理解析，代理端点不是网页服务器地址。"
        : "用户当前消息明确提供了该网页地址；本次只读取静态标题与正文。",
    });
  };
}
