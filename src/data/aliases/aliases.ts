import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import type { Lieferant, SupplierAlias, SupplierDuplicateGroup } from "@/lib/data/types";

// ---- Known spellings (entity_aliases, migrations 0003 / 0040 / 20260824110000) ----
//
// One table serves every kind of entity: 'gesellschaft' and 'objekt' are keyed by their CODE
// ('IMKO', 'DO-SUM'), 'lieferant' by the supplier's uuid. The pipeline reads the first two to map a
// name printed on a document to a canonical code; supplier aliases are the Hub's own record and are
// what merge_suppliers writes the merged-away name into.
//
// Since 20260824110000 an alias may name only ONE entity of its type, enforced by
// entity_aliases_one_owner_uniq on (entity_type, folded(alias)). That is why the add hook maps
// 23505 to a typed error instead of letting a raw Postgres message reach a German-only UI: the two
// unique indexes on this table mean two different things to the person typing.

export type EntityAliasType = "gesellschaft" | "objekt" | "lieferant";

export function useEntityAliases(entityType: EntityAliasType, entityCode: string) {
  return useQuery({
    queryKey: ["entity-aliases", entityType, entityCode],
    enabled: !!entityCode,
    staleTime: STALE,
    queryFn: async (): Promise<SupplierAlias[]> => {
      const { data, error } = await sb
        .from(TABLE.entityAliases)
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_code", entityCode)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierAlias[];
    },
  });
}

export function useAddEntityAlias(entityType: EntityAliasType, entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alias: string) => {
      const actor = await actorEmail();
      const { error } = await sb.from(TABLE.entityAliases).insert({
        entity_type: entityType,
        entity_code: entityCode,
        alias: alias.trim(),
        created_by: actor,
      });
      if (!error) return;
      // Which index rejected it decides what the user should do about it, so the two are
      // distinguished here rather than both surfacing as "add failed".
      const detail = `${(error as { message?: string }).message ?? ""} ${
        (error as { details?: string }).details ?? ""
      }`;
      if ((error as { code?: string }).code === "23505") {
        // Another entity of this type already answers to this spelling. Nothing the caller can fix
        // by retrying -- somebody has to decide which entity keeps it.
        if (detail.includes("entity_aliases_one_owner_uniq")) throw new Error("ALIAS_CLAIMED");
        // This entity already has it, possibly as a deactivated row.
        throw new Error("ALIAS_EXISTS");
      }
      throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-aliases", entityType, entityCode] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
    },
  });
}

export function useDeactivateEntityAlias(entityType: EntityAliasType, entityCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await sb
        .from(TABLE.entityAliases)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-aliases", entityType, entityCode] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
    },
  });
}

// Supplier-scoped wrappers, kept because the merge flow and the supplier detail page already read
// through these names. They are the generic hooks with entity_type pinned.
export function useSupplierAliases(supplierId: string) {
  return useEntityAliases("lieferant", supplierId);
}

export function useAddSupplierAlias(supplierId: string) {
  return useAddEntityAlias("lieferant", supplierId);
}

export function useDeactivateSupplierAlias(supplierId: string) {
  return useDeactivateEntityAlias("lieferant", supplierId);
}

export function useSupplierDuplicates() {
  return useQuery({
    queryKey: ["supplier-duplicates"],
    staleTime: STALE,
    queryFn: async (): Promise<SupplierDuplicateGroup[]> => {
      const { data, error } = await sb.from(TABLE.vSupplierDuplicates).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as SupplierDuplicateGroup[];
    },
  });
}

export function useMergeSuppliers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { keepId: string; mergeId: string; reason?: string }) => {
      const actor = await actorEmail();
      const { data, error } = await sb.rpc("merge_suppliers", {
        p_keep_id: input.keepId,
        p_merge_id: input.mergeId,
        p_merged_by: actor,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as unknown as Lieferant;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      // Prefix-match invalidation: the RPC carries the merged-away supplier's IBAN history and
      // records its name as an alias under the SURVIVING id, so both the survivor's own queries
      // and the list page's unscoped "__all" history query need to refetch, not just the two
      // suppliers involved.
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
      qc.invalidateQueries({ queryKey: ["supplier-aliases"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}
