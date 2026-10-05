import { EventEmitter } from "node:events";
import type { App } from "electron";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ ipcMain: {} }));
import { createIpcScope } from "../application/ipc-scope";
import { createBrowserService } from "./browser-service";
import { registerBrowserServiceIpc, installBrowserServiceLifecycle } from "./browser-service-ipc";
import { createShutdownCoordinator } from "../application/shutdown";
import { createStartupReadiness } from "../application/readiness";

function closedService() {
  return createBrowserService({ profile: {}, createSession: () => { throw Error("must not allocate"); }, createView: () => { throw Error("must not allocate"); } });
}
describe("Main browser IPC and existing lifecycle consumers", () => {
  it("uses shared IpcScope and returns real closed service availability, with no renderer gate field", async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const scope = createIpcScope({ handle: (key, value) => handlers.set(key, value), on: () => {}, removeHandler: key => handlers.delete(key), removeListener: () => {} });
    registerBrowserServiceIpc(scope, closedService());
    expect(await handlers.get("browser:availability")?.({}, { gateOpen: true })).toEqual({ available: false, reason: "network_unavailable" });
    expect(await handlers.get("browser:command")?.({ sender: {}, senderFrame: {} }, { kind: "open", url: "https://example.com/", gateOpen: true })).toEqual({ ok: false, code: "owner_mismatch" });
    scope.dispose(); expect(handlers.size).toBe(0);
  });
  it("denies managed target login/client certificate/bad TLS and leaves unrelated consumers untouched", () => {
    const service = closedService(), managed = { id: 42, session: {}, isDestroyed: () => false }, other = { ...managed }, app = new EventEmitter();
    const wrapped = { ...service, isRegisteredBrowser: (contents: object) => contents === managed, credentialsFor: () => null };
    const registrations: unknown[] = []; const stop = installBrowserServiceLifecycle(app as unknown as Pick<App, "on" | "removeListener">, wrapped, { register: input => { registrations.push(input); return () => {}; } });
    const preventDefault = vi.fn(), callback = vi.fn();
    app.emit("login", { preventDefault }, managed, {}, { isProxy: false, host: "example.com", port: 443, realm: "site", scheme: "basic" }, callback); expect(callback).toHaveBeenCalledWith();
    app.emit("select-client-certificate", { preventDefault }, managed, "https://example.com", [], callback); expect(callback).toHaveBeenLastCalledWith();
    app.emit("certificate-error", { preventDefault }, managed, "https://example.com", "bad", {}, callback); expect(callback).toHaveBeenLastCalledWith(false);
    const calls = callback.mock.calls.length; app.emit("login", { preventDefault }, other, {}, {}, callback); expect(callback).toHaveBeenCalledTimes(calls);
    stop(); expect(app.listenerCount("login")).toBe(0); expect(registrations).toHaveLength(2);
  });
  it("registers revoke before disposal in the real ShutdownCoordinator, and errors are visible", async () => {
    const readiness = createStartupReadiness(); readiness.transition("shell-ready");
    const order: string[] = [], logs: string[] = [], shutdown = createShutdownCoordinator({ readiness, log: message => logs.push(message) });
    const service = { ...closedService(), revokeAll: () => { order.push("revoke"); }, dispose: async () => { order.push("dispose"); return { ok: false as const, code: "cleanup_failed" as const }; } };
    installBrowserServiceLifecycle(new EventEmitter() as unknown as Pick<App, "on" | "removeListener">, service, shutdown);
    await shutdown.requestControlledShutdown({ reason: "fixture", finalAction: () => { order.push("exit"); } });
    expect(order).toEqual(["revoke", "dispose", "exit"]); expect(logs.some(message => message.includes("browser-service-dispose"))).toBe(true);
  });
});
