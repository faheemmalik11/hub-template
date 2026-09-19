import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDayShort, formatEUR, formatEURCompact, formatMonthShort } from "@/lib/data/format";
import { useOutgoingInvoices, useOverviewInvoices } from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";

/**
 * Money in and money out, by month, over the selected period.
 *
 * The figure cards above answer "how much"; this answers "which way is it going", which a single
 * total cannot. Grouped bars rather than a line: these are discrete monthly sums, and a line
 * between them would imply values existing on the days in between.
 *
 * Incoming takes the brand accent, outgoing a neutral slate. Both used to be steps of the same
 * beige, which drew two lines the eye read as one.
 */

export function VolumeChart({ von, bis }: { von?: string | null; bis?: string | null }) {
  const { t } = useTranslation();
  const config = useMemo(
    () =>
      ({
        eingang: { label: t("home.money.eingang"), color: "var(--color-chart-1)" },
        ausgang: { label: t("home.money.ausgang"), color: "var(--color-chart-2)" },
      }) satisfies ChartConfig,
    [t],
  );
  const invoicesQ = useOverviewInvoices(von, bis);
  const outgoingQ = useOutgoingInvoices();
  // Memoised: the `?? []` fallback mints a fresh array every render, which would invalidate the
  // bucketing memo below on every render.
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const outgoing = useMemo(() => outgoingQ.data ?? [], [outgoingQ.data]);

  // GRANULARITY FOLLOWS THE PERIOD. Bucketing by month is right for a year and useless for 30 days,
  // where every row lands in the same bucket and the chart collapses to a single bar. Anything up
  // to roughly two months is grouped by day instead, so the default period actually shows a shape.
  const proTag = useMemo(() => {
    if (!von || !bis) return false;
    const tage = (Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000;
    return Number.isFinite(tage) && tage <= 62;
  }, [von, bis]);

  const data = useMemo(() => {
    const buckets = new Map<string, { eingang: number; ausgang: number }>();
    const key = (iso: string) => (proTag ? iso.slice(0, 10) : iso.slice(0, 7));
    const bucket = (iso: string | null | undefined) => {
      if (!iso) return null;
      const k = key(iso);
      if (!buckets.has(k)) buckets.set(k, { eingang: 0, ausgang: 0 });
      return buckets.get(k)!;
    };
    for (const r of invoices) {
      const b = bucket(r.document_date);
      if (b) b.eingang += r.amount_gross ?? 0;
    }
    for (const r of outgoing) {
      // Same rule the figure cards use: a draft was never sent and a voided one was cancelled, so
      // neither is money anybody owes.
      if (r.status === "draft" || r.status === "voided") continue;
      if (von && r.invoice_date && r.invoice_date < von) continue;
      if (bis && r.invoice_date && r.invoice_date > bis) continue;
      const b = bucket(r.invoice_date);
      if (b) b.ausgang += r.amount_gross ?? 0;
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ k, label: proTag ? formatDayShort(k) : formatMonthShort(k), ...v }));
  }, [invoices, outgoing, von, bis, proTag]);

  if (invoicesQ.isLoading || outgoingQ.isLoading) {
    return <Skeleton className="h-[190px] w-full rounded-xl" />;
  }
  // Nothing at all in the period. An axis with no bars says less than not rendering.
  if (data.length === 0) return null;

  return (
    <ChartContainer config={config} className="h-[190px] w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          // A fixed pixel size: rem-based SVG text lands on fractional pixels under the UI scale
          // and renders soft. 11px stays sharp at every scale step.
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={46}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(v: number) => formatEURCompact(v)}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatEUR(Number(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="eingang"
          name={t("home.money.eingang")}
          type="monotone"
          stroke="var(--color-eingang)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="ausgang"
          name={t("home.money.ausgang")}
          type="monotone"
          stroke="var(--color-ausgang)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
