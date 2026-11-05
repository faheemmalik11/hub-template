import { MoreHorizontal, Send, Settings2, History, AlertTriangle } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RouteStatus,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  formatDateTime,
  formatEUR,
  useTranslation,
} from "./adapter";
import type { CompanyRow } from "./model";

export interface RowHandlers {
  onConfigure: (row: CompanyRow) => void;
  onSend: (row: CompanyRow) => void;
  onHistory: (row: CompanyRow) => void;
}

/**
 * The company table — the centre of the page, and the only thing on it that is a list.
 *
 * It reports SETUP, never the destination. `datev_routes.address` is withheld from `authenticated`
 * at the column level (migration 0038) precisely so it cannot leak through a screen or a log, and
 * a table is the most-screenshotted surface in the app. "Eingerichtet" is the whole of what this
 * column has to say; the address itself exists only inside the setup drawer, which somebody has to
 * open on purpose.
 */
export function CompanyTable({ rows, handlers }: { rows: CompanyRow[]; handlers: RowHandlers }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t("handover.col.company")}</TableHead>
              <TableHead>{t("handover.col.setup")}</TableHead>
              <TableHead className="text-right">{t("handover.col.ready")}</TableHead>
              <TableHead className="text-right">{t("handover.col.sent")}</TableHead>
              <TableHead>{t("handover.col.lastSent")}</TableHead>
              <TableHead className="w-[1%] text-right whitespace-nowrap">
                {t("handover.col.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.company.id}>
                <TableCell className="font-medium text-foreground">
                  {row.company.code}
                  {row.company.name && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {row.company.name}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <SetupStatus row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <ReadyCell row={row} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.sent}
                </TableCell>
                <TableCell>
                  <LastCell row={row} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions row={row} handlers={handlers} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: a card per company. Same treatment as every other list in the app rather than
          leaving a six-column table to its own horizontal scroll. */}
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <div key={row.company.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{row.company.code}</div>
                {row.company.name && (
                  <div className="truncate text-xs text-muted-foreground">{row.company.name}</div>
                )}
              </div>
              <SetupStatus row={row} />
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("handover.col.ready")}</dt>
                <dd className="text-right">
                  <ReadyCell row={row} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("handover.col.sent")}</dt>
                <dd className="tabular-nums text-muted-foreground">{row.sent}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("handover.col.lastSent")}</dt>
                <dd className="text-right">
                  <LastCell row={row} />
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex justify-end">
              <RowActions row={row} handlers={handlers} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SetupStatus({ row }: { row: CompanyRow }) {
  const { t } = useTranslation();
  return (
    <RouteStatus
      configured={row.setup !== "missing"}
      enabled={row.setup === "ready"}
      configuredLabel={t("handover.status.configured")}
      notConfiguredLabel={t("handover.status.notConfigured")}
      disabledLabel={t("handover.status.paused")}
    />
  );
}

/**
 * The count in files, with the money as secondary information and the exceptions underneath.
 *
 * `ready` and `blocked` are two numbers because the send treats them as two. "Ready" once counted
 * every paid receipt including those whose stored file DATEV refuses; the send then dropped those
 * and reported it only in a response the screen discarded, so a row promising 7 could deliver 5.
 */
function ReadyCell({ row }: { row: CompanyRow }) {
  const { t } = useTranslation();
  return (
    <div>
      <span
        className={cn(
          "tabular-nums",
          row.ready.length > 0 ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {t("handover.files", { count: row.ready.length })}
      </span>
      {row.ready.length > 0 && (
        <div className="text-xs text-muted-foreground">{formatEUR(row.readyTotal)}</div>
      )}
      {row.blocked.length > 0 && (
        <div className="text-xs text-warning">
          {t("handover.skippedShort", { count: row.blocked.length })}
        </div>
      )}
    </div>
  );
}

function LastCell({ row }: { row: CompanyRow }) {
  const { t } = useTranslation();
  return (
    <div className="text-sm">
      <span className="tabular-nums text-muted-foreground">
        {row.lastSent ? formatDateTime(row.lastSent.created_at) : t("handover.never")}
      </span>
      {/* A failed attempt is not a handover, so it never dates this column — but it must not vanish
          either. The mark leads to the same history the overflow menu opens. */}
      {row.lastAttemptFailed && (
        <div className="inline-flex items-center gap-1 text-xs text-danger">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          {t("handover.lastAttemptFailed")}
        </div>
      )}
    </div>
  );
}

/**
 * Contextual, and never a disabled button.
 *
 * Not set up → Configure, because that is the only thing that can happen next. Set up with files
 * waiting → Send. Set up with nothing waiting → no button at all: a greyed-out Send repeated down
 * twelve rows is most of what the column would contain, and it offers nothing. Everything a row can
 * do is in the menu either way.
 */
function RowActions({ row, handlers }: { row: CompanyRow; handlers: RowHandlers }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      {row.action === "configure" && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => handlers.onConfigure(row)}
        >
          <Settings2 className="size-4" />
          {t("handover.action.configure")}
        </Button>
      )}
      {row.action === "send" && (
        <Button size="sm" className="gap-1.5" onClick={() => handlers.onSend(row)}>
          <Send className="size-4" />
          {t("handover.action.send")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t("handover.col.actions")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* THE MENU NEVER REPEATS THE ROW'S OWN BUTTON. A company with no address gets Configure
              as its primary action, and listing Configure again one click away read as two
              different things that happened to share a name. So setup appears here only when it is
              NOT already sitting next to the menu. */}
          {row.action !== "configure" && (
            <DropdownMenuItem onSelect={() => handlers.onConfigure(row)}>
              <Settings2 className="size-4" />
              {t("handover.action.editSetup")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => handlers.onHistory(row)}>
            <History className="size-4" />
            {t("handover.action.viewHistory")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
