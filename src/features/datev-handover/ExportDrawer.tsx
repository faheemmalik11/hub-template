import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  downloadMonthlyBundle,
  fehlerText,
  toast,
  useGesellschaften,
  useTranslation,
  type BundleSummary,
} from "./adapter";

/**
 * Every document of one month for one company, as a single archive.
 *
 * A DIFFERENT JOB FROM THE HANDOVER, which is why it is its own action and not a variant of Send.
 * The handover pushes paid receipts by email to the tax advisor's upload address and records
 * itself, because the mail provider confirms the send. This pulls a zip to the operator's machine
 * and records nothing: what somebody does with the archive afterwards is invisible here, so
 * stamping `datev_handed_over_at` would mark documents as handed over that may never arrive.
 *
 * The scope differs to match. The archive is EVERYTHING dated in that month for that company: no
 * workflow filter, no "not yet handed over" filter. A month's batch is the month, and silently
 * omitting a receipt because it sits in an unexpected state is how one goes missing with nobody
 * noticing. A receipt whose file cannot be read still gets a line in the manifest saying so, and
 * comes back in the summary below, so a short archive can never look like a complete one.
 */
export function ExportDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const companiesQ = useGesellschaften();
  const companies = companiesQ.data ?? [];

  const now = new Date();
  // Defaults to the PREVIOUS month: a payment run is worked after a month closes, so the current
  // month is almost never the one being exported.
  const vormonat = now.getMonth() === 0 ? 12 : now.getMonth();
  const vorjahr = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [companyId, setCompanyId] = useState("");
  const [month, setMonth] = useState(vormonat);
  const [year, setYear] = useState(vorjahr);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BundleSummary | null>(null);

  const jahre = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  async function run() {
    setBusy(true);
    setSummary(null);
    try {
      const {
        blob,
        filename,
        summary: s,
      } = await downloadMonthlyBundle({ companyId, year, month });
      // An anchor click rather than opening a URL: the archive is a response held in memory, so
      // there is nothing to navigate to.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSummary(s);
      toast.success(t("datevUebergabe.export.fertig", { count: s?.included ?? 0 }));
    } catch (e) {
      toast.error(fehlerText(e));
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("datevUebergabe.export.title")}</SheetTitle>
          <SheetDescription>{t("datevUebergabe.export.desc")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          <div>
            <Label htmlFor="export-company">{t("datevUebergabe.export.gesellschaft")}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="export-company" className="mt-1.5 w-full">
                <SelectValue placeholder={t("datevUebergabe.export.gesellschaftWaehlen")} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name ? `${c.code} · ${c.name}` : c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="export-month">{t("datevUebergabe.export.monat")}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger id="export-month" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {t(`datevUebergabe.export.monatName.${i + 1}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label htmlFor="export-year">{t("datevUebergabe.export.jahr")}</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger id="export-year" className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {jahre.map((j) => (
                    <SelectItem key={j} value={String(j)}>
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t("datevUebergabe.export.hinweis")}</p>

          {/* What actually came out. `included` and `total` are two numbers on purpose: an archive
              that is short has to say so here rather than look complete on disk. */}
          {summary && (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm text-foreground">
                {t("datevUebergabe.export.ergebnis", {
                  included: summary.included,
                  total: summary.total,
                })}
              </p>
              {summary.omitted.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-warning">
                  {summary.omitted.slice(0, 8).map((o) => (
                    <li key={o.invoiceId}>{o.reason}</li>
                  ))}
                  {summary.omitted.length > 8 && (
                    <li className="text-muted-foreground">
                      {t("datevUebergabe.export.weitere", { count: summary.omitted.length - 8 })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("datevUebergabe.aktion.abbrechen")}
          </Button>
          <Button className="gap-2" onClick={() => void run()} disabled={busy || !companyId}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? t("datevUebergabe.export.laeuft") : t("datevUebergabe.export.starten")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
