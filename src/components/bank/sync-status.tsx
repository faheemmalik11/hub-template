// Whether the automatic bank sync is alive, in one line.
//
// WHY IT IS COMPACT. This began as a full-width coloured banner above the accounts, which is how it
// dominated a screen whose subject is the accounts: the loudest thing on the page was the thing
// that is fine 99% of the time. The state still has to be visible -- an automatic job nobody looks
// at can stop without anybody noticing, which is exactly what migration 20260901170200 records,
// an hourly cron answering 401 for weeks while every screen looked normal -- so nothing was
// dropped. Colour is carried by a 6px dot instead of a filled panel, the counts sit beside it in
// muted text, and the full sentence with its timestamp is on the title attribute.
//
// All the reasoning about WHICH state the log represents lives in lib/data/sync-health.ts. This
// file is the rendering.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useBankSyncLogs } from "@/lib/data/queries";
import { computeSyncHealth, type SyncHealthStatus } from "@/lib/data/sync-health";
import { formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

type Tone = "ok" | "info" | "warn" | "bad" | "muted";

// Theme tokens only. The status ramp in styles.css is what carries good/attention/bad everywhere
// else in the app, and a second private palette here would drift from it.
const DOT: Record<Tone, string> = {
  ok: "bg-success",
  info: "bg-brand-dark",
  warn: "bg-warning",
  bad: "bg-danger",
  muted: "bg-muted-foreground/40",
};

const TEXT: Record<Tone, string> = {
  ok: "text-muted-foreground",
  info: "text-muted-foreground",
  warn: "text-warning",
  bad: "text-danger",
  muted: "text-muted-foreground",
};

const TONE_BY_STATUS: Record<SyncHealthStatus, Tone> = {
  ok: "ok",
  running: "info",
  warn: "warn",
  stale: "warn",
  stalled: "bad",
  error: "bad",
  never: "muted",
};

export function SyncStatus({ className }: { className?: string }) {
  const { t } = useTranslation();
  // Polled, because this is a claim about the present. The job itself only writes once an hour,
  // so a minute's cadence is cheap.
  const logsQ = useBankSyncLogs(100, 60_000);

  // The query refetching is what brings new ROWS in. This tick is what keeps "vor 12 Minuten" from
  // freezing on a tab left open, since that number comes from the clock, not from the data.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Nothing at all while the first read is in flight: a line that says "noch kein Abgleich" for
  // half a second on every page load would be a lie half the time.
  if (logsQ.isLoading || logsQ.isError || !logsQ.data) return null;

  const health = computeSyncHealth(logsQ.data, Date.now());
  const tone = TONE_BY_STATUS[health.status];
  const when = health.at ? formatDateTime(health.at) : "—";
  const ago = relativeAgo(health.atMinutesAgo, t);

  const Icon =
    health.status === "running"
      ? Loader2
      : health.status === "never"
        ? CircleSlash
        : tone === "ok"
          ? CheckCircle2
          : AlertTriangle;

  // Short on screen, long on hover. The compact label answers "is it working"; the title keeps the
  // exact timestamp and the failure message that the banner used to print in full.
  const label = t(`bankkonten.sync.${health.status}`, { ago });
  const voll = t(`bankkonten.health.${health.status}`, { when, ago });

  // Counts come from the last completed run, so "0 neue Umsätze" is a real and useful answer: the
  // run worked and the bank had nothing new, which is the case most easily mistaken for a fault.
  const details: string[] = [];
  if (health.counts && (health.status === "ok" || health.status === "warn")) {
    details.push(
      t("bankkonten.health.detail", {
        umsaetze: health.counts.transactions_new ?? 0,
        zuordnungen: health.counts.matches_auto ?? 0,
      }),
    );
  }
  if (health.status === "error" && health.lastErrorMessage) details.push(health.lastErrorMessage);
  if (health.skippedSinceRun > 0) {
    details.push(t("bankkonten.health.uebersprungen", { count: health.skippedSinceRun }));
  }

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", TEXT[tone], className)}
      // Announced, because the interesting case is the one that appears while the reader is
      // looking at something else on the page.
      role="status"
      title={details.length ? `${voll} · ${details.join(" · ")}` : voll}
    >
      {/* A dot rather than a glyph in the healthy case: an icon per state is one more thing to
          read on a row that already carries a label and two buttons. */}
      {tone === "ok" ? (
        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      ) : (
        <Icon
          className={cn("size-3.5 shrink-0", health.status === "running" && "animate-spin")}
          aria-hidden
        />
      )}
      <span className="truncate">{label}</span>
      {/* The counts drop out first when the row runs out of room: they are the detail, the state is
          the point, and both stay reachable through the title. */}
      {details.length > 0 && (
        <span className="hidden truncate text-muted-foreground lg:inline">
          {"· "}
          {details[0]}
        </span>
      )}
    </span>
  );
}

/** "vor 12 Minuten" in the coarsest unit that is still honest. A dash for a state with no tick. */
function relativeAgo(
  minutes: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (minutes === null) return "—";
  if (minutes < 2) return t("bankkonten.health.ago.jetzt");
  if (minutes < 60) return t("bankkonten.health.ago.min", { count: minutes });
  if (minutes < 2880) return t("bankkonten.health.ago.std", { count: Math.round(minutes / 60) });
  return t("bankkonten.health.ago.tage", { count: Math.round(minutes / 1440) });
}
