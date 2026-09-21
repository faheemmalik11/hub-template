import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { actorEmail, sb } from "@/data/client";
import { insertHistory, requiredReason } from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies } from "@/data/companies";

// ---- Review decisions: not relevant, archive ----

// "Not relevant": the receipt drops out of processing and is handed back to the mailbox.
// The physical mail move (reset label / mark unread) is a write against the real mailbox and
// lives in the external Python pipeline, so this only records the decision. The pipeline stamps
// mailbox_reset_at once the mail is actually back, which is why the UI reports the return as
// pending rather than done.
// Marking "not relevant" overwrites workflow_status with 'not_relevant'. Whatever approval stage
// the receipt was actually at (rueckfrage, freigegeben_vorgesetzter, ...) has to survive that
// overwrite somewhere, or undoing the mark can only ever restore 'received' — silently demoting a
// receipt that had already been approved. Stored in the history entry's `data` rather than a new
// column: it is exactly the kind of "what was true before this change" fact the audit trail exists
// for, and it needs no migration.
export function useSetNotRelevant(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const { data: before, error: readError } = await supabase
        .from(TABLE.documents)
        .select("workflow_status")
        .eq("id", documentId)
        .maybeSingle();
      if (readError) throw readError;
      const beforeStatus = before?.workflow_status ?? "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: new Date().toISOString(),
          not_relevant_by: actor,
          not_relevant_note: reason || null,
          workflow_status: "not_relevant",
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate).
      await insertHistory(
        documentId,
        "not_relevant",
        reason ? `Als nicht relevant markiert: ${reason}` : "Als nicht relevant markiert",
        { previous_workflow_status: beforeStatus },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", documentId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", documentId] });
    },
  });
}

// Undo the "not relevant" decision and put the receipt back into the review queue, at the stage it
// was actually at before — read from the most recent "not_relevant" history entry this mutation's
// counterpart wrote. An older entry from before this field existed has no previous_workflow_status;
// 'received' is the fallback there, matching the previous (blunter) behaviour for those only.
// Clears mailbox_reset_at too: the pipeline's handshake refers to a return that is no longer wanted,
// and leaving a stale timestamp would make a later, real return look already done.
export function useClearNotRelevant(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: last, error: readError } = await supabase
        .from(TABLE.documentHistory)
        .select("data")
        .eq("document_id", documentId)
        .eq("type", "not_relevant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readError) throw readError;
      const restoreStatus =
        (last?.data as { previous_workflow_status?: string } | null)?.previous_workflow_status ??
        "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: null,
          not_relevant_by: null,
          not_relevant_note: null,
          mailbox_reset_at: null,
          workflow_status: restoreStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate). The restored status is recorded as
      // its raw workflow_status value here (not a display label — queries.ts is the data layer and
      // deliberately does not import label formatting from format.ts); the history UI already knows
      // how to render a workflow_status value via workflowLabelDe.
      await insertHistory(
        documentId,
        "not_relevant",
        `Markierung nicht relevant aufgehoben (Status: ${restoreStatus})`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", documentId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", documentId] });
    },
  });
}

// Archive a wrongly ingested receipt. Never a delete: the row stays, keeps its history, and the
// warning note records what the responsible person has to do about it elsewhere.
export function useArchiveDocument(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hint: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          archived_at: new Date().toISOString(),
          archived_by: actor,
          archive_note: hint || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (error) throw error;
      await insertHistory(
        documentId,
        "archived",
        hint ? `Archiviert mit Hinweis: ${hint}` : "Archiviert",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", documentId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", documentId] });
    },
  });
}

export function useUnarchiveDocument(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          archived_at: null,
          archived_by: null,
          archive_note: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (error) throw error;
      await insertHistory(documentId, "archived", "Aus dem Archiv zurückgeholt");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", documentId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", documentId] });
    },
  });
}

// ---- The same review decisions, applied to a selection on the list screen ----
//
// The single-invoice hooks above bind their id when the hook is created, which a list cannot do:
// it has one hook and many rows. These take the id per call instead.
//
// One UPDATE and one history entry per invoice, never a single statement over a set of ids. The
// audit trail has to say what happened to each receipt on its own, and a reviewer reading one
// invoice must not have to know it was part of a batch to understand its history.
//
// They deliberately do not invalidate. A run of fifty rows would otherwise refetch the list fifty
// times; `refresh()` is called once when the whole run is over.
export function useBulkInvoiceActions() {
  const qc = useQueryClient();
  const { data: companies } = useCompanies();

  async function archive(documentId: string, hint: string | null) {
    const actor = await actorEmail();
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        archived_at: new Date().toISOString(),
        archived_by: actor,
        archive_note: hint,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (error) throw error;
    // Persisted audit text stays German (do not translate).
    await insertHistory(
      documentId,
      "archived",
      hint ? `Archiviert mit Hinweis: ${hint}` : "Archiviert",
    );
  }

  async function markNotRelevant(documentId: string, reason: string | null) {
    const actor = await actorEmail();
    const { data: before, error: readError } = await supabase
      .from(TABLE.documents)
      .select("workflow_status")
      .eq("id", documentId)
      .maybeSingle();
    if (readError) throw readError;
    const beforeStatus = before?.workflow_status ?? "received";

    const { error } = await sb
      .from(TABLE.documents)
      .update({
        not_relevant_at: new Date().toISOString(),
        not_relevant_by: actor,
        not_relevant_note: reason,
        workflow_status: "not_relevant",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (error) throw error;
    await insertHistory(
      documentId,
      "not_relevant",
      reason ? `Als nicht relevant markiert: ${reason}` : "Als nicht relevant markiert",
      { previous_workflow_status: beforeStatus },
    );
  }

  // Same three columns the detail screen writes: the code, the foreign key that has to agree with
  // it, and the provenance stamp that keeps the rule engine from overwriting a human decision.
  async function assignCompany(documentId: string, companyId: string | null) {
    const company = (companies ?? []).find((g) => g.id === companyId);
    if (!company) throw new Error("Unbekannte Gesellschaft.");
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        company_code: company.code,
        company_id: company.id,
        company_assignment_source: "human",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (error) throw error;
    await insertHistory(documentId, "booking", `Gesellschaft gesetzt: ${company.code}`);
  }

  async function softDelete(documentId: string, reason: string | null) {
    const actor = await actorEmail();
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: actor,
        delete_reason: requiredReason(reason),
      })
      .eq("id", documentId);
    if (error) throw error;
    await insertHistory(documentId, "deletion", reason || "Beleg gelöscht");
  }

  // Every read the list screen makes. Spelled out rather than prefixed: the kanban keys are
  // "belege-kanban-counts" and "belege-kanban-spalte", and a prefix of "belege-kanban" matches
  // neither of them.
  function refresh() {
    qc.invalidateQueries({ queryKey: ["belege"] });
    qc.invalidateQueries({ queryKey: ["belege-liste"] });
    qc.invalidateQueries({ queryKey: ["belege-kpis"] });
    qc.invalidateQueries({ queryKey: ["belege-facets"] });
    qc.invalidateQueries({ queryKey: ["belege-ohne-gesellschaft"] });
    qc.invalidateQueries({ queryKey: ["belege-kanban-counts"] });
    qc.invalidateQueries({ queryKey: ["belege-kanban-spalte"] });
    qc.invalidateQueries({ queryKey: ["invoice-queue-kpis"] });
    qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
  }

  return { archive, markNotRelevant, assignCompany, softDelete, refresh };
}
