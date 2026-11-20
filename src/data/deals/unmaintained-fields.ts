import { useQuery } from "@tanstack/react-query";

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
}

export function useDealsWithUnmaintainedFields() {
  return useQuery({
    queryKey: ["deals-with-unmaintained-fields"],
    staleTime: STALE,
    queryFn: async (): Promise<DealWithUnmaintainedFields[]> => {
      const { data, error } = await sb
        .from(TABLE.vDealsWithUnmaintainedFields)
        .select("*")
        .order("notarised_on", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as DealWithUnmaintainedFields[];
    },
  });
}
