import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CircleDollarSign, Files, PiggyBank } from "lucide-react";

import {
  discountOpportunity,
  dueBucket,
  formatEUR,
  heuteLokal,
  URGENT_DUE_BUCKETS,
} from "@/lib/data/format";
import { useOffeneBelege } from "@/data";
import { DashboardPanel } from "@/components/dashboard/panel";
import { CHIP, StatRow } from "@/components/dashboard/stat-tile";
import { useTranslation } from "@/lib/i18n";

/**
 * What is still unpaid, as three figures. Reads the same view the Offene-Posten screen reads, so
 * the numbers here and the list behind the link cannot disagree. "Open amount" is the REMAINING
 * amount (gross minus confirmed allocations), because a half-paid invoice is not open for its full
 * face value. Overdue follows that screen's rule: a real due date strictly in the past; a
 * due-date-less receipt sitting for months is old, not overdue.
 */
export function OpenItemsCard() {
  const { t } = useTranslation();
  const offenQ = useOffeneBelege();

  const stats = useMemo(() => {
    const rows = offenQ.data ?? [];
    const heute = heuteLokal();
    const restSumme = rows.reduce(
      (s, r) => s + Math.max((r.amount_gross ?? 0) - r.matched_sum, 0),
      0,
    );
    const proBucket = new Map<string, number>();
    for (const r of rows) {
      const b = dueBucket(r.due_date, heute);
      proBucket.set(b, (proBucket.get(b) ?? 0) + 1);
    }
    const dringend = URGENT_DUE_BUCKETS.map((b) => ({
      bucket: b,
      count: proBucket.get(b) ?? 0,
    })).filter((x) => x.count > 0);
    const skonto = rows
      .map((r) => discountOpportunity(r, heute))
      .filter((d) => d != null && d.state === "closing");
    const skontoSumme = skonto.reduce((sum, d) => sum + (d?.saving ?? 0), 0);
    return { anzahl: rows.length, restSumme, dringend, skonto: skonto.length, skontoSumme };
  }, [offenQ.data]);

  if (offenQ.isError) return null;

  const laedt = offenQ.isLoading;

  return (
    <DashboardPanel title={t("home.open.title")}>
      {!laedt && stats.anzahl === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("home.open.none")}</p>
      ) : (
        <div className="mt-3 flex flex-1 flex-col gap-1.5">
          <StatRow
            to="/offene-posten"
            search={{ typ: "incoming" }}
            icon={CircleDollarSign}
            iconCls={CHIP.brand}
            label={t("home.open.sum")}
            value={laedt ? "—" : formatEUR(stats.restSumme)}
          />
          <StatRow
            to="/offene-posten"
            search={{ typ: "incoming" }}
            icon={Files}
            iconCls={CHIP.neutral}
            label={t("home.open.count")}
            value={laedt ? "—" : String(stats.anzahl)}
          />
          {stats.skonto > 0 && (
            <StatRow
              to="/offene-posten"
              search={{ typ: "incoming", skonto: "closing" }}
              icon={PiggyBank}
              iconCls={CHIP.success}
              label={t("offenePosten.skonto.closing", { count: stats.skonto })}
              value={laedt ? "—" : formatEUR(stats.skontoSumme)}
              valueCls="text-success"
            />
          )}
          {stats.dringend.map(({ bucket, count }) => (
            <StatRow
              key={bucket}
              to="/offene-posten"
              search={{ typ: "incoming", due: bucket }}
              icon={CalendarClock}
              iconCls={CHIP.danger}
              label={t(`offenePosten.due.${bucket}`)}
              value={laedt ? "—" : String(count)}
              valueCls="text-danger"
            />
          ))}
        </div>
      )}
      <Link
        to="/offene-posten"
        className="mt-auto pt-2 text-sm font-medium text-brand-dark hover:underline"
      >
        {t("home.open.all")}
      </Link>
    </DashboardPanel>
  );
}
