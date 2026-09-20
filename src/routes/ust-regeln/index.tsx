import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAssignmentRules, useGesellschaften, useVatReserve, useVatReserveAll } from "@/data";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { formatEUR } from "@/lib/data/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { NeueRegelDialog } from "@/components/zuordnung/neue-regel-dialog";
import { LEER, RegelKarte, RegelZeile } from "@/components/zuordnung/regel-zeile";
import { pageTitle } from "@/config/brand";

/**
 * The recommended reserve, with its sign given a meaning.
 *
 * Every other figure on this screen is money the company owes. A negative reserve is the opposite:
 * deductible input VAT exceeded output VAT, so the company is owed money. Rendered in the same
 * plain foreground colour as everything else, "-829,34 €" reads like an error, or gets repeated as
 * "we owe minus 829 euro". So it gets its own colour and says what it means in words.
 */
function ReserveBetrag({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation();
  // Not `< 0`: a reserve of exactly 0 is neither owed nor owing, and -0.004 rounds to "0,00 €",
  // which must not be labelled a refund.
  const erstattung = Math.round(value * 100) < 0;
  return (
    <span className="block text-right">
      <span
        className={cn(
          "font-semibold tabular-nums",
          erstattung ? "text-emerald-700" : "text-foreground",
          className,
        )}
      >
        {formatEUR(value)}
      </span>
      {erstattung ? (
        <span className="mt-0.5 block text-xs font-normal text-emerald-700">
          {t("ustRegeln.ruecklage.erstattung")}
        </span>
      ) : null}
    </span>
  );
}

export const Route = createFileRoute("/ust-regeln/")({
  validateSearch: tabSearch,
  head: () => ({ meta: [{ title: pageTitle("USt-Regeln & Steuerrücklage") }] }),
  component: UstRegelnPage,
});

// Standalone Master Data page: VAT rate, tax treatment and deductibility are a different concern
// from cost categories and get their own nav entry rather than living as a tab on Zuordnungsregeln.
// Two tabs, because the reserve is a READ of what the rules produced, not another rule list.
function UstRegelnPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(["regeln", "ruecklage"] as const, "regeln");
  const companiesQ = useGesellschaften();
  const rulesQ = useAssignmentRules();
  const [companyId, setCompanyId] = useState<string>(LEER);

  const companies = companiesQ.data ?? [];
  // "Alle Gesellschaften": each company owes VAT to its own Finanzamt separately, so this is a
  // per-company breakdown table, not a single combined figure. See useVatReserveAll.
  const reserveQ = useVatReserve(companyId === LEER ? null : companyId);
  const reserveAllQ = useVatReserveAll(companyId === LEER ? companies.map((g) => g.id) : []);
  const companyById = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g])),
    [companiesQ.data],
  );

  const vatRules = useMemo(
    () => (rulesQ.data ?? []).filter((r) => r.target === "vat_rate"),
    [rulesQ.data],
  );
  const scopedRules = useMemo(
    () =>
      vatRules.filter(
        (r) => companyId === LEER || r.company_id === companyId || r.company_id === null,
      ),
    [vatRules, companyId],
  );

  // "at company level you see it summed up" (briefing): how many VAT rules are pinned at each
  // scope dimension, derived from the already-loaded rule list rather than a new query.
  const scopeCounts = useMemo(
    () => ({
      lieferant: scopedRules.filter((r) => r.supplier_id).length,
      objekt: scopedRules.filter((r) => r.property_id).length,
      gesellschaft: scopedRules.filter((r) => r.company_id).length,
      global: scopedRules.filter((r) => r.company_id === null).length,
    }),
    [scopedRules],
  );

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("ustRegeln.list.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("ustRegeln.list.subtitle")}</p>

      {/* The company selector is lifted to page level on purpose, so it survives a tab switch
          instead of each tab owning its own and losing it. */}
      <div data-tour="vat-company" className="mt-6 w-full max-w-xs space-y-1.5">
        <Label>{t("ustRegeln.gesellschaft")}</Label>
        <Combobox
          value={companyId}
          onValueChange={setCompanyId}
          options={[
            { value: LEER, label: t("ustRegeln.alleGesellschaften") },
            ...companies.map((g) => ({
              value: g.id,
              label: `${g.code} · ${g.name}`,
              keywords: g.name,
            })),
          ]}
        />
      </div>

      <div data-tour="vat-rules" className="mt-6">
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <p className="max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t("ustRegeln.hinweis")}
            </p>
            <div className="w-full sm:w-auto sm:shrink-0">
              <NeueRegelDialog
                defaultCompanyId={companyId === LEER ? undefined : companyId}
                fixedTarget="vat_rate"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {t("ustRegeln.anzahl.lieferant", { count: scopeCounts.lieferant })}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {t("ustRegeln.anzahl.objekt", { count: scopeCounts.objekt })}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {t("ustRegeln.anzahl.gesellschaft", { count: scopeCounts.gesellschaft })}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {t("ustRegeln.anzahl.global", { count: scopeCounts.global })}
            </span>
          </div>

          {rulesQ.isError ? (
            <ErrorState error={rulesQ.error} onRetry={() => rulesQ.refetch()} />
          ) : rulesQ.isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : scopedRules.length === 0 ? (
            <EmptyState title={t("ustRegeln.empty")} hint={t("ustRegeln.emptyHint")} />
          ) : (
            <>
              <div className="hidden rounded-xl border border-border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("zuordnungsregeln.col.wert")}</TableHead>
                      <TableHead>{t("zuordnungsregeln.col.geltungsbereich")}</TableHead>
                      <TableHead className="text-right">
                        {t("zuordnungsregeln.col.wirkung")}
                      </TableHead>
                      <TableHead>{t("zuordnungsregeln.col.aktiv")}</TableHead>
                      <TableHead className="text-right">
                        {t("zuordnungsregeln.col.aktionen")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedRules.map((r) => (
                      <RegelZeile key={r.id} rule={r} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 sm:hidden">
                {scopedRules.map((r) => (
                  <RegelKarte key={r.id} rule={r} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
