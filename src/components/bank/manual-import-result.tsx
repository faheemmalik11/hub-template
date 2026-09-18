import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImportManualTransactionsResult } from "@/lib/api/bank-manual-import.functions";
import { useTranslation } from "@/lib/i18n";

export function ManualImportResultStep({
  result,
  onClose,
}: {
  result: ImportManualTransactionsResult;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-foreground">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <p className="text-sm font-medium">{t("bank.manualImport.result.title")}</p>
      </div>

      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>{t("bank.manualImport.result.inserted", { count: result.inserted })}</li>
        <li>{t("bank.manualImport.result.updated", { count: result.updated })}</li>
      </ul>

      <div className="flex justify-end">
        <Button onClick={onClose}>{t("bank.manualImport.result.close")}</Button>
      </div>
    </div>
  );
}
