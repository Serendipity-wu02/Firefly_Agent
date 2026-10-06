import { BROWSER_PUBLIC_SCOPE } from "../../shared/manual-browser";
import { session, dialog, type BrowserWindow, type Session } from "electron";
import type { RuntimeProfile } from "../runtime-profile";
import { createElectronBrowserSessionPort } from "./browser-network-binding";
import { createElectronBrowserGuest } from "./electron-browser-guest";
import { createBrowserService, type BrowserServiceOptions } from "./browser-service";
import { createTrustedBrowserProxyFactory, type TrustedBrowserResolverConfig } from "./trusted-browser-resolver";
/** Main composition. Browsing starts denied; only this native user decision may grant a bounded owner scope. */
export function createElectronBrowserService(options: { profile: RuntimeProfile; gateOpen?: boolean; onChanged?: BrowserServiceOptions<Session>["onChanged"]; trustedResolver?: TrustedBrowserResolverConfig }) {
  return createBrowserService<Session>({ ...options,
    permissionPolicy: BROWSER_PUBLIC_SCOPE,
    confirmPermission: async (owner, scope, signal) => {
      if (owner.signal.aborted) return false;
      const labels = { navigate: "导航 / 后退 / 前进 / 刷新", observe: "读取页面文字与可交互元素", click: "点击公共页面元素", type: "在非敏感文本框输入" };
      const result = await dialog.showMessageBox(owner.host as BrowserWindow, {
        signal, type: "question", title: "授权右侧浏览器", message: "允许当前会话在以下范围浏览并由代理操作吗？",
        detail: `当前会话：${owner.conversationId}\n\n精确域名（包含所列静态资源）：\n${scope.hosts.join("\n")}\n\n允许动作：\n${scope.actions.map(action => labels[action]).join("\n")}\n\n仅匿名公共 HTTPS GET/HEAD；不登录、不下载、不上传。关闭页面、撤销或切换会话后失效。网页内容不可信；受限代理不代表已证明所有网络协议完全隔离。`,
        buttons: ["拒绝", "允许本会话"], defaultId: 0, cancelId: 0, noLink: true,
      });
      return result.response === 1 && !owner.signal.aborted;
    },
    proxyFactory: options.trustedResolver === undefined ? undefined : createTrustedBrowserProxyFactory(options.trustedResolver),
    createSession: partition => createElectronBrowserSessionPort(session.fromPartition(partition, { cache: false })),
    createView: createElectronBrowserGuest,
  });
}
