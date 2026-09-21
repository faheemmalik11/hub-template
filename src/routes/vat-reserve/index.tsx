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
import { useCompanies, useVatReserve, useVatReserveAll } from "@/data";
import { ErrorState } from "@/components/documents/query-states";
import { formatEUR } from "@/lib/data/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { LEER } from "@/components/assignment/rule-row";
import { pageTitle } from "@/config/brand";

/**
 * The recommended reserve, with its sign given a meaning.
 *
 * Every other figure on this screen is money the company owes. A negative reserve is the opposite:
 * deductible input VAT exceeded output VAT, so the company is owed money. Rendered in the same
 * plain foreground colour as everything else, "-829,34 €" reads like an error, or gets repeated as
 * "we owe minus 829 euro". So it gets its own colour and says what it means in words.
 */
function ReserveAmount({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation();
  // Not `< 0`: a reserve of exactly 0 is neither owed nor owing, and -0.004 rounds to "0,00 €",
  // which must not be labelled a refund.
  const reimbursement = Math.round(value * 100) < 0;
  return (
    <span className="block text-right">
      <span
        className={cn(
          "font-semibold tabular-nums",
          reimbursement ? "text-emerald-700" : "text-foreground",
          className,
        )}
      >
        {formatEUR(value)}
      </span>
      {reimbursement ? (
        <span className="mt-0.5 block text-xs font-normal text-emerald-700">
          {t("vatRules.ruecklage.erstattung")}
        </span>
      ) : null}
    </span>
  );
}

export const Route = createFileRoute("/vat-reserve/")({
  head: () => ({ meta: [{ title: pageTitle("Steuerrücklage") }] }),
  component: TaxReservePage,
});

// Tax reserve (Briefing Screen 5): a recommendation, never a booking. Split out of the former
// USt-Regeln tabs into its own page under the Steuern nav group. Always shown -- "Alle
// Gesellschaften" renders a per-company breakdown table instead of the single-company card,
// since each company owes VAT to its own Finanzamt separately; there is no one combined figure
// to show for "all companies" the way there is for one.
function TaxReservePage() {
  const { t } = useTranslation();
  const companiesQ = useCompanies();
  const [companyId, setCompanyId] = useState<string>(LEER);

  const companies = companiesQ.data ?? [];
  const reserveQ = useVatReserve(companyId === LEER ? null : companyId);
  const reserveAllQ = useVatReserveAll(companyId === LEER ? companies.map((g) => g.id) : []);
  const companyById = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g])),
    [companiesQ.data],
  );

  // Companies with money in play first, largest reserve on top; the all-zero rows exist (every
  // company must be visible, silence is information too) but sit muted at the bottom instead of
  // burying the two rows this screen is actually opened for.
  const rows = useMemo(() => {
    const rows = [...(reserveAllQ.data ?? [])];
    rows.sort(
      (a, b) => Math.abs(b.reserve) - Math.abs(a.reserve) || b.input_vat_total - a.input_vat_total,
    );
    return rows;
  }, [reserveAllQ.data]);
  const hatMovement = (r: (typeof rows)[number]) =>
    [r.input_vat_total, r.output_vat, r.reserve].some((v) => Math.round(v * 100) !== 0) ||
    r.input_vat_unresolved_count > 0;
  const kpi = useMemo(() => {
    const rows = reserveAllQ.data ?? [];
    return {
      due: rows.filter((r) => Math.round(r.reserve * 100) > 0).length,
      reimbursement: rows.filter((r) => Math.round(r.reserve * 100) < 0).length,
      unresolvedDocuments: rows.reduce((n, r) => n + r.input_vat_unresolved_count, 0),
      unresolvedAmount: rows.reduce((n, r) => n + r.input_vat_unresolved_amount, 0),
    };
  }, [reserveAllQ.data]);

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("vatRules.ruecklage.titel")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("vatRules.ruecklage.hinweis")}
      </p>

      <div data-tour="vat-company" className="mt-6 w-full max-w-xs space-y-1.5">
        <Label>{t("vatRules.gesellschaft")}</Label>
        <Combobox
          value={companyId}
          onValueChange={setCompanyId}
          options={[
            { value: LEER, label: t("vatRules.alleGesellschaften") },
            ...companies.map((g) => ({
              value: g.id,
              label: `${g.code} · ${g.name}`,
              keywords: g.name,
            })),
          ]}
        />
      </div>

      <div data-tour="vat-reserve" className="mt-6">
        {companyId !== LEER ? (
          reserveQ.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : reserveQ.isError ? (
            <ErrorState error={reserveQ.error} onRetry={() => reserveQ.refetch()} />
          ) : reserveQ.data ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs text-muted-foreground">{t("vatRules.ruecklage.gesamt")}</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {formatEUR(reserveQ.data.input_vat_total)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("vatRules.ruecklage.abzugsfaehig")}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {formatEUR(reserveQ.data.input_vat_deductible)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("vatRules.ruecklage.nichtAbzugsfaehig")}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {formatEUR(reserveQ.data.input_vat_nondeductible)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("vatRules.ruecklage.umsatzsteuer")}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {formatEUR(reserveQ.data.output_vat)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t("vatRules.ruecklage.ruecklage")}
                  </p>
                  <ReserveAmount value={reserveQ.data.reserve} className="text-lg" />
                </div>
              </div>
              {reserveQ.data.input_vat_unresolved_count > 0 ? (
                <p className="mt-3 text-xs text-amber-700">
                  {t("vatRules.ruecklage.unresolved", {
                    count: reserveQ.data.input_vat_unresolved_count,
                    amount: formatEUR(reserveQ.data.input_vat_unresolved_amount),
                  })}
                </p>
              ) : null}
            </div>
          ) : null
        ) : reserveAllQ.isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : reserveAllQ.isError ? (
          <ErrorState error={reserveAllQ.error} onRetry={() => reserveAllQ.refetch()} />
        ) : (reserveAllQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("vatRules.ruecklage.leer")}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {t("vatRules.ruecklage.kpiFaellig")}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                  {kpi.due}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {t("vatRules.ruecklage.kpiErstattung")}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-700">
                  {kpi.reimbursement}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {t("vatRules.ruecklage.kpiUngeklaert")}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-semibold tabular-nums",
                    kpi.unresolvedDocuments > 0 ? "text-amber-700" : "text-foreground",
                  )}
                >
                  {kpi.unresolvedDocuments}
                  {kpi.unresolvedDocuments > 0 ? (
                    <span className="ml-1.5 text-xs font-normal">
                      ({formatEUR(kpi.unresolvedAmount)})
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("vatRules.gesellschaft")}</TableHead>
                    <TableHead className="text-right">{t("vatRules.ruecklage.gesamt")}</TableHead>
                    <TableHead className="text-right">
                      {t("vatRules.ruecklage.abzugsfaehig")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("vatRules.ruecklage.nichtAbzugsfaehig")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("vatRules.ruecklage.umsatzsteuer")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("vatRules.ruecklage.ruecklage")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.company_id} className={cn(!hatMovement(r) && "opacity-50")}>
                      <TableCell className="font-medium text-foreground">
                        {(() => {
                          const g = companyById.get(r.company_id);
                          return g ? `${g.code} · ${g.name}` : r.company_id;
                        })()}
                      </TableCell>
                      {/* The gap is HERE, not down at the reserve: "davon abzugsfähig" plus
                          "davon nicht abzugsfähig" do not add up to this figure whenever some
                          invoices have no resolved deductibility yet. The note sits under the
                          number it is about, always visible, in the same words the
                          single-company view already uses. */}
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(r.input_vat_total)}
                        {r.input_vat_unresolved_count > 0 ? (
                          <span className="mt-0.5 block text-xs font-normal text-amber-700">
                            {t("vatRules.ruecklage.unresolvedKurz", {
                              count: r.input_vat_unresolved_count,
                              amount: formatEUR(r.input_vat_unresolved_amount),
                            })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(r.input_vat_deductible)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(r.input_vat_nondeductible)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(r.output_vat)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <ReserveAmount value={r.reserve} className="text-sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 space-y-3 sm:hidden">
              {rows.map((r) => {
                const g = companyById.get(r.company_id);
                const name = g ? `${g.code} · ${g.name}` : r.company_id;
                return (
                  // A section with a name, not an anonymous div: on a phone this card IS the
                  // row, and without a label a screen reader reads five bare amounts with
                  // nothing saying which company they belong to.
                  <section
                    key={r.company_id}
                    aria-label={name}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4",
                      !hatMovement(r) && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{name}</span>
                      <ReserveAmount value={r.reserve} className="text-sm" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("vatRules.ruecklage.ruecklage")}
                    </p>
                    {/* The whole reason this is text and not a ⚠ with a `title`: a phone has
                        no hover, so the tooltip that used to carry this could not be opened
                        at all. It was an icon that did nothing. */}
                    {r.input_vat_unresolved_count > 0 ? (
                      <p className="mt-2 text-xs text-amber-700">
                        {t("vatRules.ruecklage.unresolved", {
                          count: r.input_vat_unresolved_count,
                          amount: formatEUR(r.input_vat_unresolved_amount),
                        })}
                      </p>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{t("vatRules.ruecklage.gesamt")}</dt>
                        <dd className="tabular-nums text-foreground">
                          {formatEUR(r.input_vat_total)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t("vatRules.ruecklage.abzugsfaehig")}
                        </dt>
                        <dd className="tabular-nums text-foreground">
                          {formatEUR(r.input_vat_deductible)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t("vatRules.ruecklage.nichtAbzugsfaehig")}
                        </dt>
                        <dd className="tabular-nums text-foreground">
                          {formatEUR(r.input_vat_nondeductible)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t("vatRules.ruecklage.umsatzsteuer")}
                        </dt>
                        <dd className="tabular-nums text-foreground">{formatEUR(r.output_vat)}</dd>
                      </div>
                    </dl>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
