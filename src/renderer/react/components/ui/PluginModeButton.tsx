import { useTranslation } from "../../i18n";

interface PluginModeButtonProps {
  active?: boolean;
  onClick?: () => void;
}

export function PluginModeButton({ active = false, onClick }: PluginModeButtonProps) {
  const { t } = useTranslation();
  return <button className={`cy-side-action ${active ? "is-active" : ""}`} onClick={onClick} type="button" title={t("ui.plugins")} aria-pressed={active}>
    <span className="cy-side-action-icon">
      <span aria-hidden="true">▦</span>
    </span>
    <span className="cy-side-action-label">{t("ui.plugins")}</span>
  </button>;
}
