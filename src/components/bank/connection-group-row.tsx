import { ChevronRight } from "lucide-react";

import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DisconnectBankDialog } from "@/components/bank/disconnect-bank-dialog";
import { formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

/**
 * One bank connection, as the header row of the accounts it delivers.
 *
 * This row IS the former Bankverbindungen screen. Everything that page put in its own table lives
 * here: which bank, the consent status, live or sandbox, when it last synced, and how many accounts
 * it delivers, or that it delivers none.
 *
 * The layout is two columns, not one line. The bank name and its status sit left at heading weight
 * with the account count under them; the last sync is right-aligned against the table's own edge,
 * where a timestamp is read rather than scanned past. On one line the name had to compete with five
 * pieces of metadata, so the thing a reader is actually looking for was the hardest to find.
 *
 * Groups are built from the CONNECTIONS, not from the accounts. Building them from accounts means a
 * connection delivering nothing has no group and does not appear, which is the bug the old
 * connections table had: an abandoned webform, an expired consent and a live connection whose last
 * account was removed all looked identical, namely absent, while bank-sync kept running against
 * them.
 *
 * Deliberately free of per-Hub vocabulary beyond its labels, so a sibling Hub can drop it in.
 */
export type KontoGruppe = {
  key: string;
  /** Null for manually created accounts and for accounts on a connection this user cannot read. */
  connectionId: string | null;
  label: string;
  /** Null when the group is not a connection. */
  status: string | null;
  sandbox: boolean;
  createdAt: string | null;
  lastSyncAt: string | null;
  /** Set = the BANKSapi access was detached from the Hub. The group stays, switched off. */
  disconnectedAt: string | null;
  /** Who connected it, so whose consent it is to renew. Null when that was never recorded. */
  verbundenVon: string | null;
  /** Accounts after search and filters, i.e. what will actually be rendered under this row. */
  anzahl: number;
  /** Accounts before search and filters. A connection with zero of these delivers nothing. */
  anzahlGesamt: number;
};

/**
 * The consent status as a chip, in the status ramp's own colours.
 *
 * A chip and not a coloured word: this is the one piece of state on the row that decides whether
 * anything below it can be trusted, and it has to survive being glanced at. `active` is the common
 * case and still earns the green, because the whole question the row answers is "is this bank still
 * feeding us".
 */
const STATUS_CHIP: Record<string, string> = {
  active: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
  expired: "bg-warning-soft text-warning",
};

export function ConnectionGroupRow({
  gruppe,
  offen,
  onToggle,
  colSpan,
  darfTrennen,
}: {
  gruppe: KontoGruppe;
  offen: boolean;
  onToggle: () => void;
  colSpan: number;
  /** Whether to offer Trennen. Same right as switching a single account off. */
  darfTrennen: boolean;
}) {
  const { t } = useTranslation();
  const istVerbindung = gruppe.connectionId !== null;
  // A connection that delivers nothing is the whole reason this row is interesting, so it says so
  // rather than showing a bare zero. Read from the unfiltered count: a search that happens to hide
  // every account is not the same fact.
  const leer = istVerbindung && gruppe.anzahlGesamt === 0;

  return (
    <TableRow className="cursor-pointer bg-muted/30 hover:bg-muted/50" onClick={onToggle}>
      <TableCell colSpan={colSpan} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 items-start gap-2">
            <ChevronRight
              className={cn(
                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                offen && "rotate-90",
              )}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-foreground">{gruppe.label}</span>
                {/* Detached wins over the status column. `status` is 'expired' after a
                    disconnect, which is true but reads as "the bank withdrew the consent" -- a
                    thing that happens TO you and that re-authorising fixes. This one was done on
                    purpose and re-authorising is not the answer, so it says so. */}
                {istVerbindung && gruppe.disconnectedAt ? (
                  <span
                    className="inline-flex shrink-0 items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    title={t("bankkonten.trennen.getrenntTitle", {
                      datum: formatDateTime(gruppe.disconnectedAt),
                    })}
                  >
                    {t("bankkonten.trennen.getrennt")}
                  </span>
                ) : (
                  istVerbindung &&
                  gruppe.status && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        STATUS_CHIP[gruppe.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {t(`bank.syncStatus.${gruppe.status}`, { defaultValue: gruppe.status })}
                    </span>
                  )
                )}
                {/* Not a degree of health but "these figures are fabricated", which no amount of
                    muted text says loudly enough. */}
                {gruppe.sandbox && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
                    title={t("bankkonten.sandboxTitle")}
                  >
                    {t("bankkonten.sandbox")}
                  </span>
                )}
              </div>
              {/* The count, and nothing else. The setup date used to live here to tell two consents
                  to the same bank apart; it earned its place on a screen whose only subject was
                  connections, and not on one whose subject is the accounts. */}
              <p className="mt-0.5 text-sm text-muted-foreground">
                {leer ? (
                  <span className="text-warning" title={t("bankverbindungen.keineKontenTitle")}>
                    {t("bankverbindungen.keineKonten")}
                  </span>
                ) : (
                  t("bankkonten.gruppe.konten", { count: gruppe.anzahl })
                )}
                {/* Whose consent this is. A BANKSapi consent belongs to whoever authorised it at
                    their own bank, and an expired one can only be renewed by that person, so the
                    row names them. Connections from before this was recorded say so rather than
                    guessing. */}
                {istVerbindung && (
                  <>
                    {" · "}
                    {gruppe.verbundenVon
                      ? t("bankkonten.gruppe.verbundenVon", { name: gruppe.verbundenVon })
                      : t("bankkonten.gruppe.verbundenVonUnbekannt")}
                  </>
                )}
              </p>
            </div>
          </div>
          {istVerbindung && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-muted-foreground">
                {t("bankkonten.gruppe.letzterSync", {
                  datum: gruppe.lastSyncAt ? formatDateTime(gruppe.lastSyncAt) : "—",
                })}
              </span>
              {/* Offered per CONNECTION and nowhere else: DELETE /customer/v2/bankzugaenge/{id} is
                  the only removal BANKSapi has, and it takes a whole bank. */}
              {darfTrennen && !gruppe.disconnectedAt && gruppe.connectionId && (
                <DisconnectBankDialog connectionId={gruppe.connectionId} bank={gruppe.label} />
              )}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
