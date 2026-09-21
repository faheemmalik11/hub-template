import { Fragment } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BankAccount } from "@/lib/data/types";
import { BankAccountDialog } from "@/components/bank/bank-account-dialog";
import { AccountActiveSwitch } from "@/components/bank/account-active-switch";
import { ConnectionGroupRow, type AccountGroup } from "@/components/bank/connection-group-row";
import { banksapiState, type BanksapiState } from "@/components/bank/banksapi-state";
import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { CompanyChip } from "@/components/documents/badges";
import { formatIBAN } from "@/lib/data/format";
import type { SortDir } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";

/**
 * The accounts table: Konto, Gesellschaft, IBAN, Art, Anbindung, Aktionen, optionally grouped under
 * the bank connection that delivers each account.
 *
 * Lifted out of the route so the page component is layout and state, and so the grouped desktop
 * table and the stacked mobile list are declared next to each other. They render the same fields
 * from the same context object, which is what keeps them from drifting apart the way the previous
 * two copies did.
 */

/** Everything a row or a card needs that is not the account itself. */
export type RowsContext = {
  companyById: Map<string, { code: string; name: string }>;
  showBankColumn: boolean;
  /**
   * Whether the Anbindung column earns its place. On the manual tab nothing is connected by
   * definition, so the column would read the same on every row: a column's worth of width spent on
   * a constant, the same reason Kreditinstitut is conditional.
   */
  showConnection: boolean;
  bankNameOf: (a: BankAccount) => string;
  /** Switching a single account off: bank_accounts.remove. */
  canRemove: boolean;
  /**
   * Disconnecting a whole bank: page.bankverbindungen, "Manage bank connections". The same right
   * that connects one, and the one bank-disconnect enforces, so the button and the server agree.
   */
  canUnlink: boolean;
};

type T = ReturnType<typeof useTranslation>["t"];

/**
 * "No company" is not a neutral blank on this table.
 *
 * propagate_account_company (migration 0025) copies the account's company_id onto its
 * bank_transactions, and bank_transactions_select is has_company_access(company_id) -- which
 * returns TRUE for null by design ("a receipt not assigned to a company yet has to stay visible to
 * every reviewer"). That rule was written for unassigned receipts in the intake queue; applied to a
 * bank account it means every movement on it is readable by every authenticated user, including
 * someone restricted to a single company. All 12 live accounts have a company today, so this is one
 * blank field away rather than currently broken, which is exactly why the field is worth marking.
 */
function NoCompany({ t }: { t: T }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning"
      title={t("bankAccounts.ohneGesellschaftTitle")}
    >
      <AlertTriangle className="size-3 shrink-0" />
      {t("bankAccounts.keineGesellschaft")}
    </span>
  );
}

function SandboxBadge({ t }: { t: T }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
      title={t("bankAccounts.sandboxTitle")}
    >
      {t("bankAccounts.sandbox")}
    </span>
  );
}

// A dot and a word, not a filled chip. Connection state is one column among six and it is
// "connected" on nearly every row, so a coloured pill per row was colour spent on the answer
// everybody already expects; the exceptions are what needs to stand out.
const CONNECTION: Record<BanksapiState, { dot: string; text: string; key: string }> = {
  connected: { dot: "bg-success", text: "text-muted-foreground", key: "banksapiVerbunden" },
  linkable: { dot: "bg-brand-dark", text: "text-muted-foreground", key: "banksapiJa" },
  none: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", key: "banksapiNein" },
};

function ConnectionStatus({ state, t }: { state: BanksapiState; t: T }) {
  const style = CONNECTION[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", style.text)}
      title={t(`bankAccounts.${style.key}Title`)}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
      {t(`bankAccounts.${style.key}`)}
    </span>
  );
}

const LEGAL_FORMS = new Map<string, string>([
  ["gmbh", "GmbH"],
  ["mbh", "mbH"],
  ["ag", "AG"],
  ["kg", "KG"],
  ["ohg", "OHG"],
  ["se", "SE"],
  ["ug", "UG"],
  ["ev", "e.V."],
  ["co", "Co."],
]);

/** The account holder, unless it only repeats the company already named beside it. */
function shownHolder(holder: string | null, companyName: string | undefined): string | null {
  const value = (holder ?? "").trim();
  if (!value) return null;
  const letters = (v: string) => v.toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  if (companyName && letters(value) === letters(companyName)) return null;
  if (value !== value.toUpperCase()) return value;
  return value.replace(/\p{L}+/gu, (word) => {
    const legal = LEGAL_FORMS.get(word.toLowerCase());
    return legal ?? word[0] + word.slice(1).toLowerCase();
  });
}

function AccountActions({ a, ctx }: { a: BankAccount; ctx: RowsContext }) {
  return (
    <>
      {/* On/off and nothing else. There is no delete here on purpose: a provider-fed account cannot
          be deleted at BANKSapi (no per-account DELETE exists, so the next sync upserts it back),
          and the destructive "Konto entfernen" it used to sit beside purged the movements along
          with their invoice matches and receipt files. Switching an account off achieves what
          people actually wanted from delete -- stop importing this -- and is reversible.

          The switch covers manual accounts too, now that it is the only way to take one out of
          use. `excludeBankAccount` and its restore path still exist for the accounts removed before
          this change; they are reachable through Filter, Status, Entfernt. */}
      {ctx.canRemove && <AccountActiveSwitch account={a} />}
      <BankAccountDialog account={a} />
    </>
  );
}

function AccountRow({ a, indented, ctx }: { a: BankAccount; indented: boolean; ctx: RowsContext }) {
  const { t } = useTranslation();
  const { companyById, showBankColumn, bankNameOf } = ctx;
  const company = a.company_id ? companyById.get(a.company_id) : undefined;
  const holder = shownHolder(a.holder, company?.name);
  return (
    <TableRow>
      <TableCell
        className={cn(
          "text-sm font-medium text-foreground",
          // Indented under its connection, with a left rule, so the nesting still reads once the
          // group header has scrolled out of view.
          indented && "border-l-2 border-border pl-6",
        )}
      >
        {/* No "Name doppelt" badge here any more. account_name is BANKSapi's product category
            rather than a name, so live it collides on ten of the twelve rows, and a badge on nearly
            every row is a badge that has stopped meaning anything while still competing with the
            name it comments on. The fact is stated once in the count line above the table, where it
            reads as one thing to fix rather than ten things to ignore. */}
        <span className="inline-flex flex-wrap items-center gap-2">
          {/* Switched off reads at a glance, without spending a badge on it: the name is struck
              through and dimmed, the way the rest of the app shows a row that is still there but
              no longer counts. */}
          <span
            className={cn(a.is_active === false && "text-muted-foreground line-through")}
            title={a.is_active === false ? t("bankAccounts.aktiv.inaktivTitle") : undefined}
          >
            {a.account_name ?? "—"}
          </span>
          {a.is_sandbox && <SandboxBadge t={t} />}
        </span>
        {holder && <p className="mt-0.5 text-xs font-normal text-muted-foreground">{holder}</p>}
      </TableCell>
      <TableCell>
        {company ? (
          <span className="inline-flex items-center gap-2">
            <CompanyChip code={company.code} />
            <span className="text-sm text-muted-foreground">{company.name}</span>
          </span>
        ) : (
          <NoCompany t={t} />
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
        {formatIBAN(a.iban)}
      </TableCell>
      {showBankColumn && (
        <TableCell className="text-sm text-muted-foreground">{bankNameOf(a)}</TableCell>
      )}
      <TableCell className="text-sm text-muted-foreground">{a.product_type ?? "—"}</TableCell>
      {ctx.showConnection && (
        <TableCell>
          <ConnectionStatus state={banksapiState(a)} t={t} />
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          <AccountActions a={a} ctx={ctx} />
        </div>
      </TableCell>
    </TableRow>
  );
}

// The mobile card. Same fields as a row, stacked, because an IBAN cannot be truncated -- a
// partial one is useless -- and six data columns plus an action do not survive a phone width.
function AccountCard({ a, ctx }: { a: BankAccount; ctx: RowsContext }) {
  const { t } = useTranslation();
  const { companyById, bankNameOf } = ctx;
  const company = a.company_id ? companyById.get(a.company_id) : undefined;
  const holder = shownHolder(a.holder, company?.name);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium text-foreground",
                a.is_active === false && "text-muted-foreground line-through",
              )}
              title={a.is_active === false ? t("bankAccounts.aktiv.inaktivTitle") : undefined}
            >
              {a.account_name ?? "—"}
            </span>
            {a.is_sandbox && <SandboxBadge t={t} />}
          </div>
          {holder && <p className="mt-0.5 truncate text-xs text-muted-foreground">{holder}</p>}
          <div className="mt-1">
            {company ? (
              <span className="inline-flex items-center gap-2">
                <CompanyChip code={company.code} />
                <span className="text-sm text-muted-foreground">{company.name}</span>
              </span>
            ) : (
              <NoCompany t={t} />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <AccountActions a={a} ctx={ctx} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("bankAccounts.col.iban")}</dt>
          <dd className="mt-0.5 font-mono tabular-nums text-foreground">{formatIBAN(a.iban)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("bankAccounts.col.bank")}</dt>
          <dd className="mt-0.5 truncate text-foreground">{bankNameOf(a)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("bankAccounts.col.art")}</dt>
          <dd className="mt-0.5 truncate text-foreground">{a.product_type ?? "—"}</dd>
        </div>
      </dl>
      {ctx.showConnection && (
        <div className="mt-3 border-t border-border pt-2">
          <ConnectionStatus state={banksapiState(a)} t={t} />
        </div>
      )}
    </div>
  );
}

export function BankAccountsTable({
  grouped,
  groups,
  accounts,
  expanded,
  allOpen,
  onToggleGroup,
  sort,
  dir,
  onSort,
  ctx,
}: {
  grouped: boolean;
  groups: { group: AccountGroup; accounts: BankAccount[] }[];
  /** The flat list, used when there is no connection layer to group by. */
  accounts: BankAccount[];
  /** Group keys the reader has opened. Everything starts closed. */
  expanded: Set<string>;
  /**
   * Force every group open. Set while a search or filter is on: collapsed groups would hide the
   * very matches the reader just asked for, and the count on the header would be the only clue
   * anything was found.
   */
  allOpen: boolean;
  onToggleGroup: (key: string) => void;
  sort: string;
  dir: SortDir;
  onSort: (column: string) => void;
  ctx: RowsContext;
}) {
  const { t } = useTranslation();
  // Konto, Gesellschaft, IBAN, [Kreditinstitut], Art, [Anbindung], Aktionen.
  const columns = 5 + (ctx.showBankColumn ? 1 : 0) + (ctx.showConnection ? 1 : 0);

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {/* Sorting lives on the headers, where the column being sorted and the control that
                  sorts it are the same thing. Grouped, it orders WITHIN each bank, which is the
                  only ordering that can coexist with the grouping. */}
              <SortableColumnHeader column="konto" sort={sort} dir={dir} onSort={onSort}>
                {t("bankAccounts.col.konto")}
              </SortableColumnHeader>
              <SortableColumnHeader column="gesellschaft" sort={sort} dir={dir} onSort={onSort}>
                {t("bankAccounts.col.gesellschaft")}
              </SortableColumnHeader>
              <TableHead>{t("bankAccounts.col.iban")}</TableHead>
              {ctx.showBankColumn && <TableHead>{t("bankAccounts.col.bank")}</TableHead>}
              <TableHead>{t("bankAccounts.col.art")}</TableHead>
              {ctx.showConnection && <TableHead>{t("bankAccounts.col.anbindung")}</TableHead>}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped
              ? groups.map(({ group, accounts: rows }) => {
                  const open = allOpen || expanded.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <ConnectionGroupRow
                        group={group}
                        open={open}
                        onToggle={() => onToggleGroup(group.key)}
                        colSpan={columns}
                        canUnlink={ctx.canUnlink}
                      />
                      {open && rows.map((a) => <AccountRow key={a.id} a={a} indented ctx={ctx} />)}
                    </Fragment>
                  );
                })
              : accounts.map((a) => <AccountRow key={a.id} a={a} indented={false} ctx={ctx} />)}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {grouped
          ? groups.map(({ group, accounts: rows }) => {
              // Same collapse state as the table, and the heading is the control, the way the
              // group row is on desktop. A phone is where a fold matters most.
              const open = allOpen || expanded.has(group.key);
              return (
                <div key={group.key} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.key)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight
                      className={cn(
                        "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-90",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">
                        {group.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {group.connectionId && group.countTotal === 0
                          ? t("bankConnections.keineKonten")
                          : t("bankAccounts.gruppe.konten", { count: group.count })}
                      </span>
                    </span>
                  </button>
                  {open && rows.map((a) => <AccountCard key={a.id} a={a} ctx={ctx} />)}
                </div>
              );
            })
          : accounts.map((a) => <AccountCard key={a.id} a={a} ctx={ctx} />)}
      </div>
    </>
  );
}
