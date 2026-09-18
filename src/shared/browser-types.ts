/**
 * Contracts for the validation-only static Browser reader.
 *
 * This module is deliberately independent from Electron, authorization, and
 * the model runtime. A Browser result is external, untrusted observation data;
 * it is not a user message, a Memory record, or a permission decision.
 */

export const BROWSER_READ_LIMITS = Object.freeze({
  totalTimeoutMs: 15_000,
  maxRedirects: 3,
  maxResponseBytes: 2 * 1024 * 1024,
  maxResponseHeaderBytes: 16 * 1024,
  maxBodyCodePoints: 4_000,
  maxTitleCodePoints: 200,
  maxConcurrentReads: 1,
}) satisfies BrowserReadLimits;

export interface BrowserReadLimits {
  readonly totalTimeoutMs: number;
  readonly maxRedirects: number;
  readonly maxResponseBytes: number;
  readonly maxResponseHeaderBytes: number;
  readonly maxBodyCodePoints: number;
  readonly maxTitleCodePoints: number;
  readonly maxConcurrentReads: 1;
}

export type BrowserReadStatus =
  | "succeeded"
  | "blocked"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "unavailable";

export type BrowserReadReason =
  | "read_complete"
  | "invalid_url"
  | "credentials_not_allowed"
  | "protocol_not_allowed"
  | "port_not_allowed"
  | "non_public_target"
  | "proxy_target_hostname_not_allowed"
  | "proxy_endpoint_invalid"
  | "proxy_endpoint_dns_resolution_failed"
  | "proxy_endpoint_non_allowed"
  | "proxy_endpoint_target_mismatch"
  | "proxy_endpoint_connect_failed"
  | "proxy_auth_required"
  | "proxy_rejected"
  | "proxy_connect_rejected"
  | "dns_resolution_failed"
  | "dns_target_changed"
  | "connection_target_unbound"
  | "connection_target_mismatch"
  | "response_limit_unenforceable"
  | "response_headers_too_large"
  | "unsupported_content_encoding"
  | "unsupported_content_type"
  | "unsupported_charset"
  | "http_status_error"
  | "redirect_location_missing"
  | "tls_certificate_invalid"
  | "connect_failed"
  | "redirect_blocked"
  | "redirect_limit_exceeded"
  | "method_blocked"
  | "subresource_blocked"
  | "script_blocked"
  | "subframe_blocked"
  | "popup_blocked"
  | "download_blocked"
  | "permission_blocked"
  | "response_too_large"
  | "response_read_failed"
  | "empty_body"
  | "extraction_failed"
  | "timeout"
  | "cancelled"
  | "session_create_failed"
  | "load_failed"
  | "transport_unavailable"
  | "busy"
  | "backend_unavailable";

export type BrowserTransportMode = "direct" | "http_proxy";

/** Permission-selected Browser Origin policy used by the Sandbox contract. */
export type BrowserOriginAccess = "public" | "configured";

export interface BrowserProxyEndpoint {
  readonly protocol: "http:";
  readonly hostname: string;
  readonly port: number;
}

export interface BrowserResolvedProxyEndpoint {
  readonly endpoint: BrowserProxyEndpoint;
  readonly addresses: readonly string[];
}

export interface BrowserDirectResolvedTarget {
  readonly mode: "direct";
  readonly url: BrowserNormalizedUrl;
  readonly addresses: readonly string[];
}

export interface BrowserProxyResolvedTarget {
  readonly mode: "http_proxy";
  readonly url: BrowserNormalizedUrl;
  readonly proxyEndpoint: BrowserResolvedProxyEndpoint;
}

export type BrowserResolvedTarget = BrowserDirectResolvedTarget | BrowserProxyResolvedTarget;

export interface BrowserDirectConnectionEvidence {
  readonly mode: "direct";
  readonly selectedAddress: string;
  readonly connectedAddress: string;
  readonly matchesTarget: boolean;
}

export interface BrowserProxyTlsEvidence {
  readonly verified: true;
  readonly serverName: string;
}

export interface BrowserProxyConnectionEvidence {
  readonly mode: "http_proxy";
  readonly operation: "forward" | "connect";
  readonly proxyEndpoint: BrowserProxyEndpoint;
  readonly proxySelectedAddress: string;
  readonly proxyConnectedAddress: string;
  readonly proxyMatchesEndpoint: boolean;
  readonly targetAddress: "not_observed";
  readonly tls?: BrowserProxyTlsEvidence;
}

export type BrowserConnectionEvidence =
  | BrowserDirectConnectionEvidence
  | BrowserProxyConnectionEvidence;

export interface BrowserReadRequest {
  readonly requestUrl: string;
}

export interface BrowserNormalizedUrl {
  readonly href: string;
  readonly origin: string;
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly port: 80 | 443;
}

export interface BrowserReadResult {
  readonly status: BrowserReadStatus;
  readonly reason: BrowserReadReason;
  readonly requestUrl: string;
  readonly finalUrl?: string;
  readonly title?: string;
  readonly body?: string;
  readonly titleTruncated: boolean;
  readonly bodyTruncated: boolean;
  readonly redirectCount: number;
  readonly observedAt: number;
  readonly untrustedContent: true;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly connection?: BrowserConnectionEvidence;
}

export interface BrowserDnsResolver {
  lookup(hostname: string, signal?: AbortSignal): Promise<readonly string[]>;
}
