import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { isPublicNetworkAddress, parseConnectAuthority } from "./public-network-target";
import type { BrowserRequestDetails } from "./browser-request-policy";

export interface BrowserDomainContext {
  readonly owner: object;
  readonly profile: object;
  readonly conversationId: string;
  readonly browserId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}
export interface BrowserDomainPolicy { readonly hosts?: readonly string[] }
export interface BrowserDomainContents<S extends object> {
  readonly id: number;
  readonly session: S;
  isDestroyed(): boolean;
}
export interface BrowserAuthorizationDomain<S extends object> {
  readonly epoch: Readonly<{
    id: string; session: S; context: BrowserDomainContext;
    policy: Readonly<{ hosts?: readonly string[]; methods: readonly string[]; resources: readonly string[] }>;
  }>;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  isActive(): boolean;
  activate(): boolean;
  revoke(): void;
  registerContents(contents: BrowserDomainContents<S>): boolean;
  ownsContents(contents: BrowserDomainContents<S> | undefined): boolean;
  allows(details: BrowserRequestDetails): boolean;
}
export interface BrowserAuthorizationDomainRegistry<S extends object> {
  canPrepare(context: BrowserDomainContext, policy?: BrowserDomainPolicy): boolean;
  hasSeenSession(session: S): boolean;
  /** Permanently consume an owned fresh allocation even if preparation was cancelled. */
  retireSession(session: S): void;
  create(context: BrowserDomainContext, session: S, policy?: BrowserDomainPolicy): BrowserAuthorizationDomain<S> | null;
  revokeAll(): void;
}
const methods = Object.freeze(["GET", "HEAD"]);
const resources = Object.freeze(["mainFrame", "subFrame", "stylesheet", "script", "image", "font", "media", "xhr"]);
function target(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return null;
    const authority = parseConnectAuthority(`${parsed.hostname}:443`);
    if (!authority || (isIP(authority.host) && !isPublicNetworkAddress(authority.host))) return null;
    return authority.host;
  } catch { return null; }
}
function snapshotPolicy(policy?: BrowserDomainPolicy): BrowserAuthorizationDomain<object>["epoch"]["policy"] | null {
  const hosts: string[] = [];
  if (policy?.hosts !== undefined) {
    for (const host of policy.hosts) {
      const authority = parseConnectAuthority(`${host}:443`);
      if (!authority || (isIP(authority.host) && !isPublicNetworkAddress(authority.host))) return null;
      hosts.push(authority.host);
    }
  }
  return Object.freeze({ methods, resources, ...(policy?.hosts === undefined ? {} : { hosts: Object.freeze(hosts) }) });
}

/** Main-only registry. Object identities and the trusted owner callback are its authority. */
export function createBrowserAuthorizationDomainRegistry<S extends object>(options: {
  isOwnerCurrent(context: BrowserDomainContext): boolean;
  gateOpen?: boolean;
  isContextAuthorized?(context: BrowserDomainContext): boolean;
}): BrowserAuthorizationDomainRegistry<S> {
  const gateOpen = options.gateOpen === true;
  const verifyOwner = options.isOwnerCurrent;
  const seen = new WeakSet<S>();
  const live = new Set<BrowserAuthorizationDomain<S>>();
  function ownerCurrent(context: BrowserDomainContext): boolean {
    try {
      return (gateOpen || options.isContextAuthorized?.(context) === true) && !context.signal.aborted && Number.isSafeInteger(context.generation) && context.generation >= 0
        && !!context.conversationId && !!context.browserId && verifyOwner(context) === true;
    } catch { return false; }
  }
  function canPrepare(context: BrowserDomainContext, policy?: BrowserDomainPolicy): boolean {
    return ownerCurrent(context) && snapshotPolicy(policy) !== null;
  }
  function create(context: BrowserDomainContext, session: S, policy?: BrowserDomainPolicy): BrowserAuthorizationDomain<S> | null {
    const copiedPolicy = snapshotPolicy(policy);
    if (!ownerCurrent(context) || !copiedPolicy || seen.has(session)) return null;
    seen.add(session);
    const copiedContext = Object.freeze({ ...context });
    const epoch = Object.freeze({ id: randomUUID(), session, context: copiedContext, policy: copiedPolicy });
    const cancellation = new AbortController();
    let revoked = false, active = false;
    let primary: BrowserDomainContents<S> | undefined;
    let primaryId: number | undefined;
    function revoke(): void {
      if (revoked) return;
      revoked = true; active = false;
      copiedContext.signal.removeEventListener("abort", revoke);
      live.delete(domain);
      cancellation.abort();
    }
    function nativeCurrent(): boolean {
      try { return !primary || (primary.session === session && primary.id === primaryId && !primary.isDestroyed()); }
      catch { return false; }
    }
    function isCurrent(): boolean {
      if (!revoked && (!ownerCurrent(copiedContext) || !nativeCurrent())) revoke();
      return !revoked;
    }
    function ownsContents(contents: BrowserDomainContents<S> | undefined): boolean {
      return isCurrent() && primary !== undefined && contents === primary;
    }
    const domain: BrowserAuthorizationDomain<S> = Object.freeze({
      epoch, signal: cancellation.signal, isCurrent,
      isActive: () => isCurrent() && active,
      activate: () => { if (!isCurrent() || !primary) return false; active = true; return true; },
      revoke,
      registerContents(contents: BrowserDomainContents<S>): boolean {
        if (!isCurrent()) return false;
        if (primary) return ownsContents(contents);
        try {
          if (contents.session !== session || !Number.isSafeInteger(contents.id) || contents.id <= 0 || contents.isDestroyed()) return false;
          primary = contents; primaryId = contents.id; return true;
        } catch { return false; }
      },
      ownsContents,
      allows(details: BrowserRequestDetails): boolean {
        if (!isCurrent() || !active || !methods.includes(details.method) || !resources.includes(details.resourceType)) return false;
        if (details.webContentsId !== undefined && details.webContentsId !== primaryId) return false;
        const host = target(details.url);
        return host !== null && (copiedPolicy.hosts === undefined || copiedPolicy.hosts.includes(host));
      },
    });
    live.add(domain);
    copiedContext.signal.addEventListener("abort", revoke, { once: true });
    if (copiedContext.signal.aborted) revoke();
    return domain;
  }
  return Object.freeze({ canPrepare, create, hasSeenSession: (session: S) => seen.has(session), retireSession: (session: S) => { seen.add(session); }, revokeAll: () => { for (const domain of live) domain.revoke(); } });
}
