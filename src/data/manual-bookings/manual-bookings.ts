import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import type { ManualBooking, ManualBookingExpanded } from "@/lib/data/types";

// ---- Manual booking (Briefing Screen 11; migration 0033) ----

function invalidateManualBookingState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["manual_bookings"] });
}

// Expanded rows in [von, bis] — a recurring booking already appears once per calendar month it
// covers (RPC manual_bookings_expanded), so the caller never expands it itself. companyId null
// means every company (migration 0034), e.g. Auswertungen's "Alle Gesellschaften" view.
export function useManualBookings(
  companyId: string | null,
  fromDate: string | null,
  toDate: string | null,
) {
  return useQuery({
    queryKey: ["manual_bookings", companyId, fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    staleTime: STALE,
    queryFn: async (): Promise<ManualBookingExpanded[]> => {
      const { data, error } = await sb.rpc("manual_bookings_expanded", {
        p_company: companyId,
        p_von: fromDate,
        p_bis: toDate,
      });
      if (error) throw error;
      return (data ?? []) as ManualBookingExpanded[];
    },
  });
}

// All non-deleted template rows for one company, regardless of period — for the management list
// (editing/deleting a template itself, not one of its expanded monthly occurrences). null
// companyId means "all companies" (the page's own default, ALLE_GESELLSCHAFTEN), mirroring
// useManualBookings above — the Aktionen column needs a template row for every visible booking
// regardless of which company filter is active, not just when one company is picked.
export function useManualBookingTemplates(companyId: string | null) {
  return useQuery({
    queryKey: ["manual_bookings", "templates", companyId],
    staleTime: STALE,
    queryFn: async (): Promise<ManualBooking[]> => {
      // Paged. A recurring booking with no end date already expands to ~240 rows per template
      // under the Kostenanalyse's 20-year span, so a handful of templates crosses the platform's
      // per-request row cap — and a truncated response here does not look like an error, it looks
      // like bookings that quietly stopped existing.
      return await fetchAllRows<ManualBooking>((from, to, withCount) => {
        let q = sb
          .from(TABLE.manualBookings)
          .select("*", withCount ? { count: "exact" } : undefined)
          .is("deleted_at", null);
        if (companyId) q = q.eq("company_id", companyId);
        return q.order("period", { ascending: false }).range(from, to);
      });
    },
  });
}

export type ManualBookingInput = {
  company_id: string;
  property_id?: string | null;
  category_id: string;
  period: string;
  amount: number;
  note?: string | null;
  is_recurring?: boolean;
  recurrence_until?: string | null;
};

export function useCreateManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualBookingInput): Promise<ManualBooking> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.manualBookings)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      // Audit trail. These figures land in the management P&L on equal footing with receipts, and
      // until now nothing recorded who put them there beyond created_by — an EDIT left no trace at
      // all. Same convention restore_record()/purge_record() already follow.
      const row = data as ManualBooking;
      await insertChangeHistory("manual_bookings", row.id, "created", null, { ...input });
      return row;
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}

export function useUpdateManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<ManualBookingInput> }) => {
      const actor = await actorEmail();
      // Read the row BEFORE writing, so the trail records what the value was and not just what it
      // became. An amount that feeds the P&L could previously be rewritten leaving only updated_at.
      const { data: before } = await sb
        .from(TABLE.manualBookings)
        .select("*")
        .eq("id", args.id)
        .maybeSingle();
      const { error } = await sb
        .from(TABLE.manualBookings)
        .update({ ...args.changes, updated_at: new Date().toISOString(), updated_by: actor })
        .eq("id", args.id);
      if (error) throw error;
      await insertChangeHistory("manual_bookings", args.id, "updated", null, {
        vorher: before ?? null,
        nachher: args.changes,
      });
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}

// Soft delete only, same convention as bwa_categories: "remains changeable and deletable at any
// time", but nothing already referencing this row (e.g. an audit trail) loses its history.
export function useSoftDeleteManualBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.manualBookings)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(args.reason),
        })
        .eq("id", args.id);
      if (error) throw error;
      await insertChangeHistory("manual_bookings", args.id, "deleted", args.reason || null);
    },
    onSuccess: () => invalidateManualBookingState(qc),
  });
}
