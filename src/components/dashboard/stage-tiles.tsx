import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** One step of a lifecycle strip: tinted tile, label on top, count below, linking into the list
 *  filtered to that step so the number is one a reader can check rather than trust. */
export interface StageTile {
  key: string;
  label: string;
  count: number;
  tileCls: string;
  labelCls: string;
  link: { to: string; search?: Record<string, unknown> };
}

export function StageTiles({ stages, loading }: { stages: StageTile[]; loading: boolean }) {
  return (
    <div className="mt-3 grid flex-1 auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
      {stages.map((stage) => (
        <Link
          key={stage.key}
          to={stage.link.to}
          search={stage.link.search as never}
          className={cn(
            "flex flex-col justify-center rounded-xl p-2.5 transition-colors hover:bg-brand-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            stage.tileCls,
          )}
        >
          <div className={cn("truncate text-sm font-medium", stage.labelCls)}>{stage.label}</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {loading ? "—" : stage.count}
          </div>
        </Link>
      ))}
    </div>
  );
}
