import { useMemo, useState } from "react";

import { Label } from "../../ui/label";
import { Field } from "../../ui/field";
import { Combobox } from "../../ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { EmptyState, ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { VatRulesAdapter } from "../../adapters/vat-rules";
import { englishVatRulesLabels, type VatRulesLabels } from "./labels";
import { NewVatRuleDialog } from "./new-rule-dialog";
import { RuleCard, RuleRow, type ScopeNameMaps } from "./rule-row";

const NONE = "__none";

// A negative reserve means deductible input VAT exceeded output VAT: the company is owed money.
// It gets its own colour and says so in words, so "-829.34" cannot read like an error.
function ReserveAmount({
  value,
  formatters,
  labels,
  className,
}: {
  value: number;
  formatters: Formatters;
  labels: VatRulesLabels;
  className?: string;
}) {
  // Not `< 0`: a reserve of exactly 0 is neither owed nor owing, and -0.004 rounds to "0.00".
  const isRefund = Math.round(value * 100) < 0;
  return (
    <span className="block text-right">
      <span
        className={cn(
          "font-semibold tabular-nums",
          isRefund ? "text-success" : "text-foreground",
          className,
        )}
      >
        {formatters.formatMoney(value)}
      </span>
      {isRefund ? (
        <span className="mt-0.5 block text-xs font-normal text-success">
          {labels.reserve.refund}
        </span>
      ) : null}
    </span>
  );
}

export interface VatRulesPageProps {
  adapter: VatRulesAdapter;
  labels?: VatRulesLabels;
  formatters?: Formatters;
}

export function VatRulesPage({
  adapter,
  labels = englishVatRulesLabels,
  formatters = englishFormatters,
}: VatRulesPageProps) {
  const companiesQuery = adapter.useCompanies();
  const suppliersQuery = adapter.useSuppliers();
  const propertiesQuery = adapter.useProperties();
  const rulesQuery = adapter.useVatRules();
  const [companyId, setCompanyId] = useState(NONE);

  const companies = companiesQuery.data ?? [];
  // "All companies": each company owes VAT to its own tax office separately, so that view is a
  // per-company breakdown table, not a single combined figure.
  const reserveQuery = adapter.useVatReserve(companyId === NONE ? null : companyId);
  const reserveAllQuery = adapter.useVatReserveForCompanies(
    companyId === NONE ? companies.map((company) => company.id) : [],
  );
  const companyLabelById = useMemo(
    () => new Map(companies.map((company) => [company.id, `${company.code} · ${company.name}`])),
    [companies],
  );
  const scopeNameMaps: ScopeNameMaps = useMemo(
    () => ({
      supplierNameById: new Map(
        (suppliersQuery.data ?? []).map((supplier) => [supplier.id, supplier.name]),
      ),
      propertyLabelById: new Map(
        (propertiesQuery.data ?? []).map((property) => [
          property.id,
          property.name ? `${property.code} · ${property.name}` : property.code,
        ]),
      ),
      companyLabelById,
    }),
    [suppliersQuery.data, propertiesQuery.data, companyLabelById],
  );

  const vatRules = rulesQuery.data ?? [];
  const scopedRules = useMemo(
    () =>
      vatRules.filter(
        (rule) => companyId === NONE || rule.companyId === companyId || rule.companyId === null,
      ),
    [vatRules, companyId],
  );

  const scopeCounts = useMemo(
    () => ({
      supplier: scopedRules.filter((rule) => rule.supplierId).length,
      property: scopedRules.filter((rule) => rule.propertyId).length,
      company: scopedRules.filter((rule) => rule.companyId).length,
      global: scopedRules.filter((rule) => rule.companyId === null).length,
    }),
    [scopedRules],
  );

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{labels.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>

      {/* Lifted to page level on purpose, so the selection survives a tab switch. */}
      <Field className="mt-6 w-full max-w-xs space-y-1.5">
        <Label>{labels.companyLabel}</Label>
        <Combobox
          value={companyId}
          onValueChange={setCompanyId}
          options={[
            { value: NONE, label: labels.allCompanies },
            ...companies.map((company) => ({
              value: company.id,
              label: `${company.code} · ${company.name}`,
              keywords: company.name,
            })),
          ]}
        />
      </Field>

      <Tabs defaultValue="rules" className="mt-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="rules">{labels.rulesTab}</TabsTrigger>
          <TabsTrigger value="reserve">{labels.reserveTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
            <p className="max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {labels.rulesHint}
            </p>
            <div className="w-full sm:w-auto sm:shrink-0">
              <NewVatRuleDialog
                adapter={adapter}
                labels={labels}
                defaultCompanyId={companyId === NONE ? undefined : companyId}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {labels.countBySupplier(scopeCounts.supplier)}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {labels.countByProperty(scopeCounts.property)}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {labels.countByCompany(scopeCounts.company)}
            </span>
            <span className="rounded border border-border bg-muted/50 px-2 py-1">
              {labels.countGlobal(scopeCounts.global)}
            </span>
          </div>

          {rulesQuery.isError ? (
            <ErrorState error={rulesQuery.error} onRetry={rulesQuery.refetch} />
          ) : rulesQuery.isLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : scopedRules.length === 0 ? (
            <EmptyState title={labels.empty} hint={labels.emptyHint} />
          ) : (
            <>
              <div className="hidden rounded-xl border border-border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{labels.columns.value}</TableHead>
                      <TableHead>{labels.columns.scope}</TableHead>
                      <TableHead className="text-right">{labels.columns.effect}</TableHead>
                      <TableHead>{labels.columns.active}</TableHead>
                      <TableHead className="text-right">{labels.columns.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedRules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        maps={scopeNameMaps}
                        adapter={adapter}
                        labels={labels}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 sm:hidden">
                {scopedRules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    maps={scopeNameMaps}
                    adapter={adapter}
                    labels={labels}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* The reserve is a READ of what the rules produced — a recommendation, never a booking. */}
        <TabsContent value="reserve" className="mt-4">
          <div className="rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {labels.reserve.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{labels.reserve.hint}</p>

            {companyId !== NONE ? (
              reserveQuery.isLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">…</p>
              ) : reserveQuery.isError ? (
                <ErrorState error={reserveQuery.error} onRetry={reserveQuery.refetch} />
              ) : reserveQuery.data ? (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {labels.reserve.totalInputVat}
                      </p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {formatters.formatMoney(reserveQuery.data.inputVatTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{labels.reserve.deductible}</p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {formatters.formatMoney(reserveQuery.data.inputVatDeductible)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {labels.reserve.nondeductible}
                      </p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {formatters.formatMoney(reserveQuery.data.inputVatNondeductible)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{labels.reserve.outputVat}</p>
                      <p className="text-lg font-semibold text-foreground tabular-nums">
                        {formatters.formatMoney(reserveQuery.data.outputVat)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {labels.reserve.reserveAmount}
                      </p>
                      <ReserveAmount
                        value={reserveQuery.data.reserve}
                        formatters={formatters}
                        labels={labels}
                        className="text-lg"
                      />
                    </div>
                  </div>
                  {reserveQuery.data.unresolvedCount > 0 ? (
                    <p className="mt-3 text-xs text-warning">
                      {labels.reserve.unresolved(
                        reserveQuery.data.unresolvedCount,
                        formatters.formatMoney(reserveQuery.data.unresolvedAmount),
                      )}
                    </p>
                  ) : null}
                </>
              ) : null
            ) : reserveAllQuery.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">…</p>
            ) : reserveAllQuery.isError ? (
              <ErrorState error={reserveAllQuery.error} onRetry={reserveAllQuery.refetch} />
            ) : (reserveAllQuery.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {labels.reserve.emptyAllCompanies}
              </p>
            ) : (
              <>
                <div className="mt-3 hidden rounded-lg border border-border sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{labels.companyLabel}</TableHead>
                        <TableHead className="text-right">{labels.reserve.totalInputVat}</TableHead>
                        <TableHead className="text-right">{labels.reserve.deductible}</TableHead>
                        <TableHead className="text-right">{labels.reserve.nondeductible}</TableHead>
                        <TableHead className="text-right">{labels.reserve.outputVat}</TableHead>
                        <TableHead className="text-right">{labels.reserve.reserveAmount}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(reserveAllQuery.data ?? []).map((row) => (
                        <TableRow key={row.companyId}>
                          <TableCell className="font-medium text-foreground">
                            {companyLabelById.get(row.companyId) ?? row.companyId}
                          </TableCell>
                          {/* The unresolved gap sits under the total it is about, always visible. */}
                          <TableCell className="text-right tabular-nums">
                            {formatters.formatMoney(row.inputVatTotal)}
                            {row.unresolvedCount > 0 ? (
                              <span className="mt-0.5 block text-xs font-normal text-warning">
                                {labels.reserve.unresolvedShort(
                                  row.unresolvedCount,
                                  formatters.formatMoney(row.unresolvedAmount),
                                )}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatters.formatMoney(row.inputVatDeductible)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatters.formatMoney(row.inputVatNondeductible)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatters.formatMoney(row.outputVat)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            <ReserveAmount
                              value={row.reserve}
                              formatters={formatters}
                              labels={labels}
                              className="text-sm"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 space-y-3 sm:hidden">
                  {(reserveAllQuery.data ?? []).map((row) => {
                    const companyName = companyLabelById.get(row.companyId) ?? row.companyId;
                    return (
                      <section
                        key={row.companyId}
                        aria-label={companyName}
                        className="rounded-xl border border-border bg-card p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-foreground">{companyName}</span>
                          <ReserveAmount
                            value={row.reserve}
                            formatters={formatters}
                            labels={labels}
                            className="text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {labels.reserve.reserveAmount}
                        </p>
                        {row.unresolvedCount > 0 ? (
                          <p className="mt-2 text-xs text-warning">
                            {labels.reserve.unresolved(
                              row.unresolvedCount,
                              formatters.formatMoney(row.unresolvedAmount),
                            )}
                          </p>
                        ) : null}
                        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">
                              {labels.reserve.totalInputVat}
                            </dt>
                            <dd className="text-foreground tabular-nums">
                              {formatters.formatMoney(row.inputVatTotal)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{labels.reserve.deductible}</dt>
                            <dd className="text-foreground tabular-nums">
                              {formatters.formatMoney(row.inputVatDeductible)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              {labels.reserve.nondeductible}
                            </dt>
                            <dd className="text-foreground tabular-nums">
                              {formatters.formatMoney(row.inputVatNondeductible)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">{labels.reserve.outputVat}</dt>
                            <dd className="text-foreground tabular-nums">
                              {formatters.formatMoney(row.outputVat)}
                            </dd>
                          </div>
                        </dl>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
