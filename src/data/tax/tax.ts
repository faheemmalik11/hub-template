import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import type { VatReserve } from "@/lib/data/types";

// ---- VAT deductibility & tax reserve (Briefing Screen 5; migration 0031) ----

// Per-company input-VAT summary. A recommendation only, never a booking — staleTime 0 since this
// is read right before a decision (how much to set aside), not cached list data.
export function useVatReserve(
  companyId: string | null,
  fromDate?: string | null,
  toDate?: string | null,
) {
  return useQuery({
    queryKey: ["vat_reserve", companyId, fromDate ?? null, toDate ?? null],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async (): Promise<VatReserve> => {
      const { data, error } = await sb.rpc("vat_reserve", {
        p_company: companyId,
        p_von: fromDate ?? null,
        p_bis: toDate ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        company_id: row?.company_id ?? companyId!,
        fromDate: row?.fromDate ?? null,
        toDate: row?.toDate ?? null,
        input_vat_total: Number(row?.input_vat_total ?? 0),
        input_vat_deductible: Number(row?.input_vat_deductible ?? 0),
        input_vat_nondeductible: Number(row?.input_vat_nondeductible ?? 0),
        input_vat_unresolved_count: Number(row?.input_vat_unresolved_count ?? 0),
        input_vat_unresolved_amount: Number(row?.input_vat_unresolved_amount ?? 0),
        output_vat: Number(row?.output_vat ?? 0),
        reserve: Number(row?.reserve ?? 0),
      };
    },
  });
}

/**
 * The same figure for several companies at once, for the "Alle Gesellschaften" breakdown.
 *
 * Deliberately N calls rather than one summed figure: each company owes VAT to its own Finanzamt
 * separately, so a single combined number would be meaningless. `vat_reserve` takes one company,
 * so the fan-out happens here.
 */
export function useVatReserveAll(
  companyIds: string[],
  fromDate?: string | null,
  toDate?: string | null,
) {
  // Sorted so the key is stable no matter what order the caller's company list arrives in.
  const ids = [...companyIds].sort();
  return useQuery({
    queryKey: ["vat_reserve_all", ids, fromDate ?? null, toDate ?? null],
    enabled: ids.length > 0,
    staleTime: 0,
    queryFn: async (): Promise<VatReserve[]> => {
      return Promise.all(
        ids.map(async (companyId): Promise<VatReserve> => {
          const { data, error } = await sb.rpc("vat_reserve", {
            p_company: companyId,
            p_von: fromDate ?? null,
            p_bis: toDate ?? null,
          });
          if (error) throw error;
          const row = Array.isArray(data) ? data[0] : data;
          return {
            company_id: row?.company_id ?? companyId,
            fromDate: row?.fromDate ?? null,
            toDate: row?.toDate ?? null,
            input_vat_total: Number(row?.input_vat_total ?? 0),
            input_vat_deductible: Number(row?.input_vat_deductible ?? 0),
            input_vat_nondeductible: Number(row?.input_vat_nondeductible ?? 0),
            input_vat_unresolved_count: Number(row?.input_vat_unresolved_count ?? 0),
            input_vat_unresolved_amount: Number(row?.input_vat_unresolved_amount ?? 0),
            output_vat: Number(row?.output_vat ?? 0),
            reserve: Number(row?.reserve ?? 0),
          };
        }),
      );
    },
  });
}
