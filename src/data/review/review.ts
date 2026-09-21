import { useMutation, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { actorEmail, sb } from "@/data/client";
import { insertVerlauf, pflichtGrund } from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import { useGesellschaften } from "@/data/companies";

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
export function useSetNotRelevant(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grund: string) => {
      const actor = await actorEmail();
      const { data: vorher, error: leseFehler } = await supabase
        .from(TABLE.documents)
        .select("workflow_status")
        .eq("id", belegId)
        .maybeSingle();
      if (leseFehler) throw leseFehler;
      const vorherStatus = vorher?.workflow_status ?? "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: new Date().toISOString(),
          not_relevant_by: actor,
          not_relevant_note: grund || null,
          workflow_status: "not_relevant",
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate).
      await insertVerlauf(
        belegId,
        "not_relevant",
        grund ? `Als nicht relevant markiert: ${grund}` : "Als nicht relevant markiert",
        { previous_workflow_status: vorherStatus },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

// Undo the "not relevant" decision and put the receipt back into the review queue, at the stage it
// was actually at before — read from the most recent "not_relevant" history entry this mutation's
// counterpart wrote. An older entry from before this field existed has no previous_workflow_status;
// 'received' is the fallback there, matching the previous (blunter) behaviour for those only.
// Clears mailbox_reset_at too: the pipeline's handshake refers to a return that is no longer wanted,
// and leaving a stale timestamp would make a later, real return look already done.
export function useClearNotRelevant(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: letzte, error: leseFehler } = await supabase
        .from(TABLE.documentHistory)
        .select("data")
        .eq("document_id", belegId)
        .eq("type", "not_relevant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leseFehler) throw leseFehler;
      const wiederherstellenStatus =
        (letzte?.data as { previous_workflow_status?: string } | null)?.previous_workflow_status ??
        "received";

      const { error } = await sb
        .from(TABLE.documents)
        .update({
          not_relevant_at: null,
          not_relevant_by: null,
          not_relevant_note: null,
          mailbox_reset_at: null,
          workflow_status: wiederherstellenStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      // Persisted audit text stays German (do not translate). The restored status is recorded as
      // its raw workflow_status value here (not a display label — queries.ts is the data layer and
      // deliberately does not import label formatting from format.ts); the history UI already knows
      // how to render a workflow_status value via workflowLabelDe.
      await insertVerlauf(
        belegId,
        "not_relevant",
        `Markierung nicht relevant aufgehoben (Status: ${wiederherstellenStatus})`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

// Archive a wrongly ingested receipt. Never a delete: the row stays, keeps its history, and the
// warning note records what the responsible person has to do about it elsewhere.
export function useArchiveBeleg(belegId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hinweis: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          archived_at: new Date().toISOString(),
          archived_by: actor,
          archive_note: hinweis || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", belegId);
      if (error) throw error;
      await insertVerlauf(
        belegId,
        "archived",
        hinweis ? `Archiviert mit Hinweis: ${hinweis}` : "Archiviert",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
    },
  });
}

export function useUnarchiveBeleg(belegId: string) {
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
        .eq("id", belegId);
      if (error) throw error;
      await insertVerlauf(belegId, "archived", "Aus dem Archiv zurückgeholt");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beleg", belegId] });
      qc.invalidateQueries({ queryKey: ["belege"] });
      qc.invalidateQueries({ queryKey: ["belege-liste"] });
      qc.invalidateQueries({ queryKey: ["beleg_verlauf", belegId] });
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
  const { data: gesellschaften } = useGesellschaften();

  async function archive(belegId: string, hinweis: string | null) {
    const actor = await actorEmail();
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        archived_at: new Date().toISOString(),
        archived_by: actor,
        archive_note: hinweis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    // Persisted audit text stays German (do not translate).
    await insertVerlauf(
      belegId,
      "archived",
      hinweis ? `Archiviert mit Hinweis: ${hinweis}` : "Archiviert",
    );
  }

  async function markNotRelevant(belegId: string, grund: string | null) {
    const actor = await actorEmail();
    const { data: vorher, error: leseFehler } = await supabase
      .from(TABLE.documents)
      .select("workflow_status")
      .eq("id", belegId)
      .maybeSingle();
    if (leseFehler) throw leseFehler;
    const vorherStatus = vorher?.workflow_status ?? "received";

    const { error } = await sb
      .from(TABLE.documents)
      .update({
        not_relevant_at: new Date().toISOString(),
        not_relevant_by: actor,
        not_relevant_note: grund,
        workflow_status: "not_relevant",
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    await insertVerlauf(
      belegId,
      "not_relevant",
      grund ? `Als nicht relevant markiert: ${grund}` : "Als nicht relevant markiert",
      { previous_workflow_status: vorherStatus },
    );
  }

  // Same three columns the detail screen writes: the code, the foreign key that has to agree with
  // it, and the provenance stamp that keeps the rule engine from overwriting a human decision.
  async function assignCompany(belegId: string, gesellschaftId: string | null) {
    const gesellschaft = (gesellschaften ?? []).find((g) => g.id === gesellschaftId);
    if (!gesellschaft) throw new Error("Unbekannte Gesellschaft.");
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        company_code: gesellschaft.code,
        company_id: gesellschaft.id,
        company_assignment_source: "human",
        updated_at: new Date().toISOString(),
      })
      .eq("id", belegId);
    if (error) throw error;
    await insertVerlauf(belegId, "booking", `Gesellschaft gesetzt: ${gesellschaft.code}`);
  }

  async function softDelete(belegId: string, grund: string | null) {
    const actor = await actorEmail();
    const { error } = await sb
      .from(TABLE.documents)
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: actor,
        delete_reason: pflichtGrund(grund),
      })
      .eq("id", belegId);
    if (error) throw error;
    await insertVerlauf(belegId, "deletion", grund || "Beleg gelöscht");
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
