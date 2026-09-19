import { Building2, Home, Layers, Store } from "lucide-react";
import type { ComponentType } from "react";

import type { DimensionKey, ScopeOption } from "../../adapters/approval-rules";
import type { ApprovalRulesLabels } from "./labels";

export const DIMENSION_ICON: Record<DimensionKey, ComponentType<{ className?: string }>> = {
  company: Building2,
  supplier: Store,
  property: Home,
  businessLine: Layers,
};

export function ScopeInline({
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
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {pinned.map((key) => {
        const Icon = DIMENSION_ICON[key];
        const option = (options[key] ?? []).find((entry) => entry.id === scope[key]);
        const value = option?.code ?? option?.label ?? labels.row.unknownApprover;
        return (
          <span
            key={key}
            title={`${labels.dimension[key]}: ${option?.label ?? value}`}
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs"
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{value}</span>
          </span>
        );
      })}
    </div>
  );
}
