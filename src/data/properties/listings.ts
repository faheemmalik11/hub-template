import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";
import { syncPropertyListings } from "@/lib/api/property-listings.functions";

export interface ListedProperty {
  id: string;
  code: string;
  name: string;
  address: string | null;
  external_id: string | null;
  crm_status: string | null;
  marketing_type: string | null;
  property_type: string | null;
  usage_type: string | null;
  asking_price: number | null;
  sold_price: number | null;
  sold_on: string | null;
  living_space: number | null;
  plot_area: number | null;
  room_count: number | null;
  commission_note: string | null;
  broker_name: string | null;
  broker_email: string | null;
  parties: Array<{ role: string; external_id: string }>;
  archived_in_crm: boolean;
  crm_updated_at: string | null;
  crm_synced_at: string | null;
}

const LISTED_COLUMNS =
  "id, code, name, address, external_id, crm_status, marketing_type, property_type, usage_type, " +
  "asking_price, sold_price, sold_on, living_space, plot_area, room_count, commission_note, " +
  "broker_name, broker_email, parties, archived_in_crm, crm_updated_at, crm_synced_at";

export function usePropertyListings({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.propertyListings.all,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<ListedProperty[]> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select(LISTED_COLUMNS)
        .not("crm_synced_at", "is", null)
        .is("deleted_at", null)
        .order("crm_updated_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ListedProperty[];
    },
  });
}

export function usePropertyCrmData(code: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.propertyCrmData(code),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select("crm_data")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      return (data?.crm_data as Record<string, unknown> | null) ?? null;
    },
  });
}

export function useSyncPropertyListings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncPropertyListings(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.propertyListings.all });
      qc.invalidateQueries({ queryKey: ["objekte"] });
      qc.invalidateQueries({ queryKey: ["property-crm-data"] });
    },
  });
}
