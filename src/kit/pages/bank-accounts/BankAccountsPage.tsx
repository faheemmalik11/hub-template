import { useMemo, useState } from "react";

import { Combobox } from "../../ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import type {
  BankAccountRecord,
  BankReconciliationAdapter,
} from "../../adapters/bank-reconciliation";
import { englishBankAccountsLabels, type BankAccountsLabels } from "./labels";

export interface BankAccountsPageProps {
  adapter: Pick<
    BankReconciliationAdapter,
    "useAccounts" | "useCompanyOptions" | "formatMoney" | "formatDate"
  >;
  labels?: BankAccountsLabels;
}

function formatIban(iban: string | null): string {
  if (!iban) return "—";
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function BankAccountsPage({
  adapter,
  labels = englishBankAccountsLabels,
}: BankAccountsPageProps) {
  const accountsQuery = adapter.useAccounts();
  const companyOptionsQuery = adapter.useCompanyOptions?.();
  const [company, setCompany] = useState("");

  const rows: BankAccountRecord[] = useMemo(() => {
    return accountsQuery.data.filter((account) => !company || account.company_code === company);
  }, [accountsQuery.data, company]);

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      {companyOptionsQuery && (companyOptionsQuery.data?.length ?? 0) > 0 && (
        <div className="mt-6">
          <Combobox
            value={company}
            onValueChange={setCompany}
            className="w-full sm:w-56"
            options={[
              { value: "", label: labels.companyAll },
              ...companyOptionsQuery.data.map((c) => ({
                value: c.code,
                label: `${c.code} — ${c.name}`,
              })),
            ]}
          />
        </div>
      )}

      {accountsQuery.error ? (
        <div className="mt-4">
          <ErrorState error={accountsQuery.error} onRetry={() => {}} />
        </div>
      ) : accountsQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} columns={6} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{labels.columnAccount}</TableHead>
                <TableHead>{labels.columnCompany}</TableHead>
                <TableHead>{labels.columnIban}</TableHead>
                <TableHead>{labels.columnBank}</TableHead>
                <TableHead className="text-right">{labels.columnBalance}</TableHead>
                <TableHead>{labels.columnStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => (
                <TableRow key={account.id} className={cn(account.excluded_at && "opacity-60")}>
                  <TableCell className="font-medium text-foreground">
                    {account.account_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account.company_code ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {formatIban(account.iban)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {account.bank_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {adapter.formatMoney(account.balance)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                        account.excluded_at
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-100 text-emerald-800",
                      )}
                    >
                      {account.excluded_at ? labels.statusExcluded : labels.statusActive}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    {labels.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
