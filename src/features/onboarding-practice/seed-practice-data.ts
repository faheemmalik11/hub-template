import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export async function seedPracticeData(): Promise<void> {
  const { error } = await sb.rpc("seed_onboarding_demo_data");
  if (error) throw error;
}
