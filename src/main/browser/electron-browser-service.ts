import { session, type Session } from "electron";
import type { RuntimeProfile } from "../runtime-profile";
import { createElectronBrowserSessionPort } from "./browser-network-binding";
import { createElectronBrowserGuest } from "./electron-browser-guest";
import { createBrowserService, type BrowserServiceOptions } from "./browser-service";
/** Main composition only. Default stays closed; no setting/env/IPC can open it. */
export function createElectronBrowserService(options: { profile: RuntimeProfile; gateOpen?: boolean; onChanged?: BrowserServiceOptions<Session>["onChanged"] }) {
  return createBrowserService<Session>({ ...options,
    createSession: partition => createElectronBrowserSessionPort(session.fromPartition(partition, { cache: false })),
    createView: createElectronBrowserGuest,
  });
}
