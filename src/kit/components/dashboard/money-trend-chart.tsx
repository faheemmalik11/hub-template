import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Skeleton } from "../../ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";

export interface MoneyTrendPoint {
  label: string;
  incoming: number;
  outgoing: number;
}

export function MoneyTrendChart({
  data,
  loading,
  incomingLabel,
  outgoingLabel,
  formatMoney,
  formatMoneyCompact,
}: {
  data: MoneyTrendPoint[];
  loading: boolean;
  incomingLabel: string;
  outgoingLabel: string;
  formatMoney: (value: number) => string;
  formatMoneyCompact: (value: number) => string;
}) {
  const config = useMemo(
    () =>
      ({
        incoming: { label: incomingLabel, color: "var(--color-chart-1)" },
        outgoing: { label: outgoingLabel, color: "var(--color-chart-2)" },
      }) satisfies ChartConfig,
    [incomingLabel, outgoingLabel],
  );

  if (loading) return <Skeleton className="h-[190px] w-full rounded-xl" />;
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
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={46}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(value: number) => formatMoneyCompact(value)}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          dataKey="incoming"
          name={incomingLabel}
          type="monotone"
          stroke="var(--color-incoming)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="outgoing"
          name={outgoingLabel}
          type="monotone"
          stroke="var(--color-outgoing)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
