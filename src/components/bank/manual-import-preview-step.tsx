import { useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { findSuspectedDuplicates } from "@/lib/bank-import/duplicates";
import type { NormalizedRow, NormalizeResult } from "@/lib/bank-import/types";
import { formatDate, formatSignedEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 100;

/** Read-only (besides row removal) preview for the deterministic CSV/XLSX path. The AI/PDF path
 *  uses the separate, editable manual-import-ai-preview-step.tsx instead — see
 *  manual-import-dialog.tsx. */
export function ManualImportPreviewStep({
  result,
  onBack,
  onImport,
  importing,
}: {
  result: NormalizeResult;
  onBack: () => void;
  onImport: (rows: NormalizedRow[]) => void;
  importing: boolean;
}) {
  const { t } = useTranslation();
  const { issues } = result;
  const [rows, setRows] = useState<NormalizedRow[]>(result.rows);

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const duplicates = useMemo(() => findSuspectedDuplicates(rows), [rows]);
  const sum = useMemo(() => rows.reduce((acc, r) => acc + r.amount, 0), [rows]);
  const dates = useMemo(() => rows.map((r) => r.booking_date).sort(), [rows]);
  const from = dates[0];
  const to = dates[dates.length - 1];

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        {t("bank.manualImport.preview.summary", {
          count: rows.length,
          from: formatDate(from),
          to: formatDate(to),
          sum: formatSignedEUR(sum),
        })}
      </div>

      {issues.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("bank.manualImport.preview.issuesTitle", { count: issues.length })}
        </p>
      )}

      {duplicates.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("bank.manualImport.preview.duplicateWarning", { count: duplicates.size })}
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <Table containerClassName="max-h-[360px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("bank.manualImport.preview.col.datum")}</TableHead>
              <TableHead className="text-right">
                {t("bank.manualImport.preview.col.betrag")}
              </TableHead>
              <TableHead>{t("bank.manualImport.preview.col.gegenkonto")}</TableHead>
              <TableHead>{t("bank.manualImport.preview.col.verwendungszweck")}</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
              <TableRow
                key={i}
                className={cn(duplicates.has(i) && "bg-amber-50 dark:bg-amber-950/20")}
              >
                <TableCell>{formatDate(row.booking_date)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatSignedEUR(row.amount)}
                </TableCell>
                <TableCell>{row.counterparty_holder ?? "—"}</TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {row.payment_reference ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    title={t("bank.manualImport.preview.removeRow")}
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} type="button">
          {t("bank.manualImport.preview.back")}
        </Button>
        <Button disabled={rows.length === 0 || importing} onClick={() => onImport(rows)}>
          {importing
            ? t("bank.manualImport.preview.importing")
            : t("bank.manualImport.preview.import")}
        </Button>
      </div>
    </div>
  );
}
