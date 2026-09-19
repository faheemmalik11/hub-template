import type { ComponentType } from "react";

import { Skeleton } from "../../ui/skeleton";
import { cn } from "../../lib/class-names";
import { QueueKpiCard, type QueueTone } from "./queue-kpi-card";

export interface QueueCard {
  key: string;
  label: string;
  description: string;
  count: string;
  amount: string;
  tone: QueueTone;
  icon: ComponentType<{ className?: string }>;
  to?: string;
  search?: Record<string, unknown>;
  onSelect?: () => void;
  active?: boolean;
}

export function QueueKpiRow({
  cards,
  loading,
  className,
}: {
  cards: QueueCard[];
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", className)}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (cards.length === 0) return null;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", className)}>
      {cards.map(({ key, ...card }) => (
        <QueueKpiCard key={key} {...card} />
      ))}
    </div>
  );
}
