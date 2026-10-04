import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "../../i18n";

interface ModeSwitchProps {
  value: string;
  onChange: (mode: string) => void;
}

const WorkIcon = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 16.5H13M10 13.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ChatIcon = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M16.5 9.25C16.5 12.43 13.59 15 10 15C9.22 15 8.47 14.88 7.78 14.65L4.5 16L5.35 13.17C4.2 12.16 3.5 10.78 3.5 9.25C3.5 6.07 6.41 3.5 10 3.5C13.59 3.5 16.5 6.07 16.5 9.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7.5 9.25H7.51M10 9.25H10.01M12.5 9.25H12.51" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const CodeIcon = (
  <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
    <path d="M5 8C5 6.89543 5.89543 6 7 6H19L24 12H41C42.1046 12 43 12.8954 43 14V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    <path d="M28 22L33 27L28 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 22L15 27L20 32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


const modes = [
  { key: "chat", label: "Chat", icon: ChatIcon, description: "ui.modeChatDescription" },
  { key: "work", label: "Work", icon: WorkIcon, description: "ui.modeWorkDescription" },
  { key: "code", label: "Code", icon: CodeIcon, description: "ui.modeCodeDescription" },
];

export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  const { t } = useTranslation();
  const selectedIndex = Math.max(0, modes.findIndex(mode => mode.key === value));
  const current = modes[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [open]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }
  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function selectMode(index: number) {
    closeMenu();
    onChange(modes[index].key);
  }

  return (
    <div ref={containerRef} className="cy-mode-picker" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={triggerRef} type="button" className="cy-mode-picker__trigger"
        aria-label={t("ui.modeSelector", { mode: current.label })}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); openMenu();
          } else if (event.key === "Escape" && open) {
            event.preventDefault(); closeMenu();
          }
        }}>
        <span className="cy-mode-picker__icon" aria-hidden="true">{current.icon}</span>
        <span>{current.label}</span>
        <svg className="cy-mode-picker__chevron" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={t("ui.modeMenu")} className="cy-mode-picker__menu"
          onKeyDown={event => {
            switch (event.key) {
              case "ArrowDown": setActiveIndex(index => (index + 1) % modes.length); break;
              case "ArrowUp": setActiveIndex(index => (index + modes.length - 1) % modes.length); break;
              case "Home": setActiveIndex(0); break;
              case "End": setActiveIndex(modes.length - 1); break;
              case "Enter": case " ": selectMode(activeIndex); break;
              case "Escape": closeMenu(); break;
              case "Tab": setOpen(false); return;
              default: return;
            }
            event.preventDefault(); event.stopPropagation();
          }}>
          {modes.map((mode, index) => (
            <button key={mode.key} ref={node => { itemRefs.current[index] = node; }} type="button"
              role="menuitemradio" aria-checked={mode.key === value} tabIndex={index === activeIndex ? 0 : -1}
              className="cy-mode-picker__item" onClick={() => selectMode(index)} onFocus={() => setActiveIndex(index)}>
              <span className="cy-mode-picker__icon" aria-hidden="true">{mode.icon}</span>
              <span className="cy-mode-picker__copy">
                <span className="cy-mode-picker__label">{mode.label}</span>
                <span className="cy-mode-picker__description">{t(mode.description)}</span>
              </span>
              {mode.key === value && (
                <svg className="cy-mode-picker__check" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
