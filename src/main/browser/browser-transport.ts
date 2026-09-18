import * as http from "node:http";
import { isIP, type LookupFunction, type Socket } from "node:net";
import * as https from "node:https";
import { TLSSocket } from "node:tls";
import { URL } from "node:url";

import type {
  BrowserConnectionEvidence,
  BrowserDirectResolvedTarget,
  BrowserNormalizedUrl,
  BrowserResolvedTarget,
} from "../../shared/browser-types.js";
import { normalizeBrowserIpAddress } from "./browser-policy.js";

export type BrowserHeaderValue = string | readonly string[];
export type BrowserResponseHeaders = Readonly<Record<string, BrowserHeaderValue>>;

export interface BrowserSingleHopRequest {
  readonly target: BrowserResolvedTarget;
  readonly signal: AbortSignal;
  readonly remainingMs: number;
  readonly remainingResponseBytes: number;
  readonly maxResponseHeaderBytes: number;
}

export interface BrowserSingleHopResponse {
  readonly statusCode: number;
  readonly headers: BrowserResponseHeaders;
  readonly body: Uint8Array;
  readonly connection: BrowserConnectionEvidence;
}

export type BrowserTransportErrorReason =
  | "response_too_large"
  | "response_headers_too_large"
  | "unsupported_content_encoding"
  | "connection_target_mismatch"
  | "proxy_endpoint_target_mismatch"
  | "proxy_endpoint_connect_failed"
  | "proxy_auth_required"
  | "proxy_rejected"
  | "proxy_connect_rejected"
  | "tls_certificate_invalid"
  | "cancelled"
  | "timeout"
  | "connect_failed"
  | "response_read_failed"
  | "transport_unavailable";

export class BrowserTransportError extends Error {
  public readonly reason: BrowserTransportErrorReason;
  public readonly statusCode?: number;
  public readonly headers?: BrowserResponseHeaders;
  public readonly connection?: BrowserConnectionEvidence;

  public constructor(
    reason: BrowserTransportErrorReason,
    message: string,
    details: {
      readonly statusCode?: number;
      readonly headers?: BrowserResponseHeaders;
      readonly connection?: BrowserConnectionEvidence;
    } = {},
  ) {
    super(message);
    this.name = "BrowserTransportError";
    this.reason = reason;
    this.statusCode = details.statusCode;
    this.headers = details.headers;
    this.connection = details.connection;
  }
}

export interface BrowserSingleHopTransport {
  request(input: BrowserSingleHopRequest): Promise<BrowserSingleHopResponse>;
  cancel(): void;
  dispose(): Promise<void>;
}

/** Test-only endpoint remapping. Production uses the selected target address. */
export interface BrowserTransportEndpoint {
  readonly port: number;
}

export interface NodeBrowserTransportOptions {
  readonly endpointForTest?: (
    target: BrowserDirectResolvedTarget,
    selectedAddress: string,
  ) => BrowserTransportEndpoint;
  readonly caForTest?: string | Buffer;
  readonly onLookupForTest?: () => void;
}

export function getBrowserHeader(
  headers: BrowserResponseHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (typeof value === "string") return value;
  return value?.[0];
}

function asResponseHeaders(headers: http.IncomingHttpHeaders): BrowserResponseHeaders {
  const result: Record<string, BrowserHeaderValue> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") result[name.toLowerCase()] = value;
    else if (Array.isArray(value)) result[name.toLowerCase()] = [...value];
  }
  return result;
}

function headerByteLength(response: http.IncomingMessage): number {
  let size = Buffer.byteLength(`${response.httpVersion} ${response.statusCode ?? 0} ${response.statusMessage ?? ""}\r\n`);
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    size += Buffer.byteLength(response.rawHeaders[index] ?? "", "utf8");
    size += 2;
    size += Buffer.byteLength(response.rawHeaders[index + 1] ?? "", "utf8");
    size += 2;
  }
  return size + 2;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const value = error.code;
  return typeof value === "string" ? value : undefined;
}

function hostHeader(url: BrowserNormalizedUrl): string {
  return isIP(url.hostname) === 6 ? `[${url.hostname}]` : url.hostname;
}

function requestPath(url: BrowserNormalizedUrl): string {
  const parsed = new URL(url.href);
  return `${parsed.pathname || "/"}${parsed.search}`;
}

function addressFamily(address: string): 4 | 6 {
  const version = isIP(address);
  if (version === 4 || version === 6) return version;
  throw new BrowserTransportError("transport_unavailable", "The Browser address is not a literal IP address.");
}

function selectedAddress(target: BrowserDirectResolvedTarget): string {
  const selected = target.addresses[0];
  if (!selected) throw new BrowserTransportError("transport_unavailable", "The Browser target has no validated address.");
  const normalized = normalizeBrowserIpAddress(selected);
  if (!normalized) throw new BrowserTransportError("transport_unavailable", "The Browser target address is not a literal IP address.");
  return normalized;
}

function errorForRequest(error: unknown, signal: AbortSignal): BrowserTransportError {
  if (signal.aborted) return new BrowserTransportError("cancelled", "The Browser request was cancelled.");
  const code = codeOf(error);
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return new BrowserTransportError("tls_certificate_invalid", "The Browser TLS certificate did not validate.");
  }
  if (code === "HPE_HEADER_OVERFLOW") {
    return new BrowserTransportError("response_headers_too_large", "The Browser response headers exceeded the configured limit.");
  }
  return new BrowserTransportError("connect_failed", error instanceof Error ? error.message : "The Browser connection failed.");
}

export class NodeBrowserTransport implements BrowserSingleHopTransport {
  private readonly options: NodeBrowserTransportOptions;
  private readonly activeCancels = new Set<() => void>();
  private readonly activePromises = new Set<Promise<void>>();
  private disposed = false;

  public constructor(options: NodeBrowserTransportOptions = {}) {
    this.options = options;
  }

  public request(input: BrowserSingleHopRequest): Promise<BrowserSingleHopResponse> {
    if (this.disposed) {
      return Promise.reject(new BrowserTransportError("transport_unavailable", "The Browser transport is disposed."));
    }
    if (input.signal.aborted) {
      return Promise.reject(new BrowserTransportError("cancelled", "The Browser request was cancelled."));
    }
    if (input.remainingMs <= 0 || input.remainingResponseBytes < 0) {
      return Promise.reject(new BrowserTransportError("timeout", "The Browser request budget is exhausted."));
    }
    if (input.target.mode !== "direct") {
      return Promise.reject(new BrowserTransportError(
        "transport_unavailable",
        "The direct Browser transport cannot handle an HTTP proxy target.",
      ));
    }

    const selected = selectedAddress(input.target);
    const endpoint = this.options.endpointForTest?.(input.target, selected);
    const url = input.target.url;
    const requestOptions: http.RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: endpoint?.port ?? url.port,
      path: requestPath(url),
      method: "GET",
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "Accept-Encoding": "identity",
        Connection: "close",
        Host: hostHeader(url),
      },
      agent: false,
      maxHeaderSize: input.maxResponseHeaderBytes,
      lookup: ((
        _hostname,
        options,
        callback,
      ) => {
        this.options.onLookupForTest?.();
        const family = addressFamily(selected);
        if (options.all) callback(null, [{ address: selected, family }]);
        else callback(null, selected, family);
      }) satisfies LookupFunction,
      timeout: Math.max(1, input.remainingMs),
    };

    let cancelForActive: (() => void) | undefined;
    const promise = new Promise<BrowserSingleHopResponse>((resolve, reject) => {
      let request: http.ClientRequest | undefined;
      let response: http.IncomingMessage | undefined;
      let socket: Socket | undefined;
      let connection: BrowserConnectionEvidence | undefined;
      let settled = false;
      let responseLimitExceeded = false;

      const finish = (error?: BrowserTransportError, value?: BrowserSingleHopResponse): void => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        if (error) {
          response?.destroy();
          request?.destroy();
          reject(error);
        } else if (value) {
          resolve(value);
        }
      };

      const onAbort = (): void => {
        finish(new BrowserTransportError("cancelled", "The Browser request was cancelled."));
      };
      cancelForActive = onAbort;

      const verifyConnection = (): void => {
        const remote = socket?.remoteAddress;
        if (!remote) return;
        const connectedAddress = normalizeBrowserIpAddress(remote);
        if (!connectedAddress) {
          finish(new BrowserTransportError("connection_target_mismatch", "The connected address is not a literal IP address."));
          return;
        }
        connection = {
          mode: "direct",
          selectedAddress: selected,
          connectedAddress,
          matchesTarget: connectedAddress === selected,
        };
        if (!connection.matchesTarget) {
          finish(new BrowserTransportError(
            "connection_target_mismatch",
            "The socket connected to an address different from the validated target.",
            { connection },
          ));
        }
      };

      const consumeResponse = (incoming: http.IncomingMessage): void => {
        response = incoming;
        const headers = asResponseHeaders(incoming.headers);
        if (!connection) verifyConnection();
        if (!connection || connection.mode !== "direct" || !connection.matchesTarget) {
          finish(new BrowserTransportError("connection_target_mismatch", "The response has no matching connection evidence.", { connection }));
          return;
        }

        if (headerByteLength(incoming) > input.maxResponseHeaderBytes) {
          finish(new BrowserTransportError(
            "response_headers_too_large",
            "The Browser response headers exceeded the configured limit.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }

        const encoding = getBrowserHeader(headers, "content-encoding");
        if (encoding && encoding.trim().toLowerCase() !== "identity") {
          finish(new BrowserTransportError(
            "unsupported_content_encoding",
            "Compressed Browser responses are not supported by this backend.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }

        const contentLength = getBrowserHeader(headers, "content-length");
        if (contentLength !== undefined && /^\d+$/.test(contentLength.trim())) {
          const length = Number(contentLength.trim());
          if (!Number.isSafeInteger(length) || length > input.remainingResponseBytes) {
            finish(new BrowserTransportError(
              "response_too_large",
              "The Browser response Content-Length exceeded the remaining limit.",
              { statusCode: incoming.statusCode, headers, connection },
            ));
            return;
          }
        }

        const chunks: Buffer[] = [];
        let received = 0;
        incoming.on("data", (chunk: Buffer | string) => {
          if (settled) return;
          const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
          received += buffer.byteLength;
          if (received > input.remainingResponseBytes) {
            responseLimitExceeded = true;
            incoming.destroy();
            finish(new BrowserTransportError(
              "response_too_large",
              "The Browser response exceeded the configured limit while streaming.",
              { statusCode: incoming.statusCode, headers, connection },
            ));
            return;
          }
          chunks.push(buffer);
        });
        incoming.once("end", () => {
          if (responseLimitExceeded || settled) return;
          if (!connection) {
            finish(new BrowserTransportError("connection_target_mismatch", "The response has no connection evidence."));
            return;
          }
          finish(undefined, {
            statusCode: incoming.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks, received),
            connection,
          });
        });
        incoming.once("error", (error) => {
          if (responseLimitExceeded || settled) return;
          finish(new BrowserTransportError(
            "response_read_failed",
            error instanceof Error ? error.message : "The Browser response could not be read.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
        });
      };

      const onRequestError = (error: unknown): void => {
        if (settled) return;
        finish(errorForRequest(error, input.signal));
      };

      input.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const onSocket = (nextSocket: Socket): void => {
          socket = nextSocket;
          nextSocket.once("connect", verifyConnection);
          if (nextSocket instanceof TLSSocket) nextSocket.once("secureConnect", verifyConnection);
        };
        if (url.protocol === "https:") {
          request = https.request({
            ...requestOptions,
            rejectUnauthorized: true,
            servername: isIP(url.hostname) === 0 ? url.hostname : undefined,
            ca: this.options.caForTest,
          }, consumeResponse);
        } else {
          request = http.request(requestOptions, consumeResponse);
        }
        this.activeCancels.add(onAbort);
        request.once("socket", onSocket);
        request.once("timeout", () => finish(new BrowserTransportError("timeout", "The Browser request timed out.")));
        request.once("error", onRequestError);
        request.end();
      } catch (error: unknown) {
        finish(errorForRequest(error, input.signal));
      }
    });

    const tracked = promise.then(() => undefined, () => undefined);
    this.activePromises.add(tracked);
    const cleanup = (): void => {
      this.activePromises.delete(tracked);
      if (cancelForActive) this.activeCancels.delete(cancelForActive);
    };
    void promise.then(cleanup, cleanup);
    return promise;
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    const pending = Promise.allSettled([...this.activePromises]);
    await Promise.race([
      pending,
      new Promise<void>((resolve) => setTimeout(resolve, 250)),
    ]);
    this.activeCancels.clear();
    this.activePromises.clear();
  }

  public cancel(): void {
    for (const cancel of this.activeCancels) cancel();
  }
}
