import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { requiredReason } from "@/data/shared";
import type { Company, Property, PropertyCompany } from "@/lib/data/types";

// `objekte` (Migration 0004) is newer than the generated Database type, so it isn't known to the
// typed client — reads go through the untyped `sb` cast, like the writes.
export function useProperties() {
  return useQuery({
    queryKey: ["objekte"],
    staleTime: STALE,
    queryFn: async (): Promise<Property[]> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });
}

// Direct property <-> company assignment (migration 0083), replacing the business-line model.
// Untyped client (newer than the generated Database type), same pattern as `objekte`.
export function usePropertyCompanies() {
  return useQuery({
    queryKey: ["property_companies"],
    staleTime: STALE,
    queryFn: async (): Promise<PropertyCompany[]> => {
      // Soft-deleted links stay in the table as history but must not resolve a company.
      const { data, error } = await sb
        .from(TABLE.propertyCompanies)
        .select("*")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as PropertyCompany[];
    },
  });
}

/**
 * Replaces a property's company set in one call: reads the currently active links, inserts the
 * companies newly added, soft-deletes the ones removed. Soft-delete, never a hard delete — a past
 * link explains which company earlier receipts were booked to, so removing the row outright would
 * erase that explanation. There is deliberately no DELETE policy on the table (migration 0083).
 */
/** A property/company write error, said in the reader's words rather than as a constraint name. */
function assignmentError(error: unknown): Error {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505" && e.message?.includes("cost_center")) {
    return new Error(
      "Diese Kostenstellen-Nummer ist bei dieser Gesellschaft schon einem anderen Objekt zugeordnet.",
    );
  }
  if (e.code === "23505") {
    return new Error("Diese Gesellschaft ist dem Objekt bereits zugeordnet.");
  }
  if (e.code === "42501") {
    return new Error("Kostenstellen-Nummern dürfen nur Administratoren ändern.");
  }
  return error instanceof Error ? error : new Error(String(e.message ?? error));
}

/**
 * Adds a company to a property, or changes one assignment, with its cost-centre number.
 *
 * One call for the assignment modal (components/objekte/zuordnung-dialog.tsx), which the property
 * page and the company page both open, for adding and for editing (17.09.2026).
 *
 * - No `linkId`: a new assignment row, carrying the number.
 * - Same property and company as the row: only the number changes.
 * - Another company or property: the new row is written first and the old one soft-deleted after, so a failure
 *   never leaves the property with neither. Soft-deleted, not rewritten in place, because a past
 *   link explains which company earlier receipts were booked to (same rule as
 *   useSetPropertyCompanies).
 *
 * The number is admin-only, enforced by a trigger (20260917140000, 20260917150000). Every write
 * reports itself, so an update nothing matched is an error rather than "gespeichert".
 */
export function useSavePropertyCompanyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      linkId: string | null;
      previousPropertyId: string | null;
      previousCompanyId: string | null;
      companyId: string;
      number: number | null;
      numberChanged: boolean;
      actor: string | null;
    }) => {
      const now = new Date().toISOString();
      // The same row only when neither side moved. Moving either one is a new assignment.
      const sameRow =
        input.linkId &&
        input.previousCompanyId === input.companyId &&
        input.previousPropertyId === input.propertyId;

      if (sameRow) {
        if (!input.numberChanged) return;
        const { data, error } = await sb
          .from(TABLE.propertyCompanies)
          .update({ cost_centre_number: input.number, updated_at: now })
          .eq("id", input.linkId)
          .select("id");
        if (error) throw assignmentError(error);
        if (!data || data.length === 0) {
          throw new Error("Kostenstellen-Nummern dürfen nur Administratoren ändern.");
        }
        return;
      }

      const { error: insertError } = await sb.from(TABLE.propertyCompanies).insert({
        property_id: input.propertyId,
        company_id: input.companyId,
        // Only sent when set: a non-admin adds the company without a number, and the trigger
        // refuses a number arriving from them.
        ...(input.number != null ? { cost_centre_number: input.number } : {}),
      });
      if (insertError) throw assignmentError(insertError);

      if (input.linkId) {
        const { data, error } = await sb
          .from(TABLE.propertyCompanies)
          .update({ deleted_at: now, deleted_by: input.actor, updated_at: now })
          .eq("id", input.linkId)
          .select("id");
        if (error) throw assignmentError(error);
        if (!data || data.length === 0) {
          throw new Error("Die bisherige Zuordnung konnte nicht entfernt werden.");
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

/** Removes one company from a property. Soft-delete, for the same reason as above. */
export function useRemovePropertyCompanyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { linkId: string; actor: string | null }) => {
      const now = new Date().toISOString();
      const { data, error } = await sb
        .from(TABLE.propertyCompanies)
        .update({ deleted_at: now, deleted_by: input.actor, updated_at: now })
        .eq("id", input.linkId)
        .select("id");
      if (error) throw assignmentError(error);
      if (!data || data.length === 0) {
        throw new Error("Die Zuordnung konnte nicht entfernt werden.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useSetPropertyCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      companyIds: string[];
      actor?: string | null;
    }) => {
      const { data: current, error: readError } = await sb
        .from(TABLE.propertyCompanies)
        .select("*")
        .eq("property_id", input.propertyId)
        .is("deleted_at", null);
      if (readError) throw readError;

      const currentRows = (current ?? []) as PropertyCompany[];
      const currentIds = new Set(currentRows.map((r) => r.company_id));
      const desiredIds = new Set(input.companyIds);

      const toAdd = input.companyIds.filter((id) => !currentIds.has(id));
      const toRemove = currentRows.filter((r) => !desiredIds.has(r.company_id));

      if (toAdd.length > 0) {
        const { error } = await sb
          .from(TABLE.propertyCompanies)
          .insert(toAdd.map((company_id) => ({ property_id: input.propertyId, company_id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await sb
          .from(TABLE.propertyCompanies)
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: input.actor ?? null,
            updated_at: new Date().toISOString(),
          })
          .in(
            "id",
            toRemove.map((r) => r.id),
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_companies"] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ["objekt", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Property | null> => {
      const { data, error } = await sb
        .from(TABLE.properties)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as Property) ?? null;
    },
  });
}

// Objekt (Stammdaten) anlegen. Gibt die neue Zeile zurück.
export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      code: string;
      name?: string | null;
      address?: string | null;
      vat_status?: string | null;
    }): Promise<Property> => {
      const { data, error } = await sb.from(TABLE.properties).insert(values).select("*").single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objekte"] }),
  });
}

/**
 * Archive a property: out of the everyday list, still there for its historical invoices.
 *
 * A reason is required, same as every other soft delete in the Hub, so the Papierkorb can say why
 * a row is there. `properties` was already in trash_eligible_tables() (migration 0062) and the
 * columns were already on the table, so restore worked from the trash before anything here could
 * archive in the first place.
 */
export function useArchiveProperty(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.properties)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(reason),
        })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", propertyId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

export function useUnarchiveProperty(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.properties)
        .update({ deleted_at: null, deleted_by: null, delete_reason: null })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", propertyId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}

// Objekt-Stammdaten aktualisieren.
export function useUpdateProperty(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Property>) => {
      const { error } = await sb
        .from(TABLE.properties)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objekt", propertyId] });
      qc.invalidateQueries({ queryKey: ["objekte"] });
    },
  });
}
