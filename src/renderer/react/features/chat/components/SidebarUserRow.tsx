import { Settings } from "lucide-react";
import { useUserAvatar } from "../../../hooks/useUserAvatar";
import { useUserNickname } from "../../../hooks/useUserNickname";
import { useTranslation } from "../../../i18n";
import "./SidebarUserRow.css";

/** Local user at the bottom of the sidebar: portrait and name on the left, settings on the right. */
export function SidebarUserRow({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation();
  const avatar = useUserAvatar();
  const nickname = useUserNickname();
  const label = nickname || t("ui.localUser");
  return (
    <div className="cy-sidebar-user">
      <button type="button" className="cy-sidebar-user__who" title={label} aria-label={t("ui.userMenu")} onClick={onOpenSettings}>
        <span className={`cy-user-avatar-circle ${avatar ? "" : "is-placeholder"}`}>
          {avatar ? <img src={avatar} alt={t("ui.userAlt")} draggable={false} /> : <span>U</span>}
        </span>
        <span className="cy-sidebar-user__name">{label}</span>
      </button>
      <button type="button" className="cy-sidebar-user__settings" title={t("ui.settings")} aria-label={t("ui.settings")} onClick={onOpenSettings}>
        <Settings size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
