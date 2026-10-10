import { useRef } from "react";
import { useTranslation } from "../../i18n";
import "./ModeTabs.css";

interface ModeTabsProps {
  value: string;
  onChange: (mode: string) => void;
}

const WorkIcon = (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="3" y="3.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 16.5H13M10 13.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ChatIcon = (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M16.5 9.25C16.5 12.43 13.59 15 10 15C9.22 15 8.47 14.88 7.78 14.65L4.5 16L5.35 13.17C4.2 12.16 3.5 10.78 3.5 9.25C3.5 6.07 6.41 3.5 10 3.5C13.59 3.5 16.5 6.07 16.5 9.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const CodeIcon = (
  <svg width="15" height="15" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    <path d="M28 22L33 27L28 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 22L15 27L20 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Mode identities stay Chat/Work/Code; the order follows the title bar of the reference layout. */
const modes = [
  { key: "work", label: "Work", icon: WorkIcon },
  { key: "chat", label: "Chat", icon: ChatIcon },
  { key: "code", label: "Code", icon: CodeIcon },
];

/** Segmented mode switch that sits in the middle of the title bar. */
export function ModeTabs({ value, onChange }: ModeTabsProps) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(0, modes.findIndex(mode => mode.key === value));

  function move(index: number) {
    const next = (index + modes.length) % modes.length;
    refs.current[next]?.focus();
    onChange(modes[next].key);
  }

  return (
    <div className="cy-mode-tabs" role="tablist" aria-label={t("ui.modeMenu")}>
      {modes.map((mode, index) => {
        const selected = index === selectedIndex;
        return (
          <button key={mode.key} ref={node => { refs.current[index] = node; }} type="button" role="tab"
            className={`cy-mode-tabs__tab${selected ? " is-active" : ""}`}
            aria-selected={selected} tabIndex={selected ? 0 : -1}
            aria-label={t("ui.modeSelector", { mode: mode.label })}
            onClick={() => { if (!selected) onChange(mode.key); }}
            onKeyDown={event => {
              const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (delta) { event.preventDefault(); move(index + delta); }
              else if (event.key === "Home") { event.preventDefault(); move(0); }
              else if (event.key === "End") { event.preventDefault(); move(modes.length - 1); }
            }}>
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
