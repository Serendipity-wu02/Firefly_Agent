import * as http from "node:http";
import { isIP, type LookupFunction, type Socket } from "node:net";
import * as tls from "node:tls";
import { URL } from "node:url";

import type {
  BrowserConnectionEvidence,
  BrowserNormalizedUrl,
  BrowserProxyConnectionEvidence,
  BrowserProxyEndpoint,
  BrowserProxyResolvedTarget,
} from "../../shared/browser-types.js";
import { normalizeBrowserIpAddress } from "./browser-policy.js";
import {
  BrowserTransportError,
  getBrowserHeader,
  type BrowserResponseHeaders,
  type BrowserSingleHopRequest,
  type BrowserSingleHopResponse,
  type BrowserSingleHopTransport,
} from "./browser-transport.js";

export interface HttpProxyBrowserTransportOptions {
  /** Test-only CA injection for a locally controlled TLS server. */
  readonly caForTest?: string | Buffer;
}

function asResponseHeaders(headers: http.IncomingHttpHeaders): BrowserResponseHeaders {
  const result: Record<string, string | readonly string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") result[name.toLowerCase()] = value;
    else if (Array.isArray(value)) result[name.toLowerCase()] = [...value];
  }
  return result;
}

function headerByteLength(response: http.IncomingMessage): number {
  let size = Buffer.byteLength(`${response.httpVersion} ${response.statusCode ?? 0} ${response.statusMessage ?? ""}\r\n`);
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    size += Buffer.byteLength(response.rawHeaders[index] ?? "", "utf8") + 2;
    size += Buffer.byteLength(response.rawHeaders[index + 1] ?? "", "utf8") + 2;
  }
  return size + 2;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const value = error.code;
  return typeof value === "string" ? value : undefined;
}

function isCertificateError(error: unknown): boolean {
  const code = codeOf(error);
  return code === "ERR_TLS_CERT_ALTNAME_INVALID"
    || code === "DEPTH_ZERO_SELF_SIGNED_CERT"
    || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    || code === "CERT_HAS_EXPIRED"
    || code === "ERR_TLS_CERTIFICATE_REQUIRED";
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

function connectAuthority(url: BrowserNormalizedUrl): string {
  return `${hostHeader(url)}:${url.port}`;
}

function proxyEvidence(
  endpoint: BrowserProxyEndpoint,
  operation: BrowserProxyConnectionEvidence["operation"],
  selectedAddress: string,
  connectedAddress: string,
  matchesEndpoint: boolean,
  tlsEvidence?: BrowserProxyConnectionEvidence["tls"],
): BrowserProxyConnectionEvidence {
  return {
    mode: "http_proxy",
    operation,
    proxyEndpoint: endpoint,
    proxySelectedAddress: selectedAddress,
    proxyConnectedAddress: connectedAddress,
    proxyMatchesEndpoint: matchesEndpoint,
    targetAddress: "not_observed",
    ...(tlsEvidence ? { tls: tlsEvidence } : {}),
  };
}

function transportErrorFromResponse(
  input: BrowserSingleHopRequest,
  response: http.IncomingMessage,
  connection: BrowserConnectionEvidence,
): BrowserTransportError | undefined {
  const headers = asResponseHeaders(response.headers);
  if (headerByteLength(response) > input.maxResponseHeaderBytes) {
    return new BrowserTransportError(
      "response_headers_too_large",
      "The Browser proxy response headers exceeded the configured limit.",
      { statusCode: response.statusCode, headers, connection },
    );
  }
  return undefined;
}

async function collectResponse(
  input: BrowserSingleHopRequest,
  response: http.IncomingMessage,
  connection: BrowserConnectionEvidence,
): Promise<BrowserSingleHopResponse> {
  const headers = asResponseHeaders(response.headers);
  const headerError = transportErrorFromResponse(input, response, connection);
  if (headerError) {
    response.destroy();
    throw headerError;
  }

  const encoding = getBrowserHeader(headers, "content-encoding");
  if (encoding && encoding.trim().toLowerCase() !== "identity") {
    response.resume();
    throw new BrowserTransportError(
      "unsupported_content_encoding",
      "Compressed Browser responses are not supported by this backend.",
      { statusCode: response.statusCode, headers, connection },
    );
  }

  const contentLength = getBrowserHeader(headers, "content-length");
  if (contentLength !== undefined && /^\d+$/u.test(contentLength.trim())) {
    const length = Number(contentLength.trim());
    if (!Number.isSafeInteger(length) || length > input.remainingResponseBytes) {
      response.destroy();
      throw new BrowserTransportError(
        "response_too_large",
        "The Browser response Content-Length exceeded the remaining limit.",
        { statusCode: response.statusCode, headers, connection },
      );
    }
  }

  return await new Promise<BrowserSingleHopResponse>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const finish = (error?: BrowserTransportError): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks, received),
          connection,
        });
      }
    };

    response.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      received += buffer.byteLength;
      if (received > input.remainingResponseBytes) {
        response.destroy();
        finish(new BrowserTransportError(
          "response_too_large",
          "The Browser response exceeded the configured limit while streaming.",
          { statusCode: response.statusCode, headers, connection },
        ));
        return;
      }
      chunks.push(buffer);
    });
    response.once("end", () => finish());
    response.once("error", (error: unknown) => {
      if (input.signal.aborted) {
        finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
        return;
      }
      finish(new BrowserTransportError(
        "response_read_failed",
        error instanceof Error ? error.message : "The Browser response could not be read.",
        { statusCode: response.statusCode, headers, connection },
      ));
    });
  });
}

export class HttpProxyBrowserTransport implements BrowserSingleHopTransport {
  private readonly options: HttpProxyBrowserTransportOptions;
  private readonly activeCancels = new Set<() => void>();
  private readonly activePromises = new Set<Promise<void>>();
  private disposed = false;

  public constructor(options: HttpProxyBrowserTransportOptions = {}) {
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
    if (input.target.mode !== "http_proxy") {
      return Promise.reject(new BrowserTransportError(
        "transport_unavailable",
        "The HTTP proxy Browser transport cannot handle a direct target.",
      ));
    }

    const configuredSelectedAddress = input.target.proxyEndpoint.addresses[0];
    const selectedAddress = configuredSelectedAddress
      ? normalizeBrowserIpAddress(configuredSelectedAddress)
      : undefined;
    if (!selectedAddress) {
      return Promise.reject(new BrowserTransportError(
        "transport_unavailable",
        "The Browser proxy endpoint has no normalized address.",
      ));
    }
    return input.target.url.protocol === "http:"
      ? this.requestForward(input, input.target, selectedAddress)
      : this.requestConnect(input, input.target, selectedAddress);
  }

  private requestForward(
    input: BrowserSingleHopRequest,
    target: BrowserProxyResolvedTarget,
    selectedAddress: string,
  ): Promise<BrowserSingleHopResponse> {
    const endpoint = target.proxyEndpoint.endpoint;
    const requestOptions: http.RequestOptions = {
      protocol: "http:",
      hostname: selectedAddress,
      port: endpoint.port,
      path: target.url.href,
      method: "GET",
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "Accept-Encoding": "identity",
        Connection: "close",
        Host: hostHeader(target.url),
      },
      agent: false,
      maxHeaderSize: input.maxResponseHeaderBytes,
      lookup: ((
        _hostname,
        options,
        callback,
      ) => {
        const family = addressFamily(selectedAddress);
        if (options.all) callback(null, [{ address: selectedAddress, family }]);
        else callback(null, selectedAddress, family);
      }) satisfies LookupFunction,
      timeout: Math.max(1, input.remainingMs),
    };

    let cancelForActive: (() => void) | undefined;
    const promise = new Promise<BrowserSingleHopResponse>((resolve, reject) => {
      let request: http.ClientRequest | undefined;
      let response: http.IncomingMessage | undefined;
      let socket: Socket | undefined;
      let connection: BrowserProxyConnectionEvidence | undefined;
      let connected = false;
      let settled = false;

      const finish = (error?: BrowserTransportError, value?: BrowserSingleHopResponse): void => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        if (error) {
          response?.destroy();
          request?.destroy();
          socket?.destroy();
          reject(error);
        } else if (value) {
          resolve(value);
        }
      };

      const onAbort = (): void => finish(new BrowserTransportError("cancelled", "The Browser request was cancelled."));
      cancelForActive = onAbort;

      const verifyConnection = (): void => {
        const remote = socket?.remoteAddress;
        if (!remote || settled) return;
        const connectedAddress = normalizeBrowserIpAddress(remote);
        if (!connectedAddress) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The proxy socket did not expose a literal IP address.",
          ));
          return;
        }
        connected = true;
        connection = proxyEvidence(endpoint, "forward", selectedAddress, connectedAddress, connectedAddress === selectedAddress);
        if (!connection.proxyMatchesEndpoint) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The proxy socket connected to an address different from the validated endpoint.",
            { connection },
          ));
        }
      };

      const consumeResponse = (incoming: http.IncomingMessage): void => {
        response = incoming;
        verifyConnection();
        if (!connection || !connection.proxyMatchesEndpoint) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The proxy response has no matching endpoint evidence.",
            { connection },
          ));
          return;
        }
        const headers = asResponseHeaders(incoming.headers);
        if (incoming.statusCode === 407) {
          incoming.resume();
          finish(new BrowserTransportError(
            "proxy_auth_required",
            "The configured HTTP proxy requires authentication, which this backend does not provide.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }
        void collectResponse(input, incoming, connection).then(
          (value) => finish(undefined, value),
          (error: unknown) => finish(
            error instanceof BrowserTransportError
              ? error
              : new BrowserTransportError("response_read_failed", "The proxy response could not be read.", { connection }),
          ),
        );
      };

      const onRequestError = (error: unknown): void => {
        if (settled) return;
        if (input.signal.aborted) {
          finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
        } else if (codeOf(error) === "HPE_HEADER_OVERFLOW") {
          finish(new BrowserTransportError(
            "response_headers_too_large",
            "The Browser proxy response headers exceeded the configured limit.",
            { connection },
          ));
        } else if (connected) {
          finish(new BrowserTransportError(
            "proxy_rejected",
            error instanceof Error ? error.message : "The HTTP proxy rejected the request.",
            { connection },
          ));
        } else {
          finish(new BrowserTransportError(
            "proxy_endpoint_connect_failed",
            error instanceof Error ? error.message : "The Browser could not connect to the HTTP proxy.",
          ));
        }
      };

      input.signal.addEventListener("abort", onAbort, { once: true });
      try {
        request = http.request(requestOptions, consumeResponse);
        request.once("socket", (nextSocket) => {
          socket = nextSocket;
          nextSocket.once("connect", verifyConnection);
          verifyConnection();
        });
        request.once("timeout", () => finish(new BrowserTransportError("timeout", "The Browser proxy request timed out.", { connection })));
        request.once("error", onRequestError);
        request.end();
      } catch (error: unknown) {
        onRequestError(error);
      }
    });

    const tracked = promise.then(() => undefined, () => undefined);
    this.activePromises.add(tracked);
    if (cancelForActive) this.activeCancels.add(cancelForActive);
    const cleanup = (): void => {
      this.activePromises.delete(tracked);
      if (cancelForActive) this.activeCancels.delete(cancelForActive);
    };
    void promise.then(cleanup, cleanup);
    return promise;
  }

  private requestConnect(
    input: BrowserSingleHopRequest,
    target: BrowserProxyResolvedTarget,
    selectedAddress: string,
  ): Promise<BrowserSingleHopResponse> {
    const endpoint = target.proxyEndpoint.endpoint;
    const authority = connectAuthority(target.url);
    const requestOptions: http.RequestOptions = {
      protocol: "http:",
      hostname: selectedAddress,
      port: endpoint.port,
      method: "CONNECT",
      path: authority,
      headers: {
        Connection: "keep-alive",
        Host: authority,
      },
      agent: false,
      maxHeaderSize: input.maxResponseHeaderBytes,
      lookup: ((
        _hostname,
        options,
        callback,
      ) => {
        const family = addressFamily(selectedAddress);
        if (options.all) callback(null, [{ address: selectedAddress, family }]);
        else callback(null, selectedAddress, family);
      }) satisfies LookupFunction,
      timeout: Math.max(1, input.remainingMs),
    };

    let cancelForActive: (() => void) | undefined;
    const promise = new Promise<BrowserSingleHopResponse>((resolve, reject) => {
      let connectRequest: http.ClientRequest | undefined;
      let targetRequest: http.ClientRequest | undefined;
      let connectResponse: http.IncomingMessage | undefined;
      let targetResponse: http.IncomingMessage | undefined;
      let proxySocket: Socket | undefined;
      let tlsSocket: tls.TLSSocket | undefined;
      let targetAgent: http.Agent | undefined;
      let connection: BrowserProxyConnectionEvidence | undefined;
      let connected = false;
      let settled = false;
      let tlsEstablished = false;

      const finish = (error?: BrowserTransportError, value?: BrowserSingleHopResponse): void => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        if (error) {
          targetResponse?.destroy();
          connectResponse?.destroy();
          targetRequest?.destroy();
          connectRequest?.destroy();
          targetAgent?.destroy();
          tlsSocket?.destroy();
          proxySocket?.destroy();
          reject(error);
        } else if (value) {
          targetAgent?.destroy();
          resolve(value);
        }
      };

      const onAbort = (): void => finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
      cancelForActive = onAbort;

      const verifyProxySocket = (socket: Socket): void => {
        proxySocket = socket;
        const remote = socket.remoteAddress;
        if (!remote || settled) return;
        const connectedAddress = normalizeBrowserIpAddress(remote);
        if (!connectedAddress) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The proxy socket did not expose a literal IP address.",
          ));
          return;
        }
        connected = true;
        connection = proxyEvidence(endpoint, "connect", selectedAddress, connectedAddress, connectedAddress === selectedAddress);
        if (!connection.proxyMatchesEndpoint) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The proxy socket connected to an address different from the validated endpoint.",
            { connection },
          ));
        }
      };

      const startTls = (socket: Socket, head: Buffer): void => {
        if (settled) return;
        if (!connection || !connection.proxyMatchesEndpoint) {
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The CONNECT tunnel has no matching proxy endpoint evidence.",
            { connection },
          ));
          return;
        }
        const establishedProxyConnection = connection;
        if (head.byteLength > 0) socket.unshift(head);
        const serverName = target.url.hostname;
        try {
          tlsSocket = tls.connect({
            socket,
            checkServerIdentity: (_host, certificate) => tls.checkServerIdentity(serverName, certificate),
            servername: isIP(serverName) === 0 ? serverName : undefined,
            rejectUnauthorized: true,
            ca: this.options.caForTest,
            timeout: Math.max(1, input.remainingMs),
          });
          tlsSocket.once("secureConnect", () => {
            if (settled) return;
            if (!tlsSocket?.authorized) {
              finish(new BrowserTransportError(
                "tls_certificate_invalid",
                "The Browser target TLS certificate did not validate.",
                { connection },
              ));
              return;
            }
            tlsEstablished = true;
            connection = proxyEvidence(
              endpoint,
              "connect",
              selectedAddress,
              establishedProxyConnection.proxyConnectedAddress,
              true,
              { verified: true, serverName },
            );

            const tunneledConnection = tlsSocket;
            targetAgent = new http.Agent({ keepAlive: false });
            targetAgent.createConnection = () => tunneledConnection;
            const targetRequestOptions: http.RequestOptions = {
              protocol: "http:",
              hostname: target.url.hostname,
              port: target.url.port,
              path: requestPath(target.url),
              method: "GET",
              headers: {
                Accept: "text/html, text/plain;q=0.9",
                "Accept-Encoding": "identity",
                Connection: "close",
                Host: hostHeader(target.url),
              },
              agent: targetAgent,
              maxHeaderSize: input.maxResponseHeaderBytes,
              timeout: Math.max(1, input.remainingMs),
            };
            try {
              targetRequest = http.request(targetRequestOptions, (incoming) => {
                targetResponse = incoming;
                if (!connection) {
                  finish(new BrowserTransportError("proxy_endpoint_target_mismatch", "The tunneled response has no connection evidence."));
                  return;
                }
                void collectResponse(input, incoming, connection).then(
                  (value) => finish(undefined, value),
                  (error: unknown) => finish(
                    error instanceof BrowserTransportError
                      ? error
                      : new BrowserTransportError("response_read_failed", "The tunneled response could not be read.", { connection }),
                  ),
                );
              });
              targetRequest.once("timeout", () => finish(new BrowserTransportError("timeout", "The Browser target request timed out.", { connection })));
              targetRequest.once("error", (error: unknown) => {
                if (settled) return;
                if (input.signal.aborted) {
                  finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
                } else if (isCertificateError(error)) {
                  finish(new BrowserTransportError("tls_certificate_invalid", "The Browser target TLS certificate did not validate.", { connection }));
                } else {
                  finish(new BrowserTransportError(
                    "response_read_failed",
                    error instanceof Error ? error.message : "The tunneled response could not be read.",
                    { connection },
                  ));
                }
              });
              targetRequest.end();
            } catch (error: unknown) {
              finish(new BrowserTransportError(
                "response_read_failed",
                error instanceof Error ? error.message : "The tunneled request could not be sent.",
                { connection },
              ));
            }
          });
          tlsSocket.once("timeout", () => finish(new BrowserTransportError("timeout", "The Browser target TLS handshake timed out.", { connection })));
          tlsSocket.once("error", (error: unknown) => {
            if (settled) return;
            if (input.signal.aborted) {
              finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
            } else if (isCertificateError(error)) {
              finish(new BrowserTransportError("tls_certificate_invalid", "The Browser target TLS certificate did not validate.", { connection }));
            } else {
              finish(new BrowserTransportError(
                tlsEstablished ? "response_read_failed" : "proxy_connect_rejected",
                error instanceof Error ? error.message : "The Browser target TLS connection failed.",
                { connection },
              ));
            }
          });
        } catch (error: unknown) {
          finish(new BrowserTransportError(
            "proxy_connect_rejected",
            error instanceof Error ? error.message : "The Browser target TLS connection could not start.",
            { connection },
          ));
        }
      };

      const onConnect = (incoming: http.IncomingMessage, socket: Socket, head: Buffer): void => {
        connectResponse = incoming;
        verifyProxySocket(socket);
        if (settled) return;
        const headers = asResponseHeaders(incoming.headers);
        const headerError = transportErrorFromResponse(input, incoming, connection ?? proxyEvidence(endpoint, "connect", selectedAddress, selectedAddress, false));
        if (headerError) {
          incoming.resume();
          finish(headerError);
          return;
        }
        if (!connection || !connection.proxyMatchesEndpoint) {
          incoming.resume();
          finish(new BrowserTransportError(
            "proxy_endpoint_target_mismatch",
            "The CONNECT response has no matching proxy endpoint evidence.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }
        if (incoming.statusCode === 407) {
          incoming.resume();
          finish(new BrowserTransportError(
            "proxy_auth_required",
            "The configured HTTP proxy requires authentication, which this backend does not provide.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }
        if (incoming.statusCode !== 200) {
          incoming.resume();
          finish(new BrowserTransportError(
            "proxy_connect_rejected",
            "The HTTP proxy did not establish the CONNECT tunnel.",
            { statusCode: incoming.statusCode, headers, connection },
          ));
          return;
        }
        incoming.resume();
        startTls(socket, head);
      };

      const onRequestError = (error: unknown): void => {
        if (settled) return;
        if (input.signal.aborted) {
          finish(new BrowserTransportError("cancelled", "The Browser request was cancelled.", { connection }));
        } else if (codeOf(error) === "HPE_HEADER_OVERFLOW") {
          finish(new BrowserTransportError(
            "response_headers_too_large",
            "The Browser proxy CONNECT headers exceeded the configured limit.",
            { connection },
          ));
        } else if (connected) {
          finish(new BrowserTransportError(
            "proxy_rejected",
            error instanceof Error ? error.message : "The HTTP proxy rejected the CONNECT request.",
            { connection },
          ));
        } else {
          finish(new BrowserTransportError(
            "proxy_endpoint_connect_failed",
            error instanceof Error ? error.message : "The Browser could not connect to the HTTP proxy.",
          ));
        }
      };

      input.signal.addEventListener("abort", onAbort, { once: true });
      try {
        connectRequest = http.request(requestOptions);
        connectRequest.once("socket", (socket) => {
          verifyProxySocket(socket);
          socket.once("connect", () => verifyProxySocket(socket));
        });
        connectRequest.once("connect", onConnect);
        connectRequest.once("timeout", () => finish(new BrowserTransportError("timeout", "The Browser proxy CONNECT request timed out.", { connection })));
        connectRequest.once("error", onRequestError);
        connectRequest.end();
      } catch (error: unknown) {
        onRequestError(error);
      }
    });

    const tracked = promise.then(() => undefined, () => undefined);
    this.activePromises.add(tracked);
    if (cancelForActive) this.activeCancels.add(cancelForActive);
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
    for (const cancel of [...this.activeCancels]) cancel();
  }
}
