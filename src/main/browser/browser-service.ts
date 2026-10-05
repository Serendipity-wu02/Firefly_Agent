import type { View } from "electron";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { isPublicNetworkAddress, parseConnectAuthority } from "./public-network-target";
import { createBrowserAuthorizationDomainRegistry } from "./browser-authorization-domain";
import { createBrowserNetworkController, type BrowserNetworkBinding, type BrowserNetworkReply } from "./browser-network-binding";
import type { ProxyChallenge } from "./authenticated-connect-proxy";
import type { BrowserDomainContext } from "./browser-authorization-domain";
import type { BrowserNetworkDependencies, BrowserNetworkFailure, BrowserViewPort } from "./browser-network-binding";
export interface BrowserHostPort {
  webContents: { id: number; mainFrame: object; isDestroyed(): boolean; on(event: string, listener: () => void): unknown; removeListener(event: string, listener: () => void): unknown };
  isDestroyed(): boolean; isVisible(): boolean; isFocused(): boolean; getContentSize(): [number, number]; contentView: Pick<View, "addChildView" | "removeChildView">;
  on(event: string, listener: () => void): unknown; removeListener(event: string, listener: () => void): unknown;
}
export interface TrustedBrowserOwner { readonly host: BrowserHostPort; readonly topFrame: object; readonly profile: object; readonly conversationId: string; readonly ownerSessionId: string; readonly generation: number; readonly signal: AbortSignal }
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export type BrowserErrorCode = BrowserNetworkFailure | "blocked_url" | "load_failed";
export interface BrowserPageDto { browserId: string; conversationId: string; requestId: number; closed: boolean; loading: boolean; url: string; pendingUrl: string | null; canGoBack: boolean; canGoForward: boolean; error: BrowserErrorCode | null }
export type BrowserReply<T> = { ok: true; value: T } | { ok: false; code: BrowserErrorCode };
export type ManualBrowserCommand = { kind: "open"; url: string } | { kind: "navigate"; browserId: string; url: string } | { kind: "history"; browserId: string; action: "back" | "forward" | "reload" } | { kind: "layout"; browserId: string; bounds: BrowserBounds | null } | { kind: "close"; browserId: string };
export interface BrowserInvokeEvent { sender: BrowserHostPort["webContents"]; senderFrame: object | null }
export interface BrowserGuestPort<S extends object> extends BrowserViewPort<S> {
  loadURL(url: string): Promise<void>; history(action: "back" | "forward" | "reload"): Promise<void>;
  snapshot(): { url: string; canGoBack: boolean; canGoForward: boolean };
  stop(): void; attach(host: BrowserHostPort): void; detach(): void; setBounds(bounds: BrowserBounds): void;
  installCallbacks(callbacks: { allowsNavigation(url: string): boolean; started(url: string): void; changed(): void; failed(): void; destroyed(): void }): void;
}
export interface BrowserServiceOptions<S extends object> extends Omit<BrowserNetworkDependencies<S>, "createView"> {
  profile: object; gateOpen?: boolean; createView(session: S): BrowserGuestPort<S>; onChanged?(owner: TrustedBrowserOwner, page: BrowserPageDto): void;
}
export function validatePublicBrowserUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 8192) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const authority = parseConnectAuthority(`${url.hostname}:443`);
    return authority && (!isIP(authority.host) || isPublicNetworkAddress(authority.host)) ? url.href : null;
  } catch { return null; }
}
function parseCommand(value: unknown): ManualBrowserCommand | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "open") return typeof v.url === "string" ? { kind: "open", url: v.url } : null;
  if (typeof v.browserId !== "string" || !v.browserId || v.browserId.length > 128) return null;
  if (v.kind === "close") return { kind: "close", browserId: v.browserId };
  if (v.kind === "navigate") return typeof v.url === "string" ? { kind: "navigate", browserId: v.browserId, url: v.url } : null;
  if (v.kind === "history" && ["back", "forward", "reload"].includes(String(v.action))) return { kind: "history", browserId: v.browserId, action: v.action as "back" | "forward" | "reload" };
  if (v.kind === "layout") {
    if (v.bounds === null) return { kind: "layout", browserId: v.browserId, bounds: null };
    if (!v.bounds || typeof v.bounds !== "object") return null;
    const b = v.bounds as Record<string, unknown>;
    if (![b.x, b.y, b.width, b.height].every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1_000_000)
      || (b.width as number) < 0 || (b.height as number) < 0) return null;
    return { kind: "layout", browserId: v.browserId, bounds: { x: b.x as number, y: b.y as number, width: b.width as number, height: b.height as number } };
  }
  return null;
}
const fail = (code: BrowserErrorCode): BrowserReply<never> => ({ ok: false, code });

/** Main-only owner registry and manual controller. No renderer payload creates an owner/epoch. */
export function createBrowserService<S extends object>(options: BrowserServiceOptions<S>) {
  type Host = { host: BrowserHostPort; resolveOwner(event: BrowserInvokeEvent): TrustedBrowserOwner | null; current?: Owner; transitioning: boolean; lastGeneration: number; detach(): void; overlay: boolean; visible: boolean; focused: boolean };
  type Owner = { value: TrustedBrowserOwner; host: Host; event: BrowserInvokeEvent; retired: boolean; cells: Set<Cell> };
  type Cell = { owner: Owner; context: BrowserDomainContext; abort: AbortController; page: BrowserPageDto; preparing?: Promise<BrowserNetworkReply<BrowserNetworkBinding<S>>>; binding?: BrowserNetworkBinding<S>; guest?: BrowserGuestPort<S>; navigation?: AbortController; manualRequestId?: number; closing: boolean; failed: boolean; cleanup?: Promise<BrowserReply<null>>; onAbort(): void };
  const hosts = new Map<BrowserHostPort, Host>(), owners = new WeakMap<TrustedBrowserOwner, Owner>(), retired = new WeakSet<TrustedBrowserOwner>();
  const cells = new Map<string, Cell>(), guests = new WeakMap<S, BrowserGuestPort<S>>(), byContents = new WeakMap<object, Cell>();
  const registered = new WeakSet<object>();
  const gateOpen = options.gateOpen === true;
  let stopping = false;
  function validOwner(value: TrustedBrowserOwner, host: Host): boolean {
    try { return value.host === host.host && value.profile === options.profile && value.topFrame === host.host.webContents.mainFrame
      && value.signal instanceof AbortSignal && !value.signal.aborted && !host.host.isDestroyed() && !host.host.webContents.isDestroyed()
      && typeof value.conversationId === "string" && !!value.conversationId && value.conversationId.length <= 256
      && typeof value.ownerSessionId === "string" && !!value.ownerSessionId && value.ownerSessionId.length <= 256
      && Number.isSafeInteger(value.generation) && value.generation >= 0;
    } catch { return false; }
  }
  function current(owner: Owner): boolean {
    try { return !stopping && !owner.retired && hosts.get(owner.value.host) === owner.host && owner.host.current === owner
      && validOwner(owner.value, owner.host) && owner.host.resolveOwner(owner.event) === owner.value;
    } catch { return false; }
  }
  const registry = createBrowserAuthorizationDomainRegistry<S>({ gateOpen,
    isOwnerCurrent: context => {
      const owner = owners.get(context.owner as TrustedBrowserOwner);
      return !!owner && current(owner) && context.profile === options.profile && context.conversationId === owner.value.conversationId
        && context.generation === owner.value.generation && cells.get(context.browserId)?.owner === owner;
    } });
  const network = createBrowserNetworkController(registry, { ...options, createView: session => {
    const guest = options.createView(session); guests.set(session, guest); return guest;
  } });
  function publish(cell: Cell): void {
    if (current(cell.owner)) {
      try { options.onChanged?.(cell.owner.value, Object.freeze({ ...cell.page })); } catch { /* presentation callback cannot grant authority */ }
    }
  }
  function usable(cell: Cell): boolean { return !cell.closing && !cell.abort.signal.aborted && current(cell.owner) && cell.binding?.isCurrent() === true; }
  function terminate(cell: Cell): void {
    if (cell.closing) return;
    cell.closing = true; cell.navigation?.abort(); cell.abort.abort();
    try { cell.guest?.detach(); } catch { cell.failed = true; }
    cell.binding?.revoke();
    cell.page = { ...cell.page, requestId: cell.page.requestId + 1, closed: true, loading: false, pendingUrl: null, canGoBack: false, canGoForward: false, error: null };
    publish(cell);
  }
  function cleanup(cell: Cell, signal?: AbortSignal): Promise<BrowserReply<null>> {
    terminate(cell);
    return cell.cleanup ??= (async () => {
      // The controller bounds the preparation barrier as well as native cleanup.
      // Awaiting prepare here would make a hung setProxy block shutdown forever.
      const result = await network.disposeContext(cell.context, signal);
      if (!result.ok) cell.failed = true;
      cell.owner.value.signal.removeEventListener("abort", cell.onAbort);
      if (cell.failed) { cell.page = { ...cell.page, error: "cleanup_failed" }; publish(cell); return fail("cleanup_failed"); }
      cells.delete(cell.page.browserId); cell.owner.cells.delete(cell);
      return { ok: true, value: null };
    })();
  }
  // The exact listener is stored on the cell, never reconstructed during cleanup.
  async function closeOwner(owner: Owner, signal?: AbortSignal): Promise<BrowserReply<null>> {
    const results = await Promise.all([...owner.cells].map(cell => cleanup(cell, signal)));
    return results.every(r => r.ok) ? { ok: true, value: null } : fail("cleanup_failed");
  }
  function revoke(owner: TrustedBrowserOwner): void {
    const record = owners.get(owner); if (!record) return;
    record.retired = true; retired.add(owner);
    for (const cell of record.cells) terminate(cell);
    void closeOwner(record).catch(() => { for (const cell of record.cells) cell.failed = true; });
  }
  function snapshot(cell: Cell): void {
    if (!usable(cell) || !cell.guest || cell.manualRequestId !== undefined) return;
    const native = cell.guest.snapshot(), url = validatePublicBrowserUrl(native.url);
    if (url) cell.page = { ...cell.page, url, loading: false, pendingUrl: null, canGoBack: native.canGoBack, canGoForward: native.canGoForward };
    publish(cell);
  }
  async function navigate(cell: Cell, url: string, action?: "back" | "forward" | "reload"): Promise<BrowserReply<BrowserPageDto>> {
    if (!usable(cell) || !cell.guest) return fail(cell.owner.value.signal.aborted ? "cancelled" : "owner_mismatch");
    cell.navigation?.abort();
    const navigation = new AbortController(); cell.navigation = navigation;
    const requestId = cell.page.requestId + 1;
    cell.manualRequestId = requestId;
    const stop = () => { try { cell.guest?.stop(); } catch { cell.failed = true; } };
    navigation.signal.addEventListener("abort", stop, { once: true });
    cell.page = { ...cell.page, requestId, loading: true, pendingUrl: url, error: null }; publish(cell);
    let abort!: () => void;
    try {
      if (!usable(cell)) return fail("cancelled");
      const operation = action ? cell.guest.history(action) : cell.guest.loadURL(url);
      await Promise.race([operation, new Promise<never>((_, reject) => {
        abort = () => reject(new Error("cancelled")); navigation.signal.addEventListener("abort", abort, { once: true });
        if (navigation.signal.aborted) abort();
      })]);
      if (navigation.signal.aborted || cell.page.requestId !== requestId) return fail("cancelled");
      if (!usable(cell)) { terminate(cell); return fail(cell.owner.value.signal.aborted ? "cancelled" : "owner_mismatch"); }
      const native = cell.guest.snapshot(), committed = validatePublicBrowserUrl(native.url);
      if (!committed) throw new Error("invalid committed destination");
      cell.page = { ...cell.page, loading: false, pendingUrl: null, url: committed, canGoBack: native.canGoBack, canGoForward: native.canGoForward };
      publish(cell); return { ok: true, value: Object.freeze({ ...cell.page }) };
    } catch {
      if (navigation.signal.aborted || cell.page.requestId !== requestId || !usable(cell)) return fail(cell.owner.value.signal.aborted || navigation.signal.aborted ? "cancelled" : "owner_mismatch");
      cell.page = { ...cell.page, loading: false, pendingUrl: null, error: "load_failed" }; publish(cell); return fail("load_failed");
    } finally { navigation.signal.removeEventListener("abort", stop); if (abort) navigation.signal.removeEventListener("abort", abort); if (cell.manualRequestId === requestId) cell.manualRequestId = undefined; }
  }
  async function execute(ownerValue: TrustedBrowserOwner, input: unknown): Promise<BrowserReply<BrowserPageDto | null>> {
    const owner = owners.get(ownerValue);
    if (!owner || !current(owner)) return fail(ownerValue.signal?.aborted ? "cancelled" : "owner_mismatch");
    const command = parseCommand(input); if (!command) return fail("permission_denied");
    if (command.kind === "open") {
      if (!gateOpen) return fail("network_unavailable");
      const url = validatePublicBrowserUrl(command.url); if (!url) return fail("blocked_url");
      if (owner.cells.size) return fail("closed");
      const abort = new AbortController(), browserId = randomUUID();
      const context = Object.freeze({ owner: ownerValue, profile: options.profile, conversationId: ownerValue.conversationId, browserId, generation: ownerValue.generation, signal: abort.signal });
      const cell: Cell = { owner, context, abort, closing: false, failed: false,
        page: { browserId, conversationId: ownerValue.conversationId, requestId: 0, closed: false, loading: true, url: "", pendingUrl: url, canGoBack: false, canGoForward: false, error: null },
        onAbort: () => { terminate(cell); void cleanup(cell); } };
      cells.set(browserId, cell); owner.cells.add(cell); ownerValue.signal.addEventListener("abort", cell.onAbort, { once: true });
      cell.preparing = network.prepare(context); publish(cell);
      let cancelPrepare!: () => void;
      let prepared: BrowserNetworkReply<BrowserNetworkBinding<S>>;
      try {
        prepared = await Promise.race([cell.preparing, new Promise<BrowserNetworkReply<BrowserNetworkBinding<S>>>(resolve => {
          cancelPrepare = () => resolve({ ok: false, code: "cancelled" });
          abort.signal.addEventListener("abort", cancelPrepare, { once: true });
          if (abort.signal.aborted) cancelPrepare();
        })]);
      } finally { abort.signal.removeEventListener("abort", cancelPrepare); }
      if (abort.signal.aborted) { void cleanup(cell); return fail("cancelled"); }
      if (!prepared.ok) { await cleanup(cell); return fail(ownerValue.signal.aborted ? "cancelled" : prepared.code); }
      cell.binding = prepared.value; cell.guest = guests.get(prepared.value.session);
      if (!usable(cell) || !cell.guest) { await cleanup(cell); return fail(ownerValue.signal.aborted ? "cancelled" : "owner_mismatch"); }
      registered.add(cell.guest.contents); byContents.set(cell.guest.contents, cell);
      cell.guest.installCallbacks({ allowsNavigation: target => usable(cell) && validatePublicBrowserUrl(target) !== null,
        started: target => { if (usable(cell) && cell.manualRequestId === undefined && validatePublicBrowserUrl(target)) { cell.page = { ...cell.page, requestId: cell.page.requestId + 1, loading: true, pendingUrl: target, error: null }; publish(cell); } },
        changed: () => snapshot(cell), failed: () => { if (usable(cell) && cell.manualRequestId === undefined) { cell.page = { ...cell.page, loading: false, pendingUrl: null, error: "load_failed" }; publish(cell); } },
        destroyed: () => { if (!cell.closing) void cleanup(cell); } });
      return navigate(cell, url);
    }
    const cell = cells.get(command.browserId);
    if (!cell || cell.closing) return fail("closed"); if (cell.owner !== owner) return fail("owner_mismatch");
    if (command.kind === "close") {
      const closed = await cleanup(cell); return closed.ok ? { ok: true, value: Object.freeze({ ...cell.page }) } : closed;
    }
    if (!usable(cell) || !cell.guest) return fail("owner_mismatch");
    if (command.kind === "navigate") { const url = validatePublicBrowserUrl(command.url); return url ? navigate(cell, url) : fail("blocked_url"); }
    if (command.kind === "history") {
      const native = cell.guest.snapshot();
      if ((command.action === "back" && !native.canGoBack) || (command.action === "forward" && !native.canGoForward) || !cell.page.url) return fail("closed");
      return navigate(cell, cell.page.url, command.action);
    }
    if (command.bounds === null || owner.host.overlay || !owner.host.visible || !owner.host.focused
      || !ownerValue.host.isVisible() || !ownerValue.host.isFocused()) cell.guest.detach();
    else {
      const [width, height] = ownerValue.host.getContentSize(), left = Math.trunc(command.bounds.x), top = Math.trunc(command.bounds.y);
      const x = Math.max(0, Math.min(width, left)), y = Math.max(0, Math.min(height, top));
      const bounds = { x, y, width: Math.max(0, Math.min(width, left + Math.trunc(command.bounds.width)) - x), height: Math.max(0, Math.min(height, top + Math.trunc(command.bounds.height)) - y) };
      if (!bounds.width || !bounds.height) cell.guest.detach();
      else { if (!usable(cell)) return fail("owner_mismatch"); cell.guest.setBounds(bounds); cell.guest.attach(ownerValue.host); }
    }
    return { ok: true, value: Object.freeze({ ...cell.page }) };
  }
  async function dispatch(event: BrowserInvokeEvent, input: unknown): Promise<BrowserReply<BrowserPageDto | null>> {
    const host = [...hosts.values()].find(h => h.host.webContents === event.sender);
    if (!host || event.senderFrame !== host.host.webContents.mainFrame || stopping) return fail("owner_mismatch");
    let value: TrustedBrowserOwner | null; try { value = host.resolveOwner(event); } catch { return fail("owner_mismatch"); }
    if (!value || !validOwner(value, host) || retired.has(value)) return fail(value?.signal.aborted ? "cancelled" : "owner_mismatch");
    if (host.current?.value !== value) {
      if (host.transitioning || value.generation <= host.lastGeneration) return fail("owner_mismatch");
      host.transitioning = true;
      try {
        if (host.current) { const old = host.current; revoke(old.value); const result = await closeOwner(old); if (!result.ok) return result; }
        if (hosts.get(host.host) !== host || !validOwner(value, host) || host.resolveOwner(event) !== value) return fail("owner_mismatch");
        const owner: Owner = { value, host, event, retired: false, cells: new Set() }; host.current = owner; host.lastGeneration = value.generation; owners.set(value, owner);
      } finally { host.transitioning = false; }
    }
    return execute(value, input);
  }
  function registerHost(host: BrowserHostPort, resolveOwner: Host["resolveOwner"]): () => void {
    if (stopping || hosts.has(host) || host.isDestroyed()) throw new Error("browser host unavailable");
    const detachGuests = () => { for (const cell of entry.current?.cells ?? []) cell.guest?.detach(); };
    const hidden = () => { entry.visible = false; detachGuests(); };
    const blurred = () => { entry.focused = false; detachGuests(); };
    const shown = () => { entry.visible = true; };
    const focused = () => { entry.focused = true; };
    const closed = () => { void closeHost(host); };
    const entry: Host = { host, resolveOwner, transitioning: false, lastGeneration: -1, overlay: false, visible: host.isVisible(), focused: host.isFocused(), detach: () => {
      host.removeListener("closed", closed); host.removeListener("hide", hidden); host.removeListener("blur", blurred); host.removeListener("show", shown); host.removeListener("focus", focused); host.webContents.removeListener("destroyed", closed);
    } };
    hosts.set(host, entry); host.on("closed", closed); host.on("hide", hidden); host.on("blur", blurred); host.on("show", shown); host.on("focus", focused); host.webContents.on("destroyed", closed);
    return () => { void closeHost(host); };
  }
  async function closeHost(host: BrowserHostPort, signal?: AbortSignal): Promise<BrowserReply<null>> {
    const entry = hosts.get(host); if (!entry) return { ok: true, value: null };
    hosts.delete(host); entry.detach(); if (!entry.current) return { ok: true, value: null };
    revoke(entry.current.value); return closeOwner(entry.current, signal);
  }
  function revokeAll(): void { stopping = true; for (const cell of cells.values()) terminate(cell); network.revokeAll(); }
  async function dispose(signal?: AbortSignal): Promise<BrowserReply<null>> {
    revokeAll(); for (const entry of hosts.values()) entry.detach(); hosts.clear();
    const results = await Promise.all([...cells.values()].map(cell => cleanup(cell, signal))), result = await network.disposeAll(signal);
    return result.ok && results.every(r => r.ok) ? { ok: true, value: null } : fail("cleanup_failed");
  }
  return Object.freeze({ registerHost, dispatch, execute, revoke, revokeAll, closeHost, dispose,
    isEnabled: () => gateOpen && !stopping,
    isRegisteredBrowser: (contents: object) => registered.has(contents),
    credentialsFor: (contents: object, challenge: ProxyChallenge) => { const cell = byContents.get(contents); return cell && usable(cell) && cell.guest?.contents === contents ? cell.binding?.credentialsFor(cell.guest.contents, challenge) ?? null : null; },
    setTrustedOverlay(host: BrowserHostPort, visible: boolean) { const entry = hosts.get(host); if (!entry) return; entry.overlay = visible; if (visible) for (const cell of entry.current?.cells ?? []) cell.guest?.detach(); },
  });
}
