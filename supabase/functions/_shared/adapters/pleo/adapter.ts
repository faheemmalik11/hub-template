import { fetchEntries, pleoConfig, signedAmount, type PleoEntry } from "./client.ts";
import type { CardSpender, ICardAdapter } from "../../banking-adapter.ts";

function spenderKey(entry: PleoEntry): string {
  return (entry.employeeId ?? "").toLowerCase();
}

export function pleoCardAdapter(): ICardAdapter {
  const cfg = pleoConfig();
  return {
    providerKey: "pleo",
    async listSpenders() {
      const bySpender = new Map<string, CardSpender>();

      for await (const { entries } of fetchEntries(cfg)) {
        for (const entry of entries) {
          const key = spenderKey(entry);
          if (!key) continue;

          const amount = signedAmount(entry) ?? 0;
          const existing = bySpender.get(key);
          const bookingDate = entry.bookkeepingDate ?? entry.performedAt ?? null;

          if (!existing) {
            bySpender.set(key, {
              key,
              name: null,
              email: null,
              count: 1,
              total: amount,
              lastBooking: bookingDate,
            });
            continue;
          }

          existing.count += 1;
          existing.total += amount;
          if (bookingDate && (!existing.lastBooking || bookingDate > existing.lastBooking)) {
            existing.lastBooking = bookingDate;
          }
        }
      }

      return Array.from(bySpender.values());
    },
  };
}
