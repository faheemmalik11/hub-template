import { useMemo } from "react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  formatEUR,
  formatEURCompact,
  useTranslation,
} from "../adapter";
import type { ChartConfig } from "../adapter";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

/** One time bucket: a month or a day, already labelled for the axis. */
export interface HistoryPoint {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  result: number;
  /**
   * Cost per category, as FLAT keys on the point itself (`occupancy`, `cogs_material`, `__rest`),
   * not a nested object. recharts resolves a legend and tooltip entry by its dataKey, and a nested
   * `proKategorie.occupancy` path finds no config entry, so the legend rendered as bare colour
   * swatches with no category names beside them.
   */
  [category: string]: number | string;
}

/**
 * Categorical palette for the stacked cost chart.
 *
 * NOT the app's own chart ramp: that is five steps of a single hue (196-200) built for one-series
 * line charts, and as a categorical palette it fails hard. Measured with the dataviz validator, its
 * two lightest steps sit at ΔE 7.2 for NORMAL vision, well under the 15 floor, so a reader with no
 * colour deficiency at all cannot tell two stacked segments apart.
 *
 * These four are the dataviz reference slots, minus the green one, which the client asked this app
 * to stay away from. Validated in both modes:
 *   light  worst adjacent #eb6834↔#2a78d6  ΔE 24.7 protan · 32.7 tritan · 33.6 normal  ALL PASS
 *   dark   worst adjacent #9085e9↔#d95926  ΔE 26.0 deutan · 17.3 tritan · 27.0 normal  ALL PASS
 * The yellow carries a contrast WARN against the light surface (2.11:1), which the legend and the
 * tooltip discharge: identity is never left to the fill alone.
 *
 * Assigned in fixed order and never cycled. A fifth cost category folds into "Sonstige".
 */
const SERIE = ["#2a78d6", "#eb6834", "#4a3aa7", "#eda100"] as const;
const SERIE_REST = "#9aa4ad";

/** How many categories get their own colour before the rest are folded together. */
export const MAX_CATEGORIES = 4;

const AXIS = { fontSize: 11, fill: "var(--color-muted-foreground)" } as const;

/** Profit and loss fills. Semantic, not categorical: they encode the SIGN of the gap, nothing else. */
const AREA_PROFIT = "#16a34a";
const AREA_LOSS = "#e11d48";

/**
 * Revenue against costs, with the gap between them shaded by who is winning.
 *
 * ONE axis, both series in euros. The reference this follows puts revenue on a left axis and
 * margin percentages on a right one; two y-scales on one plot is the single most misread chart
 * shape there is, because the crossing point between the series is an artefact of where the two
 * scales were pinned rather than a fact about the business. The margins are on the cards above,
 * where a percentage does not have to share a canvas with a euro figure.
 *
 * The band is three STACKED areas, not two: an invisible baseline at min(revenue, costs), then the
 * profit gap, then the loss gap. Only one of the two gaps is ever non-zero at a given point, so
 * they can share a stack without fighting, and the fill lands exactly between the lines instead of
 * running to the axis. Drawing it as two areas from zero would have painted the whole area under
 * the lower line as well.
 *
 * EVERYTHING here is `type="linear"`, lines and areas alike, and that is not a style choice. The
 * stack works because basis + gewinn === umsatz at every data POINT; it only holds BETWEEN points
 * if both are interpolated the same way. With curved lines over straight-edged areas the fill spilled
 * outside the lines wherever a curve bulged away from its chord. Straight segments are also the
 * honest reading of monthly figures: a curve invents values for dates that have none.
 *
 * What survives is a small triangle at a crossing: inside that one segment the baseline runs from
 * one series to the other, so it matches neither line until the next point. Fixing it would mean
 * inserting an interpolated crossing point, which a categorical x-axis would then render as an
 * extra tick.
 *
 * The operating-result line was dropped here on purpose. It is revenue minus costs, which is the
 * gap the shading already shows; a third line restated it and crossed the other two for reasons a
 * reader had to reconstruct.
 */
export function RevenueCostHistory({ points }: { points: HistoryPoint[] }) {
  const { t } = useTranslation();
  const config = useMemo(
    () =>
      ({
        revenue: { label: t("reports.summe.umsatz"), color: SERIE[0] },
        cost: { label: t("reports.summe.gesamtkosten"), color: SERIE[1] },
      }) satisfies ChartConfig,
    [t],
  );

  const data = useMemo(
    () =>
      points.map((p) => {
        const revenue = Number(p.revenue) || 0;
        const cost = Number(p.cost) || 0;
        return {
          ...p,
          __basis: Math.min(revenue, cost),
          __gewinn: Math.max(revenue - cost, 0),
          __verlust: Math.max(cost - revenue, 0),
        };
      }),
    [points],
  );

  return (
    <>
      <ChartContainer config={config} className="h-[280px] w-full">
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={AXIS} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={AXIS}
            tickFormatter={(v: number) => formatEURCompact(v)}
          />
          <ChartTooltip content={<HistoryTooltip />} />

          {/* Baseline: carries the stack up to the lower of the two lines and paints nothing. */}
          <Area
            dataKey="__basis"
            stackId="band"
            type="linear"
            stroke="none"
            fill="none"
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            dataKey="__gewinn"
            stackId="band"
            type="linear"
            stroke="none"
            fill={AREA_PROFIT}
            fillOpacity={0.16}
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            dataKey="__verlust"
            stackId="band"
            type="linear"
            stroke="none"
            fill={AREA_LOSS}
            fillOpacity={0.16}
            isAnimationActive={false}
            legendType="none"
          />

          {(["revenue", "cost"] as const).map((k) => (
            <Line
              key={k}
              dataKey={k}
              name={config[k].label}
              type="linear"
              stroke={config[k].color}
              strokeWidth={2}
              // Always dotted, not only for a single point: the marks are what let a reader line a
              // month up against the axis on a chart this wide.
              dot={{ r: 3, strokeWidth: 0, fill: config[k].color }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ChartContainer>

      {/* Hand-built rather than <ChartLegend>: it has to name what the two FILLS mean as well as
          the two lines, and a recharts legend only knows about series. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        {(["revenue", "cost"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-2 text-foreground">
            <span
              aria-hidden
              className="inline-block h-0.5 w-6 rounded-full"
              style={{ backgroundColor: config[k].color }}
            />
            {config[k].label}
          </span>
        ))}
        {(
          [
            [AREA_PROFIT, "reports.chart.gewinnFlaeche"],
            [AREA_LOSS, "reports.chart.verlustFlaeche"],
          ] as const
        ).map(([colour, key]) => (
          <span key={key} className="inline-flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: colour, opacity: 0.45 }}
            />
            {t(key)}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Revenue, costs, and the gap named as profit or loss.
 *
 * Custom because the stacked band puts three helper series in the payload that mean nothing to a
 * reader (`__basis`, `__gewinn`, `__verlust`), and because the number they actually want — did this
 * month cover itself, and by how much — is not a series at all.
 */
function HistoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  label?: string;
}) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload ?? {};
  const revenue = Number(p.revenue) || 0;
  const cost = Number(p.cost) || 0;
  const difference = revenue - cost;

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <dl className="mt-1.5 space-y-1">
        {[
          [t("reports.summe.umsatz"), revenue, SERIE[0]],
          [t("reports.summe.gesamtkosten"), cost, SERIE[1]],
        ].map(([name, value, colour]) => (
          <div key={String(name)} className="flex items-center justify-between gap-4">
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: String(colour) }}
              />
              {String(name)}
            </dt>
            <dd className="tabular-nums text-foreground">{formatEUR(Number(value))}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
          <dt className="text-muted-foreground">
            {difference >= 0 ? t("reports.chart.gewinn") : t("reports.chart.verlust")}
          </dt>
          <dd
            className="font-medium tabular-nums"
            style={{ color: difference >= 0 ? AREA_PROFIT : AREA_LOSS }}
          >
            {formatEUR(Math.abs(difference))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Cost breakdown over time: one stacked bar per period, one segment per cost category.
 *
 * Stacked rather than grouped because the question is "what made up this period's costs", and the
 * bar's full height answering "how much in total" is the same question's other half.
 */
export function CostHistory({
  points,
  categories,
}: {
  points: HistoryPoint[];
  /** Ordered biggest first. At most MAX_KATEGORIEN, plus an optional folded "rest" entry. */
  categories: { key: string; label: string }[];
}) {
  const config = useMemo(
    () =>
      Object.fromEntries(
        categories.map((k, i) => [
          k.key,
          { label: k.label, color: k.key === "__rest" ? SERIE_REST : SERIE[i % SERIE.length] },
        ]),
      ) satisfies ChartConfig,
    [categories],
  );

  return (
    <ChartContainer config={config} className="h-[230px] w-full">
      <BarChart data={points} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={AXIS} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tick={AXIS}
          tickFormatter={(v: number) => formatEURCompact(v)}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatEUR(Number(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {categories.map((k) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            name={config[k.key].label}
            stackId="cost"
            fill={config[k.key].color}
            isAnimationActive={false}
            // A hairline of surface between segments, so two stacked fills never touch and read
            // as one block.
            stroke="var(--color-card)"
            strokeWidth={1}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
