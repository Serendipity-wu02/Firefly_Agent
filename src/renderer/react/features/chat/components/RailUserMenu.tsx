import { useEffect, useId, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useUserAvatar } from "../../../hooks/useUserAvatar";
import { useUserNickname } from "../../../hooks/useUserNickname";
import { useTranslation } from "../../../i18n";

export function RailUserMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const avatar = useUserAvatar();
  const nickname = useUserNickname();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const settings = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const label = nickname || t("ui.localUser");

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    settings.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [open]);

  const closeAndFocus = () => { setOpen(false); trigger.current?.focus(); };
  return (
    <div ref={container} className="cy-rail-user" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation(); closeAndFocus();
      }
      if (event.key === "Tab") setOpen(false);
    }}>
      <button ref={trigger} type="button" className="cy-rail-button cy-rail-user__trigger"
        aria-label={t("ui.userMenu")} title={label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
          }
        }}>
        <span className={`cy-user-avatar-circle ${avatar ? "" : "is-placeholder"}`}>
          {avatar ? <img src={avatar} alt={t("ui.userAlt")} draggable={false} /> : <span>U</span>}
        </span>
      </button>
      {open && <div className="cy-rail-user__menu" id={menuId}>
        <div className="cy-rail-user__name" title={label}>{label}</div>
        <div role="menu" aria-label={t("ui.userMenu")}>
          <button ref={settings} type="button" role="menuitem" aria-label={t("ui.settings")}
            onClick={() => { closeAndFocus(); onOpenSettings(); }}>
            <Settings size={18} aria-hidden="true" />{t("ui.settings")}
          </button>
        </div>
      </div>}
    </div>
  );
}
