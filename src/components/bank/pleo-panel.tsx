import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { usePleoEmployees } from "@/data";
import type { BankAccount } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";

/**
 * Pleo, as the people who have an account there.
 *
 * WHERE THE DATA COMES FROM. Live from Pleo, through the `pleo-employees` Edge Function, and not
 * from our tables. This list used to be built by aggregating `bank_transactions` -- which meant it
 * could only ever contain people who had SPENT. A colleague holding a card they have never used was
 * invisible, and that is precisely the thing worth seeing on a screen about who has a card.
 *
 * Everything about spend stays where `pleo-sync` already puts it. Fetching that live as well would
 * only produce a second answer to a question the database already answers, and the two would
 * disagree between syncs.
 *
 * WHAT PLEO CANNOT TELL US. Cards. Their public API has no cards endpoint at all: the documented
 * families are accounting entries, export, tags, tax codes, webhooks, employees and the app
 * marketplace. `GET /v2/employees` is the closest thing, and it carries no card number, no status
 * and no limit. So this is a list of people, and it does not claim to be a list of cards.
 */
export function PleoPanel({
  programs,
  search,
}: {
  /** The Pleo `bank_accounts` rows. Only their presence is used, to decide the tab exists at all. */
  programs: BankAccount[];
  /** Owned by the page: the search box renders on the tab row, not inside this panel. */
  search: string;
}) {
  const { t } = useTranslation();
  const employeesQ = usePleoEmployees(programs.length > 0);

  const all = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) =>
      [e.firstName, e.lastName, e.email, e.jobTitle, e.code]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [all, search]);

  // Job title and code are optional on Pleo's side, and on this company they may be set on nobody.
  // A column of dashes says less than no column, so each one appears only once something fills it.
  const showJobTitle = all.some((e) => e.jobTitle);
  const showCode = all.some((e) => e.code);

  if (programs.length === 0) return null;

  const name = (e: { firstName: string | null; lastName: string | null }) =>
    [e.firstName, e.lastName].filter(Boolean).join(" ").trim();

  return (
    <div>
      <div>
        {employeesQ.isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : employeesQ.isError ? (
          // Named rather than swallowed: the likeliest cause is that the Pleo API key does not
          // carry the `users:read` scope this endpoint needs, and the message says which it is.
          <ErrorState error={employeesQ.error} onRetry={() => employeesQ.refetch()} />
        ) : all.length === 0 ? (
          <EmptyState title={t("bankAccounts.karten.keineMitarbeiter")} />
        ) : filtered.length === 0 ? (
          <div>
            <EmptyState title={t("bankAccounts.keineTreffer.title")} />
            {/* No reset button: the search box that narrowed this lives on the tab row above,
                where clearing it is one click away and visible. */}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("bankAccounts.karten.col.mitarbeiter")}</TableHead>
                  <TableHead>{t("bankAccounts.karten.col.email")}</TableHead>
                  {showJobTitle && <TableHead>{t("bankAccounts.karten.col.position")}</TableHead>}
                  {showCode && <TableHead>{t("bankAccounts.karten.col.code")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm font-medium text-foreground">
                      {name(e) || (
                        // Pleo has the account but no name on it. Not a dash: an unnamed
                        // cardholder is a thing to fix in Pleo, not an empty cell to skim past.
                        <span className="font-normal text-muted-foreground">
                          {t("bankAccounts.karten.ohneName")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.email ?? "—"}
                    </TableCell>
                    {showJobTitle && (
                      <TableCell className="text-sm text-muted-foreground">
                        {e.jobTitle ?? "—"}
                      </TableCell>
                    )}
                    {showCode && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.code ?? "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
