import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { requiredReason } from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/lib/data/types";

// `companies` has carried deleted_at/deleted_by/delete_reason since early on, but nothing ever wrote
// or read them: there was no archive action anywhere in the app, and this hook returned archived rows
// as if they were live. Both halves are fixed together, since filtering without an archive action
// would be pointless and an archive action without filtering would do nothing visible.
//
// `includeArchived` exists for the list's "Archivierte anzeigen" toggle, which is also the only way
// to restore one. Everything else (pickers, dropdowns, the invoice screens) calls this with no
// argument and therefore never offers an archived company.
export function useCompanies(opts?: { includeArchived?: boolean }) {
  const includeArchived = opts?.includeArchived ?? false;
  return useQuery({
    queryKey: ["gesellschaften", { includeArchived }],
    staleTime: STALE,
    queryFn: async (): Promise<Company[]> => {
      let query = supabase.from(TABLE.companies).select("*");
      if (!includeArchived) query = query.is("deleted_at", null);
      const { data, error } = await query.order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Company[];
    },
  });
}

// Archive a company. Deliberately a soft delete, never a hard one: `companies.code` is referenced by
// string from invoices.company_code and entity_aliases.entity_code (neither is a foreign key, see the
// rename-cascade migration), so removing the row would strand exactly the references that migration
// exists to protect. Archiving keeps the row, the code and every reference intact, and is reversible.
export function useSoftDeleteCompany(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.companies)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(reason),
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", companyId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}

export function useRestoreCompany(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.companies)
        .update({
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", companyId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ["gesellschaft", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await supabase
        .from(TABLE.companies)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Company) ?? null;
    },
  });
}

// Gesellschaft (Stammdaten) anlegen. Gibt die neue Zeile zurück.
export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { code: string; name: string }): Promise<Company> => {
      const { data, error } = await sb.from(TABLE.companies).insert(values).select("*").single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gesellschaften"] }),
  });
}

// Gesellschaft-Stammdaten aktualisieren.
export function useUpdateCompany(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Company>) => {
      // .select() so the write reports itself: companies is admin-only to update, and an update RLS
      // turns away simply matches no row and returns success.
      const { data, error } = await sb
        .from(TABLE.companies)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", companyId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          "Gesellschaften dürfen nur Administratoren ändern. Es wurde nichts gespeichert.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gesellschaft", companyId] });
      qc.invalidateQueries({ queryKey: ["gesellschaften"] });
    },
  });
}
