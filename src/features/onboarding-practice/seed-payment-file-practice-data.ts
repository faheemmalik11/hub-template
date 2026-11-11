import { sb } from "@/data/client";

export async function seedPaymentFilePracticeData(): Promise<string[]> {
  const { data, error } = await sb.rpc("seed_payment_file_practice_data");
  if (error) throw error;
  return (data ?? []) as string[];
}
