/** Presentation and manual commands only. Main keeps all owner, profile and gate authority. */
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export type BrowserNetworkFailure = "permission_denied" | "owner_mismatch" | "cancelled" | "closed" | "network_unavailable" | "cleanup_failed";
export type BrowserErrorCode = BrowserNetworkFailure | "blocked_url" | "load_failed";
export interface BrowserPageDto { browserId: string; conversationId: string; requestId: number; closed: boolean; loading: boolean; url: string; pendingUrl: string | null; canGoBack: boolean; canGoForward: boolean; error: BrowserErrorCode | null }
export type BrowserReply<T> = { ok: true; value: T } | { ok: false; code: BrowserErrorCode };
export type ManualBrowserCommand = { kind: "get" } | { kind: "open"; url: string } | { kind: "navigate"; browserId: string; url: string } | { kind: "history"; browserId: string; action: "back" | "forward" | "reload" } | { kind: "layout"; browserId: string; bounds: BrowserBounds | null } | { kind: "close"; browserId: string };
export interface ManualBrowserApi {
  getPermission(): Promise<BrowserReply<BrowserPermissionDto>>;
  requestPermission(scope: BrowserPermissionScope): Promise<BrowserReply<BrowserPermissionDto>>;
  revokePermission(): Promise<BrowserReply<BrowserPermissionDto>>;
  getAvailability(): Promise<import("./browser-availability").BrowserAvailability>;
  execute(command: ManualBrowserCommand): Promise<BrowserReply<BrowserPageDto | null>>;
  onChanged(listener: (page: BrowserPageDto) => void): () => void;
}

export type BrowserAction = "navigate" | "observe" | "click" | "type";
export interface BrowserPermissionScope { readonly hosts: readonly string[]; readonly actions: readonly BrowserAction[] }
export interface BrowserPermissionDto {
  readonly conversationId: string;
  readonly status: "required" | "pending" | "granted" | "denied";
  readonly scope: BrowserPermissionScope;
  readonly requestId: string | null;
}
/** Exact public destinations shown by Main's native confirmation. No wildcard. */
export const BROWSER_PUBLIC_SCOPE: BrowserPermissionScope = Object.freeze({
  hosts: Object.freeze(["example.com", "github.com", "github.githubassets.com", "avatars.githubusercontent.com"]),
  actions: Object.freeze(["navigate", "observe", "click", "type"] as BrowserAction[]),
});

export interface BrowserObservation {
  readonly snapshotId: string; readonly url: string; readonly title: string; readonly text: string;
  readonly elements: readonly { ref: string; tag: string; role: string; name: string; value?: string; href?: string }[];
}
export type BrowserDomInput = { kind: "observe"; snapshotId: string; url: string; hosts?: readonly string[] }
  | { kind: "click" | "type"; snapshotId: string; url: string; ref: string; text?: string; hosts?: readonly string[] };
export type BrowserWorkspaceOperation = "open" | "navigate" | "back" | "forward" | "reload" | "observe" | "click" | "type" | "close";
export interface BrowserWorkspaceCommand { operation: BrowserWorkspaceOperation; browserId?: string; url?: string; snapshotId?: string; ref?: string; text?: string }
