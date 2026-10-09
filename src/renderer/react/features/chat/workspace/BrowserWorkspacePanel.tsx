import React, { type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Square, X } from "lucide-react";
import type { BrowserPageState } from "./browser-page-state";
import "./BrowserWorkspacePanel.css";

export interface BrowserWorkspaceLabels {
  panel: string;
  address: string;
  go: string;
  back: string;
  forward: string;
  reload: string;
  stop?: string;
  close: string;
  loading: string;
  blocked: string;
  loadFailed: string;
  closed: string;
  viewport: string;
  empty: string;
  committedUrl?: string;
  addressHint?: string;
}

export interface BrowserWorkspacePanelProps {
  page: BrowserPageState;
  address: string;
  labels: BrowserWorkspaceLabels;
  onAddressChange: (value: string) => void;
  onNavigate: (url: string) => void;
  onAddressReset?: () => void;
  commandPending?: boolean;
  closeAvailable?: boolean;
  onCommand: (command: "back" | "forward" | "reload" | "stop") => void;
  onClose: () => void;
  viewportRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  navigationAvailable?: boolean;
  /** Address proposals can be available before native site consent; history still needs a grant. */
  addressAvailable?: boolean;
}

/** Controlled view: no bridge, navigation API, authority, or asynchronous work. */
export function BrowserWorkspacePanel({
  page, address, labels, onAddressChange, onAddressReset, onNavigate, onCommand, onClose, viewportRef, children, navigationAvailable = true, addressAvailable = navigationAvailable && !page.closed, commandPending = false, closeAvailable = !page.closed,
}: BrowserWorkspacePanelProps) {
  const busy = page.loading || commandPending;
  const canSubmit = addressAvailable && address.trim().length > 0;
  return (
    <section className="cy-browser-workspace" aria-label={labels.panel} data-browser-command-pending={commandPending || undefined}>
      <div className="cy-browser-workspace__toolbar">
        <button type="button" aria-label={labels.back} title={labels.back}
          disabled={!navigationAvailable || page.closed || !page.canGoBack} onClick={() => onCommand("back")}>
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label={labels.forward} title={labels.forward}
          disabled={!navigationAvailable || page.closed || !page.canGoForward} onClick={() => onCommand("forward")}>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        {busy ? <button type="button" aria-label={labels.stop} title={labels.stop}
          disabled={!navigationAvailable || page.closed || page.requestId === 0} onClick={() => onCommand("stop")}>
          <Square size={14} aria-hidden="true" />
        </button> : <button type="button" aria-label={labels.reload} title={labels.reload}
          disabled={!navigationAvailable || page.closed || !page.url} onClick={() => onCommand("reload")}>
          <RotateCw size={16} aria-hidden="true" />
        </button>}
        <form className="cy-browser-workspace__address" onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onNavigate(address.trim());
        }}>
          <input type="text" inputMode="url" autoComplete="off" spellCheck={false}
            aria-label={labels.address} placeholder="https://" title={labels.addressHint} value={address} disabled={page.closed && !addressAvailable}
            onChange={(event) => onAddressChange(event.currentTarget.value)}
            onKeyDown={event => { if (event.key === "Escape" && onAddressReset) { event.preventDefault(); event.stopPropagation(); onAddressReset(); } }} />
          <button type="submit" aria-label={labels.go} disabled={!canSubmit}>{labels.go}</button>
        </form>
        <button type="button" aria-label={labels.close} title={labels.close}
          disabled={!closeAvailable} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {page.url && !page.closed && <div className="cy-browser-workspace__location" aria-label={labels.committedUrl}>
        <span className="cy-browser-workspace__location-dot" aria-hidden="true" />
        <span data-browser-committed-url title={page.url}>{page.url}</span>
      </div>}
      {page.closed
        ? <p className="cy-browser-workspace__notice" role="status">{labels.closed}</p>
        : <>
          {busy && <p className="cy-browser-workspace__notice" role="status">{labels.loading}</p>}
          {page.error && <p className="cy-browser-workspace__notice is-error" role="alert">
            {page.error === "blocked" ? labels.blocked : labels.loadFailed}
          </p>}
          <div className="cy-browser-workspace__viewport" ref={viewportRef} role="region"
            aria-label={labels.viewport} aria-busy={busy}>
            {children ?? (!page.url && !page.loading
              ? <p className="cy-browser-workspace__empty">{labels.empty}</p>
              : null)}
          </div>
        </>}
    </section>
  );
}
