import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { DashboardPanel } from "@/components/dashboard/panel";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatDateTime, overviewPeriodRange } from "@/lib/data/format";
import {
  useOverviewInvoices,
  usePipelineHealth,
  useRunRequests,
  useProcessingLogStatusCounts,
} from "@/data";
import { useTranslation } from "@/lib/i18n";

// The pipeline's channel key, and the Postfach card that shows the same channel.
const INBOX_CARD: Record<string, string> = {
  mailbox: "mail",
  scan_folder: "filing",
  upload: "upload",
};

/**
 * The bookkeeping machine's own figures: how much the pipeline processed in the period, how much
 * it recognized without help, what is waiting for a person, and what failed. Processed and errors
 * come from processing_log (one row per handled mail/file); recognized and to-review come from the
 * invoices the other panels already load, split by extraction status.
 */
export function ProcessingCard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useStoredPeriod("processing");
  const range = useMemo(
    () =>
      overviewPeriodRange(period.period, new Date(), {
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    [period],
  );
  const logQ = useProcessingLogStatusCounts({
    fromDate: range.fromDate ?? undefined,
    toDate: range.toDate ?? undefined,
  });
  const invoicesQ = useOverviewInvoices(range.fromDate, range.toDate);
  const healthQ = usePipelineHealth();
  // A request somebody made from Postfach says exactly what is being read; a scheduled run has no
  // request behind it, so the open run row is all there is to go on.
  const requestsQ = useRunRequests();
  const openRequests = Object.values(requestsQ.data ?? {}).filter(
    (request) => request.status === "pending" || request.status === "running",
  );
  // One line per run, named as the Postfach card is: "Email · The usual folders".
  const runningLines = openRequests.map((request) => {
    const card = INBOX_CARD[request.channel];
    const channel = card
      ? t(`sources.${card}.name`)
      : t(`documents.kanal.${request.channel}`, { defaultValue: request.channel });
    const names = request.folder_names?.filter(Boolean) ?? [];
    return `${channel} · ${names.length > 0 ? names.join(", ") : t("sources.runNowDefault")}`;
  });
  const isRunning = runningLines.length > 0 || Boolean(healthQ.data?.running);

  const stats = useMemo(() => {
    const logCounts = logQ.data ?? {};
    const processed = Object.values(logCounts).reduce((s, n) => s + n, 0);
    const error = logCounts.error ?? 0;
    const rows = invoicesQ.data ?? [];
    const recognised = rows.filter((r) => r.status === "recognised").length;
    const zuCheck = rows.filter((r) => r.status === "needs_review").length;
    const channelCounts = new Map<string, number>();
    for (const r of rows) {
      if (!r.intake_channel) continue;
      channelCounts.set(r.intake_channel, (channelCounts.get(r.intake_channel) ?? 0) + 1);
    }
    const channels = [...channelCounts.entries()].sort((a, b) => b[1] - a[1]);
    return { processed, error, recognised, zuCheck, channels };
  }, [logQ.data, invoicesQ.data]);

  if (logQ.isError && invoicesQ.isError) return null;

  const loading = logQ.isLoading || invoicesQ.isLoading;
  const val = (n: number) => (loading ? "—" : String(n));

  return (
    <DashboardPanel
      title={t("home.processing.title")}
      headerRight={
        <>
          <Link to="/activity-log" className="text-xs font-medium text-brand-dark hover:underline">
            {t("home.processing.all")}
          </Link>
          <PeriodPicker value={period} onChange={setPeriod} />
        </>
      }
    >
      {isRunning && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-sm text-foreground"
        >
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div className="min-w-0">
            <p className="font-medium">{t("home.processing.runningNow")}</p>
            {runningLines.map((line) => (
              <p key={line} className="truncate text-xs text-muted-foreground" title={line}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
        <StatTile
          to="/activity-log"
          label={t("home.processing.verarbeitet")}
          value={val(stats.processed)}
        />
        <StatTile
          to="/incoming-invoices"
          search={{ status: "recognised" }}
          label={t("home.processing.erkannt")}
          value={val(stats.recognised)}
        />
        <StatTile
          to="/incoming-invoices"
          search={{ status: "needs_review" }}
          label={t("home.processing.zuPruefen")}
          value={val(stats.zuCheck)}
          valueCls={stats.zuCheck > 0 ? "text-warning" : undefined}
        />
        <StatTile
          to="/activity-log"
          label={t("home.processing.fehler")}
          value={val(stats.error)}
          valueCls={stats.error > 0 ? "text-danger" : undefined}
        />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pt-2">
        {stats.channels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("home.processing.kanaele")}{" "}
            {stats.channels
              .map(
                ([channel, n]) =>
                  `${t(`documents.kanal.${channel}`, { defaultValue: channel })} ${n}`,
              )
              .join(" · ")}
          </p>
        )}
        {healthQ.data?.lastRun && (
          <p className="text-xs text-muted-foreground" title={t("home.processing.lastRunTitle")}>
            {t("home.processing.lastRun", {
              time: formatDateTime(
                healthQ.data.lastRun.finished_at ?? healthQ.data.lastRun.started_at,
              ),
            })}
          </p>
        )}
      </div>
    </DashboardPanel>
  );
}
