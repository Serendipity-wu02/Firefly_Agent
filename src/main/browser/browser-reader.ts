import {
  BROWSER_READ_LIMITS,
  type BrowserConnectionEvidence,
  type BrowserDnsResolver,
  type BrowserProxyEndpoint,
  type BrowserReadLimits,
  type BrowserReadReason,
  type BrowserReadRequest,
  type BrowserReadResult,
  type BrowserResolvedProxyEndpoint,
  type BrowserResolvedTarget,
  type BrowserTransportMode,
} from "../../shared/browser-types.js";
import {
  BrowserPolicyResolutionError,
  normalizeBrowserIpAddress,
  resolveBrowserProxyEndpoint,
  resolveBrowserProxyRedirect,
  resolveBrowserProxyTarget,
  resolveBrowserRedirect,
  resolveBrowserTarget,
} from "./browser-policy.js";
import {
  BrowserContentExtractionError,
  extractStaticDocument,
  type BrowserDocumentExtraction,
} from "./browser-content.js";
import {
  BrowserTransportError,
  getBrowserHeader,
  type BrowserResponseHeaders,
  type BrowserSingleHopResponse,
  type BrowserSingleHopTransport,
} from "./browser-transport.js";

export interface BrowserContentExtractor {
  extract(html: string, signal: AbortSignal, remainingMs: number): Promise<BrowserDocumentExtraction>;
}

const defaultContentExtractor: BrowserContentExtractor = {
  extract: extractStaticDocument,
};

type Operation = {
  readonly controller: AbortController;
  readonly promise: Promise<BrowserReadResult>;
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const readFailureReasons = new Set<BrowserReadReason>([
  "invalid_url",
  "credentials_not_allowed",
  "protocol_not_allowed",
  "port_not_allowed",
  "non_public_target",
  "proxy_target_hostname_not_allowed",
  "proxy_endpoint_invalid",
  "proxy_endpoint_dns_resolution_failed",
  "proxy_endpoint_non_allowed",
  "proxy_endpoint_target_mismatch",
  "proxy_endpoint_connect_failed",
  "proxy_auth_required",
  "proxy_rejected",
  "proxy_connect_rejected",
  "dns_resolution_failed",
  "dns_target_changed",
  "connection_target_unbound",
  "connection_target_mismatch",
  "response_limit_unenforceable",
  "response_headers_too_large",
  "unsupported_content_encoding",
  "unsupported_content_type",
  "unsupported_charset",
  "http_status_error",
  "redirect_location_missing",
  "tls_certificate_invalid",
  "connect_failed",
  "redirect_blocked",
  "redirect_limit_exceeded",
  "method_blocked",
  "subresource_blocked",
  "script_blocked",
  "subframe_blocked",
  "popup_blocked",
  "download_blocked",
  "permission_blocked",
  "response_too_large",
  "response_read_failed",
  "empty_body",
  "extraction_failed",
  "timeout",
  "cancelled",
  "session_create_failed",
  "load_failed",
  "transport_unavailable",
  "busy",
  "backend_unavailable",
]);

function result(
  requestUrl: string,
  now: () => number,
  status: BrowserReadResult["status"],
  reason: BrowserReadReason,
  redirectCount: number,
  details: Partial<Pick<
    BrowserReadResult,
    "finalUrl" | "title" | "body" | "titleTruncated" | "bodyTruncated" | "httpStatus" | "contentType" | "connection"
  >> = {},
): BrowserReadResult {
  if (reason !== "read_complete" && !readFailureReasons.has(reason)) {
    throw new Error(`Unsupported Browser result reason: ${reason}`);
  }
  return {
    status,
    reason,
    requestUrl,
    titleTruncated: details.titleTruncated ?? false,
    bodyTruncated: details.bodyTruncated ?? false,
    redirectCount,
    observedAt: now(),
    untrustedContent: true,
    ...details,
  };
}

function truncateCodePoints(value: string, maxCodePoints: number): { value: string; truncated: boolean } {
  const codePoints = Array.from(value);
  return codePoints.length > maxCodePoints
    ? { value: codePoints.slice(0, maxCodePoints).join(""), truncated: true }
    : { value, truncated: false };
}

function responseDetails(response: Partial<BrowserSingleHopResponse>): Pick<BrowserReadResult, "httpStatus" | "contentType" | "connection"> {
  const contentType = response.headers ? getBrowserHeader(response.headers, "content-type") : undefined;
  return {
    httpStatus: response.statusCode,
    contentType,
    connection: response.connection,
  };
}

function transportErrorDetails(error: BrowserTransportError): Pick<BrowserReadResult, "httpStatus" | "contentType" | "connection"> {
  return responseDetails({
    statusCode: error.statusCode,
    headers: error.headers,
    connection: error.connection,
  });
}

function getCharset(contentType: string): string | undefined {
  const match = /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/iu.exec(contentType);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function decodeUtf8(body: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return undefined;
  }
}

function reasonFromTransport(error: BrowserTransportError, timedOut: boolean): BrowserReadReason {
  return timedOut && error.reason === "cancelled" ? "timeout" : error.reason;
}

function statusFromTransport(error: BrowserTransportError, timedOut: boolean): BrowserReadResult["status"] {
  if (timedOut && error.reason === "cancelled") return "timed_out";
  if (error.reason === "cancelled") return "cancelled";
  if (error.reason === "timeout") return "timed_out";
  return "failed";
}

class BrowserOperationAbortedError extends Error {
  public constructor() {
    super("The Browser operation was cancelled.");
    this.name = "BrowserOperationAbortedError";
  }
}

async function awaitAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new BrowserOperationAbortedError();
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    onAbort = () => reject(new BrowserOperationAbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  promise.catch(() => undefined);
  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function proxyEndpointMatches(
  expected: BrowserProxyEndpoint,
  actual: BrowserProxyEndpoint,
): boolean {
  return actual.protocol === expected.protocol
    && actual.hostname === expected.hostname
    && actual.port === expected.port;
}

function connectionMatchesTarget(
  target: BrowserResolvedTarget,
  connection: BrowserConnectionEvidence,
): boolean {
  if (target.mode === "direct") {
    if (connection.mode !== "direct") return false;
    const configuredSelectedAddress = target.addresses[0];
    const selectedAddress = configuredSelectedAddress
      ? normalizeBrowserIpAddress(configuredSelectedAddress)
      : undefined;
    const connectedAddress = normalizeBrowserIpAddress(connection.connectedAddress);
    return Boolean(selectedAddress)
      && connection.selectedAddress === selectedAddress
      && connectedAddress === selectedAddress
      && connection.matchesTarget;
  }

  if (connection.mode !== "http_proxy") return false;
  const configuredSelectedProxyAddress = target.proxyEndpoint.addresses[0];
  const selectedProxyAddress = configuredSelectedProxyAddress
    ? normalizeBrowserIpAddress(configuredSelectedProxyAddress)
    : undefined;
  const connectedProxyAddress = normalizeBrowserIpAddress(connection.proxyConnectedAddress);
  return Boolean(selectedProxyAddress)
    && connection.proxySelectedAddress === selectedProxyAddress
    && connectedProxyAddress === selectedProxyAddress
    && connection.proxyMatchesEndpoint
    && connection.targetAddress === "not_observed"
    && proxyEndpointMatches(target.proxyEndpoint.endpoint, connection.proxyEndpoint);
}

function connectionMismatchReason(target: BrowserResolvedTarget): BrowserReadReason {
  return target.mode === "direct" ? "connection_target_mismatch" : "proxy_endpoint_target_mismatch";
}

interface BrowserReadBackendCommonOptions {
  readonly dnsResolver: BrowserDnsResolver;
  readonly transport: BrowserSingleHopTransport;
  readonly extractor?: BrowserContentExtractor;
  readonly limits?: BrowserReadLimits;
  readonly now?: () => number;
}

export type BrowserReadBackendOptions = BrowserReadBackendCommonOptions & (
  | {
      readonly mode?: "direct";
      readonly proxyEndpoint?: never;
    }
  | {
      readonly mode: "http_proxy";
      readonly proxyEndpoint: BrowserProxyEndpoint;
    }
);

export class BrowserReadBackend {
  private readonly dnsResolver: BrowserDnsResolver;
  private readonly transport: BrowserSingleHopTransport;
  private readonly extractor: BrowserContentExtractor;
  private readonly limits: BrowserReadLimits;
  private readonly now: () => number;
  private readonly mode: BrowserTransportMode;
  private readonly proxyEndpoint: BrowserProxyEndpoint | undefined;
  private activeOperation: Operation | undefined;
  private disposed = false;
  private disposePromise: Promise<void> | undefined;

  public constructor(options: BrowserReadBackendOptions) {
    this.dnsResolver = options.dnsResolver;
    this.transport = options.transport;
    this.extractor = options.extractor ?? defaultContentExtractor;
    this.limits = options.limits ?? BROWSER_READ_LIMITS;
    this.now = options.now ?? (() => Date.now());
    this.mode = options.mode ?? "direct";
    this.proxyEndpoint = options.mode === "http_proxy" ? options.proxyEndpoint : undefined;
    if (this.mode === "http_proxy" && !this.proxyEndpoint) {
      throw new Error("HTTP proxy Browser backends require a proxy endpoint.");
    }
  }

  public async read(
    request: BrowserReadRequest,
    signal?: AbortSignal,
  ): Promise<BrowserReadResult> {
    if (this.disposed) return result(request.requestUrl, this.now, "unavailable", "backend_unavailable", 0);
    if (this.activeOperation) return result(request.requestUrl, this.now, "blocked", "busy", 0);

    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });

    const promise = this.execute(request, controller);
    this.activeOperation = { controller, promise };
    try {
      return await promise;
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      if (this.activeOperation?.promise === promise) this.activeOperation = undefined;
    }
  }

  public dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    const active = this.activeOperation;
    this.disposePromise = (async () => {
      active?.controller.abort();
      await active?.promise;
      await this.transport.dispose();
    })();
    return this.disposePromise;
  }

  private async execute(
    request: BrowserReadRequest,
    controller: AbortController,
  ): Promise<BrowserReadResult> {
    const deadline = Date.now() + this.limits.totalTimeoutMs;
    let timedOut = false;
    let redirectCount = 0;
    let totalResponseBytes = 0;
    let currentTarget: BrowserResolvedTarget | undefined;
    let proxyEndpoint: BrowserResolvedProxyEndpoint | undefined;
    let currentUrl: string | undefined;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.limits.totalTimeoutMs);

    try {
      if (controller.signal.aborted) return result(request.requestUrl, this.now, "cancelled", "cancelled", 0);

      let initialDecision;
      if (this.mode === "direct") {
        initialDecision = await resolveBrowserTarget(request.requestUrl, this.dnsResolver, controller.signal);
      } else {
        const configuredProxyEndpoint = this.proxyEndpoint;
        if (!configuredProxyEndpoint) {
          return result(request.requestUrl, this.now, "unavailable", "backend_unavailable", 0);
        }
        const endpointDecision = await resolveBrowserProxyEndpoint(
          configuredProxyEndpoint,
          this.dnsResolver,
          controller.signal,
        );
        if (!endpointDecision.allowed) return result(request.requestUrl, this.now, "blocked", endpointDecision.reason, 0);
        const resolvedProxyEndpoint = endpointDecision.endpoint;
        proxyEndpoint = resolvedProxyEndpoint;
        initialDecision = resolveBrowserProxyTarget(request.requestUrl, resolvedProxyEndpoint);
      }
      if (!initialDecision.allowed) return result(request.requestUrl, this.now, "blocked", initialDecision.reason, 0);
      if (controller.signal.aborted) return result(request.requestUrl, this.now, timedOut ? "timed_out" : "cancelled", timedOut ? "timeout" : "cancelled", 0);

      currentTarget = initialDecision.target;
      currentUrl = currentTarget.url.href;
      const initialUrl = currentTarget.url;

      while (true) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          timedOut = true;
          return result(request.requestUrl, this.now, "timed_out", "timeout", redirectCount);
        }
        if (controller.signal.aborted) {
          return result(
            request.requestUrl,
            this.now,
            timedOut ? "timed_out" : "cancelled",
            timedOut ? "timeout" : "cancelled",
            redirectCount,
          );
        }

        const response = await awaitAbortable(this.transport.request({
          target: currentTarget,
          signal: controller.signal,
          remainingMs,
          remainingResponseBytes: this.limits.maxResponseBytes - totalResponseBytes,
          maxResponseHeaderBytes: this.limits.maxResponseHeaderBytes,
        }), controller.signal);
        if (!connectionMatchesTarget(currentTarget, response.connection)) {
          return result(
            request.requestUrl,
            this.now,
            "failed",
            connectionMismatchReason(currentTarget),
            redirectCount,
            responseDetails(response),
          );
        }
        totalResponseBytes += response.body.byteLength;

        if (redirectStatuses.has(response.statusCode)) {
          if (redirectCount >= this.limits.maxRedirects) {
            return result(request.requestUrl, this.now, "blocked", "redirect_limit_exceeded", redirectCount, responseDetails(response));
          }
          const location = getBrowserHeader(response.headers, "location");
          if (!location) {
            return result(request.requestUrl, this.now, "blocked", "redirect_location_missing", redirectCount, responseDetails(response));
          }
          let nextDecision;
          if (currentTarget.mode === "direct") {
            nextDecision = await resolveBrowserRedirect(
              initialUrl,
              currentUrl,
              location,
              this.dnsResolver,
              controller.signal,
            );
          } else if (proxyEndpoint) {
            nextDecision = resolveBrowserProxyRedirect(
              initialUrl,
              currentUrl,
              location,
              proxyEndpoint,
            );
          } else {
            return result(request.requestUrl, this.now, "unavailable", "backend_unavailable", redirectCount, responseDetails(response));
          }
          redirectCount += 1;
          if (!nextDecision.allowed) {
            return result(request.requestUrl, this.now, "blocked", nextDecision.reason, redirectCount, responseDetails(response));
          }
          currentTarget = nextDecision.target;
          currentUrl = currentTarget.url.href;
          continue;
        }

        const details = responseDetails(response);
        const contentEncoding = getBrowserHeader(response.headers, "content-encoding");
        if (contentEncoding && contentEncoding.trim().toLowerCase() !== "identity") {
          return result(request.requestUrl, this.now, "failed", "unsupported_content_encoding", redirectCount, details);
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return result(request.requestUrl, this.now, "failed", "http_status_error", redirectCount, details);
        }

        const contentType = details.contentType;
        const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
        if (mediaType !== "text/html" && mediaType !== "text/plain" && mediaType !== "application/xhtml+xml") {
          return result(request.requestUrl, this.now, "failed", "unsupported_content_type", redirectCount, details);
        }
        const charset = contentType ? getCharset(contentType) : undefined;
        if (charset && charset.toLowerCase() !== "utf-8" && charset.toLowerCase() !== "utf8") {
          return result(request.requestUrl, this.now, "failed", "unsupported_charset", redirectCount, details);
        }

        const html = decodeUtf8(response.body);
        if (html === undefined) {
          return result(request.requestUrl, this.now, "failed", "unsupported_charset", redirectCount, details);
        }

        const extractionRemainingMs = deadline - Date.now();
        const extracted = await awaitAbortable(
          this.extractor.extract(html, controller.signal, extractionRemainingMs),
          controller.signal,
        );
        if (controller.signal.aborted) {
          return result(
            request.requestUrl,
            this.now,
            timedOut ? "timed_out" : "cancelled",
            timedOut ? "timeout" : "cancelled",
            redirectCount,
            details,
          );
        }
        if (extracted.body.trim().length === 0) {
          return result(request.requestUrl, this.now, "failed", "empty_body", redirectCount, details);
        }

        const title = truncateCodePoints(extracted.title, this.limits.maxTitleCodePoints);
        const body = truncateCodePoints(extracted.body, this.limits.maxBodyCodePoints);
        return result(request.requestUrl, this.now, "succeeded", "read_complete", redirectCount, {
          ...details,
          finalUrl: currentUrl,
          title: title.value,
          body: body.value,
          titleTruncated: title.truncated,
          bodyTruncated: body.truncated,
        });
      }
    } catch (error: unknown) {
      if (error instanceof BrowserPolicyResolutionError) {
        return result(
          request.requestUrl,
          this.now,
          timedOut ? "timed_out" : "cancelled",
          timedOut ? "timeout" : "cancelled",
          redirectCount,
        );
      }
      if (error instanceof BrowserContentExtractionError) {
        if (error.reason === "cancelled") return result(request.requestUrl, this.now, "cancelled", "cancelled", redirectCount);
        if (error.reason === "timeout") return result(request.requestUrl, this.now, "timed_out", "timeout", redirectCount);
        return result(request.requestUrl, this.now, "failed", "extraction_failed", redirectCount);
      }
      if (error instanceof BrowserOperationAbortedError) {
        return result(
          request.requestUrl,
          this.now,
          timedOut ? "timed_out" : "cancelled",
          timedOut ? "timeout" : "cancelled",
          redirectCount,
        );
      }
      if (error instanceof BrowserTransportError) {
        return result(
          request.requestUrl,
          this.now,
           statusFromTransport(error, timedOut),
           reasonFromTransport(error, timedOut),
          redirectCount,
          transportErrorDetails(error),
        );
      }
      if (controller.signal.aborted) {
        return result(
          request.requestUrl,
          this.now,
          timedOut ? "timed_out" : "cancelled",
          timedOut ? "timeout" : "cancelled",
          redirectCount,
        );
      }
      return result(request.requestUrl, this.now, "failed", "load_failed", redirectCount);
    } finally {
      clearTimeout(timeoutHandle);
      if (controller.signal.aborted) this.transport.cancel();
    }
  }
}
