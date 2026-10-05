import { useEffect, useRef, useState } from "react";
import type { BrowserPageDto, ManualBrowserApi, ManualBrowserCommand } from "../../../../../shared/manual-browser";
import { useTranslation } from "../../../i18n";
import { BrowserWorkspacePanel, type BrowserWorkspaceLabels } from "./BrowserWorkspacePanel";
import { createBrowserPageState, type BrowserPageState } from "./browser-page-state";

interface Scope {
  sessionId?: string; api?: ManualBrowserApi; disposed: boolean; closed: boolean; opening: boolean;
  page: BrowserPageDto | null; accept(page: BrowserPageDto): void;
}
/** Connects manual presentation to Main. The renderer never creates an owner or opens a URL itself. */
export function ManualBrowserTab({ sessionId, active = true, onClose }: { sessionId?: string; active?: boolean; onClose(): void }) {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [available, setAvailable] = useState(false), [checked, setChecked] = useState(false);
  const [page, setPage] = useState<BrowserPageState>(() => createBrowserPageState(sessionId ?? "", ""));
  const [failure, setFailure] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), scopeRef = useRef<Scope | null>(null);
  useEffect(() => {
    const api = window.manualBrowser;
    const scope: Scope = { sessionId, api, disposed: false, closed: false, opening: false, page: null, accept(dto) {
      if (scope.disposed || !scope.sessionId || dto.conversationId !== scope.sessionId || (scope.closed && !dto.closed)) return;
      const current = scope.page;
      if (current ? dto.browserId !== current.browserId || dto.requestId < current.requestId || (current.closed && !dto.closed) : !scope.opening) return;
      scope.page = dto;
      scope.closed ||= dto.closed;
      setPage({ ...dto, error: dto.error === null ? null : dto.error === "blocked_url" || dto.error === "network_unavailable" ? "blocked" : "load_failed" });
      setFailure(dto.error);
      if (!dto.loading && dto.url) setAddress(dto.url);
    } };
    scopeRef.current = scope; setAvailable(false); setChecked(false); setAddress(""); setFailure(null);
    setPage(createBrowserPageState(sessionId ?? "", ""));
    const off = api?.onChanged?.(dto => scope.accept(dto));
    void Promise.resolve().then(() => api?.getAvailability()).catch(() => undefined).then(result => {
      if (!scope.disposed) { setAvailable(result?.available === true && !!api?.execute && !!api?.onChanged); setChecked(true); }
    });
    return () => {
      scope.disposed = true; off?.();
      if (scope.page && !scope.page.closed) void api?.execute({ kind: "close", browserId: scope.page.browserId }).catch(() => {});
      if (scopeRef.current === scope) scopeRef.current = null;
    };
  }, [sessionId]);

  async function command(input: ManualBrowserCommand) {
    const scope = scopeRef.current;
    if (!scope || !scope.api || scope.disposed || scope.closed || !available || !scope.sessionId) return;
    if (input.kind === "open") { if (scope.opening) return; scope.opening = true; }
    try {
      const reply = await scope.api.execute(input);
      if (reply.ok && reply.value) {
        if ((scope.disposed || scope.closed) && !reply.value.closed) {
          void scope.api.execute({ kind: "close", browserId: reply.value.browserId }).catch(() => {});
        } else scope.accept(reply.value);
      } else if (!reply.ok && !scope.disposed && !scope.closed) {
        setFailure(reply.code); setPage(current => ({ ...current, loading: false, error: reply.code === "blocked_url" ? "blocked" : "load_failed" }));
      }
    } catch { if (!scope.disposed && !scope.closed) { setFailure("load_failed"); setPage(current => ({ ...current, loading: false, error: "load_failed" })); } }
    finally { if (input.kind === "open") scope.opening = false; }
  }
  useEffect(() => {
    const scope = scopeRef.current, node = viewport.current, id = page.browserId;
    if (!scope?.api || !id || page.closed) return;
    const layout = () => {
      if (scope.disposed || scope.closed) return;
      const rect = node?.getBoundingClientRect();
      const bounds = active && document.visibilityState !== "hidden" && rect && rect.width > 0 && rect.height > 0
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;
      void scope.api!.execute({ kind: "layout", browserId: id, bounds }).catch(() => {});
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : undefined;
    if (node) { observer?.observe(node); if (node.parentElement) observer?.observe(node.parentElement); }
    window.addEventListener("resize", layout); window.addEventListener("focus", layout); document.addEventListener("visibilitychange", layout);
    layout();
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", layout); window.removeEventListener("focus", layout); document.removeEventListener("visibilitychange", layout);
      if (!scope.disposed && !scope.closed) void scope.api!.execute({ kind: "layout", browserId: id, bounds: null }).catch(() => {});
    };
  }, [page.browserId, page.closed, page.loading, page.error, active]);
  function close() {
    const scope = scopeRef.current;
    if (scope) {
      scope.closed = true;
      if (scope.page && !scope.page.closed) void scope.api?.execute({ kind: "close", browserId: scope.page.browserId }).then(reply => {
        if (!scope.disposed && !reply.ok) setFailure(reply.code);
      }).catch(() => { if (!scope.disposed) setFailure("cleanup_failed"); });
    }
    setPage(current => ({ ...current, closed: true, loading: false })); onClose();
  }
  const labels: BrowserWorkspaceLabels = {
    panel: t("browserWorkspace.title"), address: t("browserWorkspace.address"), go: t("browserWorkspace.go"),
    back: t("browserWorkspace.back"), forward: t("browserWorkspace.forward"), reload: t("browserWorkspace.reload"), close: t("browserWorkspace.close"),
    loading: t("browserWorkspace.loading"), blocked: t(available ? "browserWorkspace.blocked" : checked ? "browserWorkspace.unavailable" : "browserWorkspace.checking"),
    loadFailed: t("browserWorkspace.loadFailed"), closed: t(failure === "cleanup_failed" ? "browserWorkspace.cleanupFailed" : "browserWorkspace.closed"),
    viewport: t("browserWorkspace.viewport"), empty: t(sessionId ? "browserWorkspace.ready" : "browserWorkspace.sessionRequired"),
  };
  return <BrowserWorkspacePanel page={!available ? { ...page, error: "blocked" } : page}
    address={address} labels={labels} navigationAvailable={available && !!sessionId && !page.closed}
    viewportRef={viewport} onAddressChange={setAddress} onNavigate={url => void command(scopeRef.current?.page
      ? { kind: "navigate", browserId: scopeRef.current.page.browserId, url } : { kind: "open", url })}
    onCommand={action => { const id = scopeRef.current?.page?.browserId; if (id) void command({ kind: "history", browserId: id, action }); }} onClose={close} />;
}
