import { useTranslation } from "@/lib/i18n";

export function FixLink({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
    >
      {t("commissionDeals.review.fix")}
    </button>
  );
}
