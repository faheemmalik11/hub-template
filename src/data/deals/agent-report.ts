import { useQuery } from "@tanstack/react-query";

import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export interface AgentCommissionReportRow {
  agent_user_id: string;
  agent_name: string;
  closings_current: number;
  closings_previous: number;
  volume_current: number;
  volume_previous: number;
  commission_current: number;
  commission_previous: number;
  bonuses_current: number;
  bonuses_previous: number;
  bonuses_approved_current: number;
  bonuses_approved_previous: number;
}

// Row level security on deals/broker_bonuses decides whether this returns every agent or only the
// caller's own row; an empty array is a legitimate answer, not an error.
export function useAgentCommissionReport(cutoff: string) {
  return useQuery({
    queryKey: queryKeys.deals.agentReport(cutoff),
    staleTime: STALE,
    queryFn: async (): Promise<AgentCommissionReportRow[]> => {
      const { data, error } = await sb.rpc("agent_commission_report", { p_cutoff: cutoff });
      if (error) throw error;
      return (data ?? []) as AgentCommissionReportRow[];
    },
  });
}

export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / before) * 100;
}
