import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import type { UnmaintainedCrmField } from "@/components/commission/unmaintained-crm-fields";

export interface DealWithUnmaintainedFields {
  deal_id: string;
  property_id: string | null;
  property_label: string | null;
  property_external_id: string | null;
  notarised_on: string | null;
  status: string;
  missing_fields: UnmaintainedCrmField[];
  missing_count: number;
}

export type UnmaintainedFieldsSort = "property_label" | "notarised_on" | "missing_count";

export interface UnmaintainedFieldsQuery {
  search: string;
  missingField: UnmaintainedCrmField | null;
  sort: UnmaintainedFieldsSort;
  ascending: boolean;
  page: number;
  pageSize: number;
}

export interface UnmaintainedFieldsPage {
  rows: DealWithUnmaintainedFields[];
  total: number;
}

export function useDealsWithUnmaintainedFields(query: UnmaintainedFieldsQuery) {
  return useQuery({
    queryKey: ["deals-with-unmaintained-fields", query],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<UnmaintainedFieldsPage> => {
      const from = (query.page - 1) * query.pageSize;
      let request = sb.from(TABLE.vDealsWithUnmaintainedFields).select("*", { count: "exact" });

      const term = query.search.trim();
      if (term) request = request.ilike("property_label", `%${term}%`);
      if (query.missingField) request = request.contains("missing_fields", [query.missingField]);

      const { data, error, count } = await request
        .order(query.sort, { ascending: query.ascending, nullsFirst: false })
        .range(from, from + query.pageSize - 1);
      if (error) throw error;
      return {
        rows: (data ?? []) as DealWithUnmaintainedFields[],
        total: count ?? 0,
      };
    },
  });
}
