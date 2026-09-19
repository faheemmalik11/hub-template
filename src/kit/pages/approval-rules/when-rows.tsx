import type { DimensionKey, ScopeOption } from "../../adapters/approval-rules";
import type { ApprovalRulesLabels } from "./labels";
import { DIMENSION_ICON } from "./scope-inline";

export function WhenRows({
  scope,
  dimensions,
  options,
  labels,
}: {
  scope: Partial<Record<DimensionKey, string | null>>;
  dimensions: DimensionKey[];
  options: Partial<Record<DimensionKey, ScopeOption[]>>;
  labels: ApprovalRulesLabels;
}) {
  const pinned = dimensions.filter((key) => !!scope[key]);

  return (
    <dl className="divide-y divide-border">
      {pinned.map((key) => {
        const Icon = DIMENSION_ICON[key];
        const option = (options[key] ?? []).find((entry) => entry.id === scope[key]);
        return (
          <div key={key} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
            <dt className="flex min-w-0 shrink-0 items-center gap-2 sm:w-40">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{labels.dimension[key]}</span>
            </dt>
            <dd className="min-w-0 flex-1 break-words text-sm text-muted-foreground">
              {option?.code ?? option?.label ?? labels.row.unknownApprover}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
