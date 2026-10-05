/** Presentation and manual commands only. Main keeps all owner, profile and gate authority. */
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export type BrowserNetworkFailure = "permission_denied" | "owner_mismatch" | "cancelled" | "closed" | "network_unavailable" | "cleanup_failed";
export type BrowserErrorCode = BrowserNetworkFailure | "blocked_url" | "load_failed";
export interface BrowserPageDto { browserId: string; conversationId: string; requestId: number; closed: boolean; loading: boolean; url: string; pendingUrl: string | null; canGoBack: boolean; canGoForward: boolean; error: BrowserErrorCode | null }
export type BrowserReply<T> = { ok: true; value: T } | { ok: false; code: BrowserErrorCode };
export type ManualBrowserCommand = { kind: "open"; url: string } | { kind: "navigate"; browserId: string; url: string } | { kind: "history"; browserId: string; action: "back" | "forward" | "reload" } | { kind: "layout"; browserId: string; bounds: BrowserBounds | null } | { kind: "close"; browserId: string };
export interface ManualBrowserApi {
  getAvailability(): Promise<import("./browser-availability").BrowserAvailability>;
  execute(command: ManualBrowserCommand): Promise<BrowserReply<BrowserPageDto | null>>;
  onChanged(listener: (page: BrowserPageDto) => void): () => void;
}
