import { isIP } from "node:net";
import { URL } from "node:url";

import type {
  BrowserProxyEndpoint,
  BrowserResolvedProxyEndpoint,
  BrowserDnsResolver,
  BrowserNormalizedUrl,
  BrowserReadReason,
  BrowserResolvedTarget,
} from "../../shared/browser-types.js";

export type BrowserPolicyDecision =
  | {
      readonly allowed: true;
      readonly target: BrowserResolvedTarget;
    }
  | {
      readonly allowed: false;
      readonly reason: Exclude<BrowserReadReason, "read_complete">;
      readonly message: string;
      readonly normalizedUrl?: BrowserNormalizedUrl;
    };

export type BrowserProxyEndpointDecision =
  | {
      readonly allowed: true;
      readonly endpoint: BrowserProxyEndpoint;
    }
  | {
      readonly allowed: false;
      readonly reason: Exclude<BrowserReadReason, "read_complete">;
      readonly message: string;
    };

export type BrowserProxyEndpointResolutionDecision =
  | {
      readonly allowed: true;
      readonly endpoint: BrowserResolvedProxyEndpoint;
    }
  | {
      readonly allowed: false;
      readonly reason: Exclude<BrowserReadReason, "read_complete">;
      readonly message: string;
    };

export type BrowserOriginDecision =
  | { readonly allowed: true; readonly origin: string }
  | {
      readonly allowed: false;
      readonly reason: Exclude<BrowserReadReason, "read_complete">;
      readonly message: string;
    };

export class BrowserPolicyResolutionError extends Error {
  public readonly reason = "cancelled" as const;

  public constructor() {
    super("Browser DNS resolution was cancelled.");
    this.name = "BrowserPolicyResolutionError";
  }
}

type AddressBytes = readonly number[];
type Cidr = { readonly network: AddressBytes; readonly bits: number };

function denied(
  reason: Exclude<BrowserReadReason, "read_complete">,
  message: string,
  normalizedUrl?: BrowserNormalizedUrl,
): BrowserPolicyDecision {
  return { allowed: false, reason, message, normalizedUrl };
}

function parseIpv4(value: string): AddressBytes | undefined {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return undefined;
  const octets = parts.map((part) => Number(part));
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : undefined;
}

function parseIpv6(value: string): AddressBytes | undefined {
  if (value.includes("%")) return undefined;
  const separatorCount = value.match(/::/g)?.length ?? 0;
  if (separatorCount > 1) return undefined;

  const [leftText, rightText] = value.split("::");
  const hasCompression = separatorCount === 1;
  const parseGroups = (text: string | undefined): number[] | undefined => {
    if (!text) return [];
    const groups: number[] = [];
    for (const part of text.split(":")) {
      if (part.includes(".")) {
        const octets = parseIpv4(part);
        if (!octets || groups.length > 6) return undefined;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return undefined;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };

  const left = parseGroups(hasCompression ? leftText : value);
  const right = hasCompression ? parseGroups(rightText) : [];
  if (!left || !right) return undefined;
  const missing = 8 - left.length - right.length;
  if (hasCompression ? missing < 1 : missing !== 0) return undefined;
  const groups = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (groups.length !== 8) return undefined;

  const bytes: number[] = [];
  for (const group of groups) bytes.push(group >> 8, group & 0xff);
  return bytes;
}

function cidr4(network: string, bits: number): Cidr {
  const parsed = parseIpv4(network);
  if (!parsed) throw new Error(`Invalid IPv4 CIDR network: ${network}`);
  return { network: parsed, bits };
}

function cidr6(network: string, bits: number): Cidr {
  const parsed = parseIpv6(network);
  if (!parsed) throw new Error(`Invalid IPv6 CIDR network: ${network}`);
  return { network: parsed, bits };
}

function matchesCidr(bytes: AddressBytes, range: Cidr): boolean {
  const wholeBytes = Math.floor(range.bits / 8);
  for (let index = 0; index < wholeBytes; index += 1) {
    if (bytes[index] !== range.network[index]) return false;
  }
  const remainingBits = range.bits % 8;
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits);
  return (bytes[wholeBytes] & mask) === (range.network[wholeBytes] & mask);
}

// Conservative IANA special-purpose IPv4 ranges used by this backend.
const IPV4_SPECIAL_RANGES: readonly Cidr[] = [
  cidr4("0.0.0.0", 8),
  cidr4("10.0.0.0", 8),
  cidr4("100.64.0.0", 10),
  cidr4("127.0.0.0", 8),
  cidr4("169.254.0.0", 16),
  cidr4("172.16.0.0", 12),
  cidr4("192.0.0.0", 24),
  cidr4("192.0.2.0", 24),
  cidr4("192.31.196.0", 24),
  cidr4("192.52.193.0", 24),
  cidr4("192.88.99.0", 24),
  cidr4("192.168.0.0", 16),
  cidr4("192.175.48.0", 24),
  cidr4("198.18.0.0", 15),
  cidr4("198.51.100.0", 24),
  cidr4("203.0.113.0", 24),
  cidr4("224.0.0.0", 4),
  cidr4("240.0.0.0", 4),
];

// Mapped IPv6 addresses inherit the IPv4 decision. Other conversion,
// transition, tunnel, local, multicast, and special-purpose ranges are
// refused conservatively.
const IPV6_SPECIAL_RANGES: readonly Cidr[] = [
  cidr6("::", 96),
  cidr6("64:ff9b::", 96),
  cidr6("64:ff9b:1::", 48),
  cidr6("100::", 64),
  cidr6("100:0:0:1::", 64),
  cidr6("2001:1::", 32),
  cidr6("2001:2::", 48),
  cidr6("2001:3::", 32),
  cidr6("2001:4:112::", 48),
  cidr6("2001:10::", 28),
  cidr6("2001:20::", 28),
  cidr6("2001:30::", 28),
  cidr6("2001:db8::", 32),
  cidr6("2002::", 16),
  cidr6("2620:4f:8000::", 48),
  cidr6("3fff::", 20),
  cidr6("5f00::", 16),
  cidr6("fc00::", 7),
  cidr6("fe80::", 10),
  cidr6("ff00::", 8),
];

const IPV4_PROXY_LOCAL_RANGES: readonly Cidr[] = [
  cidr4("10.0.0.0", 8),
  cidr4("127.0.0.0", 8),
  cidr4("172.16.0.0", 12),
  cidr4("192.168.0.0", 16),
];

const IPV6_PROXY_LOCAL_RANGES: readonly Cidr[] = [
  cidr6("::1", 128),
  cidr6("fc00::", 7),
];

function isMappedIpv6(bytes: AddressBytes): boolean {
  return bytes.slice(0, 10).every((byte) => byte === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
}

function isDisallowedIpv4Bytes(bytes: AddressBytes): boolean {
  return IPV4_SPECIAL_RANGES.some((range) => matchesCidr(bytes, range));
}

function formatIpv6(bytes: AddressBytes): string {
  const groups: number[] = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push((bytes[index] << 8) | bytes[index + 1]);
  }

  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < groups.length;) {
    if (groups[start] !== 0) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < groups.length && groups[end] === 0) end += 1;
    if (end - start > bestLength && end - start >= 2) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }

  const formatted: string[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    if (index === bestStart) {
      formatted.push("");
      index += bestLength - 1;
      continue;
    }
    formatted.push(groups[index].toString(16));
  }
  const value = formatted.join(":");
  return value.startsWith(":") ? `:${value}` : value;
}

export function normalizeBrowserIpAddress(address: string): string | undefined {
  const normalized = address.trim().replace(/^\[|\]$/g, "");
  const version = isIP(normalized);
  if (version === 4) {
    const bytes = parseIpv4(normalized);
    return bytes ? bytes.join(".") : undefined;
  }
  if (version !== 6) return undefined;
  const bytes = parseIpv6(normalized);
  if (!bytes) return undefined;
  if (isMappedIpv6(bytes)) return bytes.slice(12).join(".");
  return formatIpv6(bytes);
}

function isDisallowedIpv6Bytes(bytes: AddressBytes): boolean {
  if (isMappedIpv6(bytes)) return isDisallowedIpv4Bytes(bytes.slice(12));
  return IPV6_SPECIAL_RANGES.some((range) => matchesCidr(bytes, range));
}

export function isPublicBrowserAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[|\]$/g, "");
  const version = isIP(normalized);
  if (version === 4) {
    const bytes = parseIpv4(normalized);
    if (!bytes) return false;
    return !isDisallowedIpv4Bytes(bytes);
  }
  if (version === 6) {
    const bytes = parseIpv6(normalized);
    if (!bytes) return false;
    return !isDisallowedIpv6Bytes(bytes);
  }
  return false;
}

export function isAllowedBrowserProxyEndpointAddress(address: string): boolean {
  const normalized = normalizeBrowserIpAddress(address);
  if (!normalized) return false;

  const version = isIP(normalized);
  if (version === 4) {
    const bytes = parseIpv4(normalized);
    if (!bytes) return false;
    if (IPV4_PROXY_LOCAL_RANGES.some((range) => matchesCidr(bytes, range))) return true;
    return isPublicBrowserAddress(normalized);
  }
  if (version === 6) {
    const bytes = parseIpv6(normalized);
    if (!bytes) return false;
    if (IPV6_PROXY_LOCAL_RANGES.some((range) => matchesCidr(bytes, range))) return true;
    return isPublicBrowserAddress(normalized);
  }
  return false;
}

export function normalizeBrowserUrl(requestUrl: string):
  | { readonly allowed: true; readonly url: BrowserNormalizedUrl }
  | {
      readonly allowed: false;
      readonly reason: Exclude<BrowserReadReason, "read_complete">;
      readonly message: string;
    } {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return { allowed: false, reason: "invalid_url", message: "The Browser request URL is invalid." };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return {
      allowed: false,
      reason: "credentials_not_allowed",
      message: "Browser URLs must not contain embedded credentials.",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      allowed: false,
      reason: "protocol_not_allowed",
      message: "Only HTTP and HTTPS Browser URLs are allowed.",
    };
  }

  const defaultPort: 80 | 443 = parsed.protocol === "http:" ? 80 : 443;
  const explicitPort = parsed.port === "" ? defaultPort : Number(parsed.port);
  if (explicitPort !== defaultPort) {
    return {
      allowed: false,
      reason: "port_not_allowed",
      message: "Browser URLs must use the protocol default port.",
    };
  }

  parsed.hash = "";
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "") {
    return { allowed: false, reason: "invalid_url", message: "Browser URLs must contain a host." };
  }

  return {
    allowed: true,
    url: {
      href: parsed.href,
      origin: parsed.origin,
      protocol: parsed.protocol,
      hostname,
      port: defaultPort,
    },
  };
}

function explicitPortText(value: string): string | undefined {
  const schemeEnd = value.indexOf("://");
  if (schemeEnd < 0) return undefined;
  const authorityStart = schemeEnd + 3;
  const pathStart = value.slice(authorityStart).search(/[/?#]/u);
  const authorityEnd = pathStart < 0 ? value.length : authorityStart + pathStart;
  const authority = value.slice(authorityStart, authorityEnd);
  const credentialEnd = authority.lastIndexOf("@");
  const hostPort = credentialEnd < 0 ? authority : authority.slice(credentialEnd + 1);

  if (hostPort.startsWith("[")) {
    const closingBracket = hostPort.indexOf("]");
    if (closingBracket < 0 || hostPort[closingBracket + 1] !== ":") return undefined;
    return hostPort.slice(closingBracket + 2);
  }

  const colon = hostPort.lastIndexOf(":");
  if (colon < 0 || hostPort.indexOf(":") !== colon) return undefined;
  return hostPort.slice(colon + 1);
}

export function normalizeBrowserProxyEndpoint(endpointUrl: string): BrowserProxyEndpointDecision {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return { allowed: false, reason: "proxy_endpoint_invalid", message: "The Browser proxy endpoint is invalid." };
  }

  if (parsed.protocol !== "http:") {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint must use HTTP.",
    };
  }
  if (parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint must not contain credentials, a query, or a fragment.",
    };
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint path must be empty or '/'.",
    };
  }

  const portText = explicitPortText(endpointUrl);
  if (!portText || !/^\d+$/u.test(portText)) {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint must contain an explicit numeric port.",
    };
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint port is outside the valid range.",
    };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!hostname) {
    return {
      allowed: false,
      reason: "proxy_endpoint_invalid",
      message: "The Browser proxy endpoint must contain a host.",
    };
  }

  return { allowed: true, endpoint: { protocol: "http:", hostname, port } };
}

function isDisallowedProxyTargetHostname(hostname: string): boolean {
  const normalized = hostname.replace(/\.+$/gu, "").toLowerCase();
  return normalized === ""
    || normalized.includes("*")
    || !normalized.includes(".")
    || normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".home.arpa");
}

/**
 * Normalize one Settings-owned Browser allowlist entry. The entry is an
 * Origin, not a page URL: root path only, no query/fragment/credentials, and
 * only the protocol default port.
 */
export function normalizeBrowserOrigin(originInput: string): BrowserOriginDecision {
  let parsed: URL;
  try {
    parsed = new URL(originInput);
  } catch {
    return { allowed: false, reason: "invalid_url", message: "Browser allowlist Origin is invalid." };
  }

  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    return {
      allowed: false,
      reason: "invalid_url",
      message: "Browser allowlist entries must be a root Origin without a path, query, or fragment.",
    };
  }

  const normalized = normalizeBrowserUrl(originInput);
  if (!normalized.allowed) return normalized;
  if (isIP(normalized.url.hostname) > 0) {
    if (!isPublicBrowserAddress(normalized.url.hostname)) {
      return {
        allowed: false,
        reason: "non_public_target",
        message: "Browser allowlist Origins must not target private or special-use IP addresses.",
      };
    }
  } else if (isDisallowedProxyTargetHostname(normalized.url.hostname)) {
    return {
      allowed: false,
      reason: "non_public_target",
      message: "Browser allowlist Origins must use a multi-label non-local hostname.",
    };
  }

  return { allowed: true, origin: normalized.url.origin };
}

export function resolveBrowserProxyTarget(
  requestUrl: string,
  proxyEndpoint: BrowserResolvedProxyEndpoint,
): BrowserPolicyDecision {
  const normalized = normalizeBrowserUrl(requestUrl);
  if (!normalized.allowed) return normalized;

  const { url } = normalized;
  if (isIP(url.hostname) > 0) {
    const normalizedAddress = normalizeBrowserIpAddress(url.hostname);
    if (!normalizedAddress || !isPublicBrowserAddress(normalizedAddress)) {
      return denied("non_public_target", "Literal Browser targets must be publicly routable.", url);
    }
  } else if (isDisallowedProxyTargetHostname(url.hostname)) {
    return denied(
      "proxy_target_hostname_not_allowed",
      "Proxy Browser targets must use a multi-label non-local hostname.",
      url,
    );
  }

  return { allowed: true, target: { mode: "http_proxy", url, proxyEndpoint } };
}

async function lookupWithCancellation(
  resolver: BrowserDnsResolver,
  hostname: string,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  if (signal?.aborted) throw new BrowserPolicyResolutionError();
  const lookupPromise = resolver.lookup(hostname, signal);
  if (!signal) return lookupPromise;

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<readonly string[]>((_, reject) => {
    onAbort = () => reject(new BrowserPolicyResolutionError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([lookupPromise, abortPromise]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function resolveBrowserTarget(
  requestUrl: string,
  resolver: BrowserDnsResolver,
  signal?: AbortSignal,
): Promise<BrowserPolicyDecision> {
  const normalized = normalizeBrowserUrl(requestUrl);
  if (!normalized.allowed) return normalized;

  const { url } = normalized;
  const addressVersion = isIP(url.hostname);
  let addresses: readonly string[];
  try {
    addresses = addressVersion > 0
      ? [url.hostname]
      : await lookupWithCancellation(resolver, url.hostname, signal);
  } catch (error: unknown) {
    if (error instanceof BrowserPolicyResolutionError) throw error;
    return denied("dns_resolution_failed", "The Browser target could not be resolved.", url);
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicBrowserAddress(address))) {
    return denied(
      "non_public_target",
      "Every resolved Browser target address must be publicly routable.",
      url,
    );
  }

  return { allowed: true, target: { mode: "direct", url, addresses: [...addresses] } };
}

export async function resolveBrowserProxyEndpoint(
  endpoint: BrowserProxyEndpoint,
  resolver: BrowserDnsResolver,
  signal?: AbortSignal,
): Promise<BrowserProxyEndpointResolutionDecision> {
  const addressVersion = isIP(endpoint.hostname);
  let addresses: readonly string[];
  try {
    addresses = addressVersion > 0
      ? [endpoint.hostname]
      : await lookupWithCancellation(resolver, endpoint.hostname, signal);
  } catch (error: unknown) {
    if (error instanceof BrowserPolicyResolutionError) throw error;
    return {
      allowed: false,
      reason: "proxy_endpoint_dns_resolution_failed",
      message: "The Browser proxy endpoint could not be resolved.",
    };
  }

  const normalizedAddresses = addresses.map((address) => normalizeBrowserIpAddress(address));
  const resolvedAddresses: string[] = [];
  for (const address of normalizedAddresses) {
    if (address === undefined || !isAllowedBrowserProxyEndpointAddress(address)) {
      return {
        allowed: false,
        reason: "proxy_endpoint_non_allowed",
        message: "Every resolved Browser proxy endpoint address must be public or explicitly local.",
      };
    }
    resolvedAddresses.push(address);
  }
  if (resolvedAddresses.length === 0) {
    return {
      allowed: false,
      reason: "proxy_endpoint_non_allowed",
      message: "The Browser proxy endpoint returned no addresses.",
    };
  }
  return { allowed: true, endpoint: { endpoint, addresses: resolvedAddresses } };
}

export async function resolveBrowserRedirect(
  initialUrl: BrowserNormalizedUrl,
  currentUrl: string,
  location: string,
  resolver: BrowserDnsResolver,
  signal?: AbortSignal,
): Promise<BrowserPolicyDecision> {
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(location, currentUrl).href;
  } catch {
    return denied("redirect_blocked", "The Browser redirect Location is invalid.");
  }

  const normalized = normalizeBrowserUrl(absoluteUrl);
  if (!normalized.allowed) {
    return denied("redirect_blocked", "The Browser redirect is not an allowed HTTP(S) URL.");
  }
  if (normalized.url.origin !== initialUrl.origin) {
    return denied("redirect_blocked", "Browser redirects must remain on the initial Origin.");
  }
  return resolveBrowserTarget(normalized.url.href, resolver, signal);
}

export function resolveBrowserProxyRedirect(
  initialUrl: BrowserNormalizedUrl,
  currentUrl: string,
  location: string,
  proxyEndpoint: BrowserResolvedProxyEndpoint,
): BrowserPolicyDecision {
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(location, currentUrl).href;
  } catch {
    return denied("redirect_blocked", "The Browser redirect Location is invalid.");
  }

  const normalized = normalizeBrowserUrl(absoluteUrl);
  if (!normalized.allowed) {
    return denied("redirect_blocked", "The Browser redirect is not an allowed HTTP(S) URL.");
  }
  if (normalized.url.origin !== initialUrl.origin) {
    return denied("redirect_blocked", "Browser redirects must remain on the initial Origin.");
  }
  return resolveBrowserProxyTarget(normalized.url.href, proxyEndpoint);
}
