import { useTranslation } from "../../i18n";

interface NewTaskButtonProps {
  label?: string;
  onClick?: () => void;
}

export function NewTaskButton({ label, onClick }: NewTaskButtonProps) {
  const { t } = useTranslation();
  return (
    <button className="cy-side-action" onClick={onClick} type="button">
      <span className="cy-side-action-icon">
        <span aria-hidden="true">＋</span>
      </span>
      <span className="cy-side-action-label">{label ?? t("ui.newButton")}</span>
    </button>
  );
}
