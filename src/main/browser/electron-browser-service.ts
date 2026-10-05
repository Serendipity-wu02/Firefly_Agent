import { session, type Session } from "electron";
import type { RuntimeProfile } from "../runtime-profile";
import { createElectronBrowserSessionPort } from "./browser-network-binding";
import { createElectronBrowserGuest } from "./electron-browser-guest";
import { createBrowserService, type BrowserServiceOptions } from "./browser-service";
import { createTrustedBrowserProxyFactory, type TrustedBrowserResolverConfig } from "./trusted-browser-resolver";
/** Main composition only. Default stays closed; no setting/env/IPC can open it. */
export function createElectronBrowserService(options: { profile: RuntimeProfile; gateOpen?: boolean; onChanged?: BrowserServiceOptions<Session>["onChanged"]; trustedResolver?: TrustedBrowserResolverConfig }) {
  return createBrowserService<Session>({ ...options,
    proxyFactory: options.trustedResolver === undefined ? undefined : createTrustedBrowserProxyFactory(options.trustedResolver),
    createSession: partition => createElectronBrowserSessionPort(session.fromPartition(partition, { cache: false })),
    createView: createElectronBrowserGuest,
  });
}
