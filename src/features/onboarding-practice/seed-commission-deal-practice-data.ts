import { sb } from "@/data/client";

export async function seedCommissionDealPracticeData(): Promise<string[]> {
  const { data, error } = await sb.rpc("seed_commission_deal_practice_data");
  if (error) throw error;
  return (data ?? []) as string[];
}
