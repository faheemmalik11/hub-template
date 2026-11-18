import { useTranslation } from "@/lib/i18n";

export function UnsavedDealChangesNote() {
  const { t } = useTranslation();
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {t("commissionDeals.actions.unsavedCardNote")}
    </p>
  );
}
