import { useMemo } from "react";

import { QueueKpiRow, type QueueCard } from "../../components/invoice-queue";
import type { InvoiceListAdapter, InvoiceListConfig } from "../../adapters/invoice-list";

export interface QueueCardsWidgetProps {
  adapter: InvoiceListAdapter;
  specs: InvoiceListConfig["queueCards"];
  activeKey: string | null;
  onToggle: (key: string) => void;
  className?: string;
}

export function QueueCardsWidget({
  adapter,
  specs,
  activeKey,
  onToggle,
  className,
}: QueueCardsWidgetProps) {
  const query = adapter.useQueueCards?.();

  const cards: QueueCard[] = useMemo(() => {
    if (!specs || !query?.data) return [];
    const counted = new Map(query.data.map((card) => [card.key, card]));
    return specs
      .filter((spec) => counted.has(spec.key))
      .map((spec) => {
        const count = counted.get(spec.key)!;
        return {
          key: spec.key,
          label: spec.key,
          description: "",
          count: String(count.count),
          amount: adapter.formatMoney(count.amount),
          tone: spec.tone,
          icon: spec.icon,
          active: activeKey === spec.key,
          onSelect: () => onToggle(spec.key),
        };
      });
  }, [specs, query?.data, activeKey, adapter, onToggle]);

  if (cards.length === 0) return null;
  return <QueueKpiRow cards={cards} loading={query?.loading} className={className} />;
}
