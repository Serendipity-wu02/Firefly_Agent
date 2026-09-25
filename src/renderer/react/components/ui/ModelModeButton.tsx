import { useTranslation } from "../../i18n";

interface ModelModeButtonProps {
  active?: boolean;
  onClick?: () => void;
}

export function ModelModeButton({ active = false, onClick }: ModelModeButtonProps) {
  const { t } = useTranslation();
  return <button className={`cy-side-action ${active ? "is-active" : ""}`} onClick={onClick} type="button" title={t("ui.model")} aria-pressed={active}>
    <span className="cy-side-action-icon">
      <span aria-hidden="true">◇</span>
    </span>
    <span className="cy-side-action-label">{t("ui.model")}</span>
  </button>;
}
