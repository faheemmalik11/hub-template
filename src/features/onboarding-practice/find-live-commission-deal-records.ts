import { TABLE } from "@/config/tables";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/data/client";

export async function discardCommissionDealPracticeRecords(customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return;
  const { data } = await supabase.auth.getUser();
  await sb
    .from(TABLE.customers)
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: data.user?.email ?? null,
      delete_reason: "Onboarding practice, discarded automatically",
    })
    .in("id", customerIds);
}

export async function findLiveCommissionDealPracticeRecordIds(
  customerIds: string[],
): Promise<string[]> {
  if (customerIds.length === 0) return [];
  const { data, error } = await sb
    .from(TABLE.customers)
    .select("id")
    .in("id", customerIds)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}
