import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CircleDollarSign, Files, PiggyBank } from "lucide-react";

import {
  discountOpportunity,
  dueBucket,
  formatEUR,
  todayLocal,
  URGENT_DUE_BUCKETS,
} from "@/lib/data/format";
import { useOpenDocuments } from "@/data";
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
  const openQ = useOpenDocuments();

  const stats = useMemo(() => {
    const rows = openQ.data ?? [];
    const today = todayLocal();
    const restTotal = rows.reduce(
      (s, r) => s + Math.max((r.amount_gross ?? 0) - r.matched_sum, 0),
      0,
    );
    const proBucket = new Map<string, number>();
    for (const r of rows) {
      const b = dueBucket(r.due_date, today);
      proBucket.set(b, (proBucket.get(b) ?? 0) + 1);
    }
    const urgent = URGENT_DUE_BUCKETS.map((b) => ({
      bucket: b,
      count: proBucket.get(b) ?? 0,
    })).filter((x) => x.count > 0);
    const cashDiscount = rows
      .map((r) => discountOpportunity(r, today))
      .filter((d) => d != null && d.state === "closing");
    const cashDiscountTotal = cashDiscount.reduce((sum, d) => sum + (d?.saving ?? 0), 0);
    return {
      count: rows.length,
      restTotal,
      urgent,
      cashDiscount: cashDiscount.length,
      cashDiscountTotal,
    };
  }, [openQ.data]);

  if (openQ.isError) return null;

  const loading = openQ.isLoading;

  return (
    <DashboardPanel title={t("home.open.title")}>
      {!loading && stats.count === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("home.open.none")}</p>
      ) : (
        <div className="mt-3 flex flex-1 flex-col gap-1.5">
          <StatRow
            to="/open-items"
            search={{ type: "incoming" }}
            icon={CircleDollarSign}
            iconCls={CHIP.brand}
            label={t("home.open.sum")}
            value={loading ? "—" : formatEUR(stats.restTotal)}
          />
          <StatRow
            to="/open-items"
            search={{ type: "incoming" }}
            icon={Files}
            iconCls={CHIP.neutral}
            label={t("home.open.count")}
            value={loading ? "—" : String(stats.count)}
          />
          {stats.cashDiscount > 0 && (
            <StatRow
              to="/open-items"
              search={{ type: "incoming", cashDiscount: "closing" }}
              icon={PiggyBank}
              iconCls={CHIP.success}
              label={t("openItems.skonto.closing", { count: stats.cashDiscount })}
              value={loading ? "—" : formatEUR(stats.cashDiscountTotal)}
              valueCls="text-success"
            />
          )}
          {stats.urgent.map(({ bucket, count }) => (
            <StatRow
              key={bucket}
              to="/open-items"
              search={{ type: "incoming", due: bucket }}
              icon={CalendarClock}
              iconCls={CHIP.danger}
              label={t(`openItems.due.${bucket}`)}
              value={loading ? "—" : String(count)}
              valueCls="text-danger"
            />
          ))}
        </div>
      )}
      <Link
        to="/open-items"
        className="mt-auto pt-2 text-sm font-medium text-brand-dark hover:underline"
      >
        {t("home.open.all")}
      </Link>
    </DashboardPanel>
  );
}
