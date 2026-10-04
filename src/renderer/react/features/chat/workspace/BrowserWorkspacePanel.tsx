import React, { type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, RotateCw, X } from "lucide-react";
import type { BrowserPageState } from "./browser-page-state";
import "./BrowserWorkspacePanel.css";

export interface BrowserWorkspaceLabels {
  panel: string;
  address: string;
  go: string;
  back: string;
  forward: string;
  reload: string;
  close: string;
  loading: string;
  blocked: string;
  loadFailed: string;
  closed: string;
  viewport: string;
  empty: string;
}

export interface BrowserWorkspacePanelProps {
  page: BrowserPageState;
  address: string;
  labels: BrowserWorkspaceLabels;
  onAddressChange: (value: string) => void;
  onNavigate: (url: string) => void;
  onCommand: (command: "back" | "forward" | "reload") => void;
  onClose: () => void;
  viewportRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

/** Controlled view: no bridge, navigation API, authority, or asynchronous work. */
export function BrowserWorkspacePanel({
  page, address, labels, onAddressChange, onNavigate, onCommand, onClose, viewportRef, children,
}: BrowserWorkspacePanelProps) {
  const canSubmit = !page.closed && address.trim().length > 0;
  return (
    <section className="cy-browser-workspace" aria-label={labels.panel}>
      <div className="cy-browser-workspace__toolbar">
        <button type="button" aria-label={labels.back} title={labels.back}
          disabled={page.closed || !page.canGoBack} onClick={() => onCommand("back")}>
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label={labels.forward} title={labels.forward}
          disabled={page.closed || !page.canGoForward} onClick={() => onCommand("forward")}>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label={labels.reload} title={labels.reload}
          disabled={page.closed || !page.url} onClick={() => onCommand("reload")}>
          <RotateCw size={16} aria-hidden="true" />
        </button>
        <form className="cy-browser-workspace__address" onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onNavigate(address.trim());
        }}>
          <input type="text" inputMode="url" autoComplete="off" spellCheck={false}
            aria-label={labels.address} value={address} disabled={page.closed}
            onChange={(event) => onAddressChange(event.currentTarget.value)} />
          <button type="submit" aria-label={labels.go} disabled={!canSubmit}>{labels.go}</button>
        </form>
        <button type="button" aria-label={labels.close} title={labels.close}
          disabled={page.closed} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {page.closed
        ? <p className="cy-browser-workspace__notice" role="status">{labels.closed}</p>
        : <>
          {page.loading && <p className="cy-browser-workspace__notice" role="status">{labels.loading}</p>}
          {page.error && <p className="cy-browser-workspace__notice is-error" role="alert">
            {page.error === "blocked" ? labels.blocked : labels.loadFailed}
          </p>}
          <div className="cy-browser-workspace__viewport" ref={viewportRef} role="region"
            aria-label={labels.viewport} aria-busy={page.loading}>
            {children ?? (!page.url && !page.loading
              ? <p className="cy-browser-workspace__empty">{labels.empty}</p>
              : null)}
          </div>
        </>}
    </section>
  );
}
