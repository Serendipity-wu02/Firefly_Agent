import { useTranslation } from "../../i18n";

interface SkillModeButtonProps {
  active?: boolean;
  onClick?: () => void;
}

export function SkillModeButton({ active = false, onClick }: SkillModeButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      className={`cy-side-action ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
      title={t("ui.skills")}
      aria-pressed={active}
    >
      <span className="cy-side-action-icon">
        <span aria-hidden="true">✦</span>
      </span>
      <span className="cy-side-action-label">{t("ui.skills")}</span>
    </button>
  );
}
