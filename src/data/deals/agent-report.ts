import { keepPreviousData, useQuery } from "@tanstack/react-query";

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
  total_count: number;
  all_closings_current: number;
  all_closings_previous: number;
  all_volume_current: number;
  all_volume_previous: number;
  all_commission_current: number;
  all_commission_previous: number;
  all_bonuses_current: number;
  all_bonuses_previous: number;
  all_bonuses_approved_current: number;
  all_bonuses_approved_previous: number;
}

export type AgentCommissionReportSort = "agent" | "closings" | "volume" | "commission" | "bonuses";

export interface AgentCommissionReportQuery {
  cutoff: string;
  search: string;
  sort: AgentCommissionReportSort;
  ascending: boolean;
  page: number;
  pageSize: number;
}

export interface AgentCommissionReportPage {
  rows: AgentCommissionReportRow[];
  total: number;
}

// Row level security on deals/broker_bonuses decides whether this returns every agent or only the
// caller's own row; an empty array is a legitimate answer, not an error.
export function useAgentCommissionReport(query: AgentCommissionReportQuery) {
  return useQuery({
    queryKey: queryKeys.deals.agentReport(query),
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AgentCommissionReportPage> => {
      const { data, error } = await sb.rpc("agent_commission_report", {
        p_cutoff: query.cutoff,
        p_search: query.search,
        p_sort: query.sort,
        p_ascending: query.ascending,
        p_limit: query.pageSize,
        p_offset: (query.page - 1) * query.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as AgentCommissionReportRow[];
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
  });
}

export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / before) * 100;
}
