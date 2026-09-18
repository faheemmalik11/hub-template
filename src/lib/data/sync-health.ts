import type { BankSyncLog } from "./types";

/**
 * Reduce the sync log to the one sentence a person needs: is the hourly bank sync alive?
 *
 * WHY THIS EXISTS. The hourly job writes everything it does into `bank_sync_logs`, and the only
 * way to see any of it was to open the sync-log panel on a screen that was itself hidden behind a
 * separate nav entry. Nobody opens a panel to check on something that is supposed to be automatic,
 * which is how a broken schedule stays broken: migration 20260901170200 records exactly that, an
 * hourly cron that had been getting 401 back from `ingest` on every single run for weeks while
 * every screen in the Hub looked perfectly normal. This turns the log into a state that can be
 * rendered where the accounts already are.
 *
 * Kept as a pure function over the rows, with `nowMs` passed in, so every case below can be tested
 * without a clock and without a database, and so a sibling Hub can reuse it unchanged.
 */

/**
 * How long after the last completed run the silence becomes a problem.
 *
 * The job runs at the top of every hour, so 65 minutes would flag a single late run as broken.
 * 125 tolerates exactly one missed hour and no more: two consecutive misses is a real fault.
 */
export const STALE_AFTER_MINUTES = 125;

/**
 * A run that started and has not finished is normal for a while: a first full-history sync of a
 * real bank takes minutes, not seconds. Past this it is not slow, it is gone. The POST was lost,
 * the function crashed, or the Edge runtime timed it out without writing its own error row.
 */
export const RUNNING_GRACE_MINUTES = 20;

/**
 * The events that mark a run beginning and ending.
 *
 * Two writers, two vocabularies, and neither is guaranteed to be present. `ingest` (the hourly
 * wrapper) writes ingest_start/ingest_done; `bank-sync` writes sync_started/sync_finished whether
 * it was called by the cron or by the button on the page. Reading only one pair is how this gets
 * the answer badly wrong in both directions: on this database there are no ingest_* rows at all
 * before 20260901170200, so an ingest-only reading says "never ran" over a log full of completed
 * bank syncs. `cron_fired`/`cron_skipped` come from a sibling Hub's heartbeat and are tolerated
 * here so the same function serves all of them.
 */
const START_EVENTS = new Set(["cron_fired", "ingest_start", "sync_started"]);
const DONE_EVENTS = new Set(["ingest_done", "sync_finished"]);

export type SyncHealthStatus =
  /** No log rows at all: either nothing has ever run, or the log was cleared. */
  | "never"
  /** Started recently and no completion yet. Not a problem, and not success either. */
  | "running"
  /** Finished, every source ok, recently enough. */
  | "ok"
  /** Finished, but at least one source failed (a completion row written at level 'warn'). */
  | "warn"
  /** The newest thing in the log is a failure. */
  | "error"
  /** Started, then silence past the grace period. */
  | "stalled"
  /** Nothing completed for over STALE_AFTER_MINUTES. The schedule itself is suspect. */
  | "stale";

export type SyncHealth = {
  status: SyncHealthStatus;
  /** Last completed run, whatever its level. */
  lastRunAt: string | null;
  /** Last run start. */
  lastStartedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  /** Counts from the last completion: transactions_new, matches_auto, and so on. */
  counts: Record<string, number> | null;
  /**
   * The tick the status is measured from: the completion for ok/warn/stale, the start for
   * running/stalled, the failure for error. Null only for 'never'.
   */
  at: string | null;
  atMinutesAgo: number | null;
  /**
   * Ticks skipped by the overlap guard since the last completed run. One is unremarkable, several
   * in a row means a run is stuck and every subsequent hour is standing it off.
   */
  skippedSinceRun: number;
};

const minutesBetween = (nowMs: number, iso: string) =>
  Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));

/** Newest row matching a predicate, tolerating an unsorted input. */
function newest(rows: BankSyncLog[], match: (r: BankSyncLog) => boolean): BankSyncLog | null {
  let best: BankSyncLog | null = null;
  for (const r of rows) {
    if (!match(r) || !r.created_at) continue;
    if (!best || Date.parse(r.created_at) > Date.parse(best.created_at)) best = r;
  }
  return best;
}

export function computeSyncHealth(rows: BankSyncLog[], nowMs: number): SyncHealth {
  const usable = (rows ?? []).filter((r) => r && r.created_at);

  const lastRun = newest(usable, (r) => DONE_EVENTS.has(r.event));
  const lastStarted = newest(usable, (r) => START_EVENTS.has(r.event));
  // Any level-'error' row, whoever wrote it: the cron's missing-secret row, bank-sync's own
  // failure row, and a per-source row for a source that came back non-2xx all use it.
  const lastError = newest(usable, (r) => r.level === "error");

  const runMs = lastRun ? Date.parse(lastRun.created_at) : null;
  const skippedSinceRun = usable.filter(
    (r) => r.event === "cron_skipped" && (runMs === null || Date.parse(r.created_at) > runMs),
  ).length;

  const base = {
    lastRunAt: lastRun?.created_at ?? null,
    lastStartedAt: lastStarted?.created_at ?? null,
    lastErrorAt: lastError?.created_at ?? null,
    lastErrorMessage: lastError?.message ?? null,
    counts: lastRun?.counts ?? null,
    skippedSinceRun,
  };

  const at = (iso: string, status: SyncHealthStatus): SyncHealth => ({
    ...base,
    status,
    at: iso,
    atMinutesAgo: minutesBetween(nowMs, iso),
  });

  const nie = (): SyncHealth => ({ ...base, status: "never", at: null, atMinutesAgo: null });

  if (!usable.length) return nie();

  // A failure newer than the last completion is the headline, whatever else is in the log. The
  // comparison is against the COMPLETION and not against "now": an error from three days ago that
  // was followed by successful runs is history, not a current fault.
  if (lastError && (!runMs || Date.parse(lastError.created_at) > runMs)) {
    return at(lastError.created_at, "error");
  }

  // Started after the last completion: a run is either in flight or lost.
  if (lastStarted && (!runMs || Date.parse(lastStarted.created_at) > runMs)) {
    const age = minutesBetween(nowMs, lastStarted.created_at);
    return at(lastStarted.created_at, age <= RUNNING_GRACE_MINUTES ? "running" : "stalled");
  }

  // Rows exist but nothing ever completed and nothing started, e.g. only a manual run's
  // intermediate events. Treat as never rather than inventing a state.
  if (!lastRun) return nie();

  const age = minutesBetween(nowMs, lastRun.created_at);
  if (age > STALE_AFTER_MINUTES) return at(lastRun.created_at, "stale");
  // A completion written at level 'warn' means a source failed but the run itself finished.
  return at(lastRun.created_at, lastRun.level === "warn" ? "warn" : "ok");
}

/** True when the state needs someone to look, i.e. anything but a healthy or in-flight run. */
export function syncNeedsAttention(h: SyncHealth): boolean {
  return h.status !== "ok" && h.status !== "running";
}
