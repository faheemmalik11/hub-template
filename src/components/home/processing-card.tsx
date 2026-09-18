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
  useVerarbeitungsLogStatusCounts,
} from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";

// The pipeline's channel key, and the Postfach card that shows the same channel.
const POSTFACH_CARD: Record<string, string> = {
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
  const [zeitraum, setZeitraum] = useStoredPeriod("processing");
  const range = useMemo(
    () =>
      overviewPeriodRange(zeitraum.period, new Date(), { von: zeitraum.von, bis: zeitraum.bis }),
    [zeitraum],
  );
  const logQ = useVerarbeitungsLogStatusCounts({
    von: range.von ?? undefined,
    bis: range.bis ?? undefined,
  });
  const invoicesQ = useOverviewInvoices(range.von, range.bis);
  const healthQ = usePipelineHealth();
  // A request somebody made from Postfach says exactly what is being read; a scheduled run has no
  // request behind it, so the open run row is all there is to go on.
  const requestsQ = useRunRequests();
  const openRequests = Object.values(requestsQ.data ?? {}).filter(
    (request) => request.status === "pending" || request.status === "running",
  );
  // One line per run, named as the Postfach card is: "Email · The usual folders".
  const runningLines = openRequests.map((request) => {
    const card = POSTFACH_CARD[request.channel];
    const channel = card
      ? t(`sources.${card}.name`)
      : t(`belege.kanal.${request.channel}`, { defaultValue: request.channel });
    const names = request.folder_names?.filter(Boolean) ?? [];
    return `${channel} · ${names.length > 0 ? names.join(", ") : t("sources.runNowDefault")}`;
  });
  const isRunning = runningLines.length > 0 || Boolean(healthQ.data?.running);

  const stats = useMemo(() => {
    const logCounts = logQ.data ?? {};
    const verarbeitet = Object.values(logCounts).reduce((s, n) => s + n, 0);
    const fehler = logCounts.fehler ?? 0;
    const rows = invoicesQ.data ?? [];
    const erkannt = rows.filter((r) => r.status === "erkannt").length;
    const zuPruefen = rows.filter((r) => r.status === "zu_pruefen").length;
    const kanaele = new Map<string, number>();
    for (const r of rows) {
      if (!r.intake_channel) continue;
      kanaele.set(r.intake_channel, (kanaele.get(r.intake_channel) ?? 0) + 1);
    }
    const channels = [...kanaele.entries()].sort((a, b) => b[1] - a[1]);
    return { verarbeitet, fehler, erkannt, zuPruefen, channels };
  }, [logQ.data, invoicesQ.data]);

  if (logQ.isError && invoicesQ.isError) return null;

  const laedt = logQ.isLoading || invoicesQ.isLoading;
  const val = (n: number) => (laedt ? "—" : String(n));

  return (
    <DashboardPanel
      title={t("home.processing.title")}
      headerRight={
        <>
          <Link to="/protokoll" className="text-xs font-medium text-brand-dark hover:underline">
            {t("home.processing.all")}
          </Link>
          <PeriodPicker value={zeitraum} onChange={setZeitraum} />
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
          to="/protokoll"
          label={t("home.processing.verarbeitet")}
          value={val(stats.verarbeitet)}
        />
        <StatTile
          to="/eingangsrechnungen"
          search={{ status: "erkannt" }}
          label={t("home.processing.erkannt")}
          value={val(stats.erkannt)}
        />
        <StatTile
          to="/eingangsrechnungen"
          search={{ status: "zu_pruefen" }}
          label={t("home.processing.zuPruefen")}
          value={val(stats.zuPruefen)}
          valueCls={stats.zuPruefen > 0 ? "text-warning" : undefined}
        />
        <StatTile
          to="/protokoll"
          label={t("home.processing.fehler")}
          value={val(stats.fehler)}
          valueCls={stats.fehler > 0 ? "text-danger" : undefined}
        />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pt-2">
        {stats.channels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("home.processing.kanaele")}{" "}
            {stats.channels
              .map(([kanal, n]) => `${t(`belege.kanal.${kanal}`, { defaultValue: kanal })} ${n}`)
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
