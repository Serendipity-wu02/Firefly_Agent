import { promises as dns } from "node:dns";

import type { BrowserProxyEndpoint } from "../../shared/browser-types.js";
import { BrowserReadBackend } from "./browser-reader.js";
import { NodeBrowserTransport } from "./browser-transport.js";
import { HttpProxyBrowserTransport } from "./http-proxy-browser-transport.js";

/**
 * Validation-only composition. It is intentionally not imported by the
 * application composition root or registered as a production tool.
 */
export type NodeBrowserReadBackendOptions = {
  readonly mode?: "direct";
  readonly proxyEndpoint?: never;
  readonly now?: () => number;
} | {
  readonly mode: "http_proxy";
  readonly proxyEndpoint: BrowserProxyEndpoint;
  readonly now?: () => number;
};

export function createNodeBrowserReadBackend(options: NodeBrowserReadBackendOptions = {}): BrowserReadBackend {
  const resolver = {
    lookup: async (hostname: string) => {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      return records.map((record) => record.address);
    },
  };
  if (options.mode === "http_proxy") {
    return new BrowserReadBackend({
      mode: "http_proxy",
      proxyEndpoint: options.proxyEndpoint,
      dnsResolver: resolver,
      transport: new HttpProxyBrowserTransport(),
      now: options.now,
    });
  }
  return new BrowserReadBackend({
    mode: "direct",
    dnsResolver: resolver,
    transport: new NodeBrowserTransport(),
    now: options.now,
  });
}
