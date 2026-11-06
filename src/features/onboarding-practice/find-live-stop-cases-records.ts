import { TABLE } from "@/config/tables";
import { sb } from "@/data/client";

async function liveIds(table: string, ids: string[]): Promise<string[]> {
  const { data, error } = await sb.from(table).select("id").in("id", ids).is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export async function findLiveStopCasesRecordIds(recordIds: string[]): Promise<string[]> {
  if (recordIds.length === 0) return [];
  const [documents, suppliers, accounts] = await Promise.all([
    liveIds(TABLE.documents, recordIds),
    liveIds(TABLE.suppliers, recordIds),
    liveIds(TABLE.supplierBankAccounts, recordIds),
  ]);
  return [...suppliers, ...accounts, ...documents];
}
