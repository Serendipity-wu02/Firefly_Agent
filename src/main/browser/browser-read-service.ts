import type {
  BrowserReadRequest,
  BrowserReadResult,
} from "../../shared/browser-types";
import type { BrowserScope } from "../../shared/sandbox-types";
import type { BrowserSettingsSnapshot } from "../../shared/settings-types";
import { createNodeBrowserReadBackend } from "./node-browser-backend";
import type { BrowserReadBackend } from "./browser-reader";

export type BrowserReadServiceResult =
  | { readonly ok: true; readonly result: BrowserReadResult }
  | {
      readonly ok: false;
      readonly error:
        | "browser_configuration_changed"
        | "browser_configuration_unavailable"
        | "browser_backend_unavailable";
      readonly message: string;
    };

export interface BrowserReadServiceOptions {
  readonly getBrowserSettingsSnapshot: () => BrowserSettingsSnapshot | undefined;
  readonly createBackend?: (snapshot: Extract<BrowserSettingsSnapshot, { status: "default" | "configured" }>) => BrowserReadBackend;
}

function proxyKey(snapshot: Extract<BrowserSettingsSnapshot, { status: "default" | "configured" }>): string {
  const settings = snapshot.settings;
  if (settings.transportMode === "direct") return "direct";
  const endpoint = settings.httpProxy;
  return `http_proxy://${endpoint.hostname}:${endpoint.port}`;
}

function matchesCurrentConfiguration(
  scope: BrowserScope,
  snapshot: Extract<BrowserSettingsSnapshot, { status: "default" | "configured" }>,
): boolean {
  if (scope.networkRevision !== snapshot.revision) return false;
  if (scope.transportMode !== snapshot.settings.transportMode) return false;
  if (scope.transportMode === "direct") return scope.proxyEndpoint === undefined;
  const endpoint = snapshot.settings.transportMode === "http_proxy"
    ? snapshot.settings.httpProxy
    : undefined;
  if (endpoint === undefined) return false;
  return scope.proxyEndpoint !== undefined
    && scope.proxyEndpoint.protocol === endpoint.protocol
    && scope.proxyEndpoint.hostname === endpoint.hostname
    && scope.proxyEndpoint.port === endpoint.port;
}

function createDefaultBackend(
  snapshot: Extract<BrowserSettingsSnapshot, { status: "default" | "configured" }>,
): BrowserReadBackend {
  if (snapshot.settings.transportMode === "http_proxy") {
    return createNodeBrowserReadBackend({
      mode: "http_proxy",
      proxyEndpoint: snapshot.settings.httpProxy,
    });
  }
  return createNodeBrowserReadBackend({ mode: "direct" });
}

/**
 * Main-owned production Browser backend lifecycle. It keeps one transport
 * instance and one concurrency gate for the application process. Authorization
 * must finish before this service is called.
 */
export class BrowserReadService {
  private backend: BrowserReadBackend | undefined;
  private backendKey: string | undefined;
  private cleanupPromise: Promise<void> | undefined;
  private disposed = false;

  public constructor(private readonly options: BrowserReadServiceOptions) {}

  public invalidateConfiguration(): void {
    const previous = this.backend;
    this.backend = undefined;
    this.backendKey = undefined;
    if (previous !== undefined) this.enqueueDispose(previous);
  }

  public async read(
    request: BrowserReadRequest,
    scope: BrowserScope,
    signal?: AbortSignal,
  ): Promise<BrowserReadServiceResult> {
    if (this.disposed) {
      return {
        ok: false,
        error: "browser_backend_unavailable",
        message: "Browser reading is unavailable because the application is stopping.",
      };
    }

    const snapshot = this.options.getBrowserSettingsSnapshot();
    if (snapshot === undefined || snapshot.status === "unavailable") {
      return {
        ok: false,
        error: "browser_configuration_unavailable",
        message: "The current Browser network configuration is unavailable.",
      };
    }
    if (!matchesCurrentConfiguration(scope, snapshot)) {
      return {
        ok: false,
        error: "browser_configuration_changed",
        message: "The Browser network configuration changed before reading started.",
      };
    }

    await this.cleanupPromise;
    if (this.disposed) {
      return {
        ok: false,
        error: "browser_backend_unavailable",
        message: "Browser reading is unavailable because the application is stopping.",
      };
    }

    const key = `${snapshot.revision}|${proxyKey(snapshot)}`;
    if (this.backend === undefined || this.backendKey !== key) {
      const previous = this.backend;
      this.backend = undefined;
      this.backendKey = undefined;
      if (previous !== undefined) await previous.dispose();
      this.backend = (this.options.createBackend ?? createDefaultBackend)(snapshot);
      this.backendKey = key;
    }

    const result = await this.backend.read(request, signal);
    return { ok: true, result };
  }

  public async dispose(): Promise<void> {
    if (this.disposed && this.backend === undefined && this.cleanupPromise === undefined) return;
    this.disposed = true;
    const previous = this.backend;
    this.backend = undefined;
    this.backendKey = undefined;
    if (previous !== undefined) this.enqueueDispose(previous);
    await this.cleanupPromise;
  }

  private enqueueDispose(backend: BrowserReadBackend): void {
    const previousCleanup = this.cleanupPromise ?? Promise.resolve();
    const cleanup = previousCleanup
      .catch(() => undefined)
      .then(async () => {
        await backend.dispose();
      })
      .catch(() => undefined);
    this.cleanupPromise = cleanup;
    void cleanup.finally(() => {
      if (this.cleanupPromise === cleanup) this.cleanupPromise = undefined;
    });
  }
}
