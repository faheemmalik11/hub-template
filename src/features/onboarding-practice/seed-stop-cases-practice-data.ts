import { sb } from "@/data/client";

import { stopCasesRecordIds } from "./practice-seeded-records";

export async function seedStopCasesPracticeData(reset: boolean): Promise<string[]> {
  const { data, error } = await sb.rpc("seed_stop_cases_practice_data", { p_reset: reset });
  if (error) throw error;
  return stopCasesRecordIds(data as Record<string, unknown>);
}
