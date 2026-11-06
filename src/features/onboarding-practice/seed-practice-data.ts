import { sb } from "@/data/client";

export async function seedPracticeData(): Promise<void> {
  const { error } = await sb.rpc("seed_onboarding_demo_data");
  if (error) throw error;
}
