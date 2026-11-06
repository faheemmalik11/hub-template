export interface TickHistoryRow {
  type: string;
  data: Record<string, unknown> | null;
}

export const TICK_HISTORY_TYPE = "check_tick";
export const ALL_CHECKED_HISTORY_TYPE = "all_checks_done";

export interface TickItem {
  key: string;
  status: string;
}

export function ticksFromHistory(history: readonly TickHistoryRow[]): Map<string, string | null> {
  const latest = new Map<string, string | null>();
  for (const entry of history) {
    if (entry.type === TICK_HISTORY_TYPE) {
      const key = entry.data?.key;
      if (typeof key !== "string" || latest.has(key)) continue;
      latest.set(key, entry.data?.ticked === true ? String(entry.data?.status ?? "") : null);
    }
    if (entry.type === ALL_CHECKED_HISTORY_TYPE) {
      const items = entry.data?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const key = (item as { key?: unknown })?.key;
        if (typeof key !== "string" || latest.has(key)) continue;
        latest.set(key, String((item as { status?: unknown }).status ?? ""));
      }
    }
  }
  return latest;
}

export function tickedKeys(
  items: readonly TickItem[],
  history: readonly TickHistoryRow[],
): Set<string> {
  const latest = ticksFromHistory(history);
  const ticked = new Set<string>();
  for (const item of items) {
    const stored = latest.get(item.key);
    if (stored !== undefined && stored !== null && stored === item.status) ticked.add(item.key);
  }
  return ticked;
}

export function allChecked(items: readonly TickItem[], ticked: ReadonlySet<string>): boolean {
  return items.length > 0 && items.every((item) => ticked.has(item.key));
}

export function tickEntry(item: TickItem, ticked: boolean) {
  return {
    type: TICK_HISTORY_TYPE,
    data: { key: item.key, status: item.status, ticked },
  };
}

export function allCheckedEntry(items: readonly TickItem[]) {
  return {
    type: ALL_CHECKED_HISTORY_TYPE,
    data: { items: items.map((item) => ({ key: item.key, status: item.status })) },
  };
}
