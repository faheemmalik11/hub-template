import { cn } from "@/lib/utils";

/** A figure tile for analytics screens: label over value, optional caveat line, loss on a red
 *  wash. Same visual language as the overview's KPI cards, kept in the portable core so screens
 *  built on it copy between Hubs with their look intact. */
export function Kennzahl({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  /** Amber value for "this number is a flag, not a result". */
  accent?: boolean;
  /** Small caveat printed under the figure, e.g. when a filter narrows what the label promises. */
  hint?: string;
}) {
  const negativ = value.trim().startsWith("-");
  return (
    <div className={cn("rounded-xl p-3", negativ ? "bg-red-50" : "bg-brand-wash")}>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          accent ? "text-amber-700" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-amber-700">{hint}</div>}
    </div>
  );
}
