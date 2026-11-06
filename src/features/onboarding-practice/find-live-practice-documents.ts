import { TABLE } from "@/config/tables";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export async function discardPracticeDocuments(documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;
  const { data } = await supabase.auth.getUser();
  await sb
    .from(TABLE.documents)
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: data.user?.email ?? null,
      delete_reason: "Onboarding practice, discarded automatically",
    })
    .in("id", documentIds);
}

export async function findLivePracticeDocumentIds(documentIds: string[]): Promise<string[]> {
  if (documentIds.length === 0) return [];
  const { data, error } = await sb
    .from(TABLE.documents)
    .select("id")
    .in("id", documentIds)
    .eq("is_demo", true)
    .is("deleted_at", null);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}
