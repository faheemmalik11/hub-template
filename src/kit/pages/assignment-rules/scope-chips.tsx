import type { DimensionKey, ScopeOption } from "../../adapters/assignment-rules";
import type { AssignmentRulesLabels } from "./labels";

export function ScopeChips({
  scope,
  dimensions,
  options,
  referencePattern,
  labels,
}: {
  scope: Partial<Record<DimensionKey, string | null>>;
  dimensions: DimensionKey[];
  options: Partial<Record<DimensionKey, ScopeOption[]>>;
  referencePattern?: string | null;
  labels: AssignmentRulesLabels;
}) {
  const pinned = dimensions.filter((key) => !!scope[key]);

  if (pinned.length === 0 && !referencePattern) {
    return <span className="text-xs text-muted-foreground">{labels.any}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {pinned.map((key) => {
        const option = (options[key] ?? []).find((entry) => entry.id === scope[key]);
        const value = option?.code
          ? `${option.code}${option.keywords ? ` · ${option.keywords}` : ""}`
          : (option?.label ?? scope[key]);
        return (
          <span
            key={key}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
          >
            <span className="shrink-0 text-muted-foreground">{labels.dimension[key]}</span>
            <span className="truncate text-foreground">{value}</span>
          </span>
        );
      })}
      {referencePattern && (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs">
          <span className="shrink-0 text-muted-foreground">{labels.reference}</span>
          <span className="truncate text-foreground">{referencePattern}</span>
        </span>
      )}
    </div>
  );
}
