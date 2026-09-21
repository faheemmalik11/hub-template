import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeatureGate } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { requiredReason } from "@/data/shared";
import { useEmployees } from "@/data/team";
import { useAuth } from "@/lib/auth";
import { APPROVAL_PHASE_STATUSES } from "@/lib/data/format";
import type { ApprovalRule, Document, ChainPerson, WorkflowStatus } from "@/lib/data/types";

// ---- Approval workflow (Briefing Screen 6; migration 0035) ----
//
// Approve/return-with-query/reject all reduce to the same shape (set workflow_status, log one
// invoice_history row) that `useUpdateBeleg` already provides — no separate mutation per action.
// The UI computes which `{ nextStatus, typ, text }` to pass via nextLegalActions in format.ts;
// the chain steps themselves are clicked on the workflow bar in eingangsrechnungen/$nr.tsx.

function invalidateApprovalState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["chain_people"] });
  qc.invalidateQueries({ queryKey: ["approval_rules"] });
  qc.invalidateQueries({ queryKey: ["approval_rule_resolved"] });
}

/**
 * The approval-chain directory: everybody who can be a step in a rule, be assigned a receipt, or
 * be named as somebody's deputy.
 *
 * Read through the `chain_people()` RPC rather than a plain select on app_users, because
 * app_users is admin-only and this list is named to EVERYONE: the invoice list's responsible
 * person, the overdue and deputy warnings, the assignment picker. Selecting app_users directly
 * would return an empty array for an ordinary user, which is not an error and would therefore
 * blank all of those without a word. See migration 20260901160200.
 *
 * Inactive people are INCLUDED. An approval_rules row keeps naming somebody after they are
 * deactivated (deactivating never rewrites rules), so filtering them out here would make "this
 * rule points at somebody who cannot act" look identical to "nobody is responsible" -- the exact
 * distinction the invoice screen's deactivated warning exists to draw. Callers that must not
 * OFFER somebody filter on `is_active` themselves.
 */
export function useChainPeople() {
  return useQuery({
    queryKey: ["chain_people"],
    staleTime: STALE,
    queryFn: async (): Promise<ChainPerson[]> => {
      const { data, error } = await sb.rpc("chain_people");
      if (error) throw error;
      return (data ?? []) as ChainPerson[];
    },
  });
}

/** The same directory keyed by id, for the many places that hold an id and need to print a name. */
export function useChainPeopleById(): Map<string, ChainPerson> {
  const peopleQ = useChainPeople();
  return useMemo(() => new Map((peopleQ.data ?? []).map((p) => [p.id, p])), [peopleQ.data]);
}

/**
 * The signed-in person, as a chain member.
 *
 * Replaces useActingAs()'s name lookup against the approvers table for every ordinary path. That
 * lookup resolved to null for anybody who had simply never been registered as an approver, which
 * silently removed their approval buttons, their nav badges and their attention panel with no
 * message anywhere -- a person created in Team & Rollen and given the approval permission still
 * saw nothing. There is no such state now: everybody with an account is in the directory.
 */
export function useMeInChain(): ChainPerson | null {
  const { appUserId } = useAuth();
  const peopleQ = useChainPeople();
  return useMemo(
    () => (appUserId ? ((peopleQ.data ?? []).find((p) => p.id === appUserId) ?? null) : null),
    [peopleQ.data, appUserId],
  );
}

/**
 * Thrown instead of the raw Postgrest error when a write trips `app_users_one_active_per_area`
 * ("at most one active owner per exact area", migration 20260901160000), so Team & Rollen can show
 * a translated, actionable message rather than a Postgres constraint-violation string. `area` is
 * always set when this is thrown, so callers can rely on it to build the message.
 */
export class AreaConflictError extends Error {
  constructor(public area: NonNullable<ChainPerson["area"]>) {
    super(`Somebody already covers area "${area}"`);
    this.name = "AreaConflictError";
  }
}

/**
 * The three chain properties, edited on Team & Rollen.
 *
 * Saved on the spot, like the permission checklist and unlike role/company access, which are
 * staged until the dialog's own Save. These are independent single values with no cross-field
 * consequence, so staging them would only add a way to lose them by closing the dialog.
 *
 * `pays` is deliberately NOT here. It fed one hint sentence on the invoice screen, it
 * is a property of a company or a rule rather than of a person, and the client asked for it to go;
 * the old value stays on the frozen approvers row. See migration 20260901160000's header.
 */
export function useUpdateChainPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      userId: string;
      changes: Partial<
        Pick<ChainPerson, "deputy_user_id" | "escalation_days" | "area" | "covers_all_areas">
      >;
    }) => {
      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.userId);
      if (error) {
        const e = error as { code?: string; message: string };
        if (
          e.code === "23505" &&
          e.message.includes("app_users_one_active_per_area") &&
          args.changes.area
        ) {
          throw new AreaConflictError(args.changes.area);
        }
        throw error;
      }
    },
    onSuccess: () => {
      invalidateApprovalState(qc);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// Every active chain-config rule, most specific first (matches how they're picked, so the admin
// list reads top-to-bottom in priority order).
export function useApprovalRules() {
  return useQuery({
    queryKey: ["approval_rules"],
    staleTime: STALE,
    queryFn: async (): Promise<ApprovalRule[]> => {
      const { data, error } = await sb
        .from(TABLE.approvalRules)
        .select("*")
        .is("deleted_at", null)
        .order("specificity", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalRule[];
    },
  });
}

export type ApprovalRuleInput = {
  supplier_id?: string | null;
  property_id?: string | null;
  company_id?: string | null;
  min_amount?: number;
  step_1_user_id: string;
  step_2_user_id?: string | null;
  // True = deliberately single-step (migration 0087) -- leave step_2_user_id at NULL instead of
  // falling back to the invoice's area-based department head. Ignored when step_2_user_id is set.
  skip_step_2?: boolean;
  note?: string | null;
  is_active?: boolean;
};

export function useCreateApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApprovalRuleInput): Promise<ApprovalRule> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.approvalRules)
        .insert({ ...input, created_by: actor })
        .select("*")
        .single();
      if (error) throw error;
      return data as ApprovalRule;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

export function useUpdateApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; changes: Partial<ApprovalRuleInput> }) => {
      const { error } = await sb
        .from(TABLE.approvalRules)
        .update({ ...args.changes, updated_at: new Date().toISOString() })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

// Soft delete only, same convention as bwa_categories/manual_bookings/assignment_rules: a rule
// that shaped a past approval stays auditable even once retired.
export function useSoftDeleteApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.approvalRules)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: requiredReason(args.reason),
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateApprovalState(qc),
  });
}

// The winning chain for one invoice (RPC resolve_approval_rule, migration 0035). Null when no
// rule matches at all, which should not happen once every company has its seeded fallback row.
export function useResolveApprovalRule(invoiceId: string | null) {
  return useQuery({
    queryKey: ["approval_rule_resolved", invoiceId],
    enabled: !!invoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<ApprovalRule | null> => {
      const { data, error } = await sb.rpc("resolve_approval_rule", { p_invoice_id: invoiceId });
      if (error) throw error;
      // "No rule matched" arrives as a RECORD OF NULLS, not as null: the function returns
      // approval_rules%ROWTYPE, and PostgREST serialises an empty row as an object with every
      // column set to null. `?? null` never fires, so every caller received a truthy object whose
      // approvers were empty -- which read as "a rule applies and names nobody" and, in
      // nextLegalActions, refused every action on every invoice that matched no rule.
      const row = data as ApprovalRule | null;
      return row && row.id ? row : null;
    },
  });
}

/**
 * Invoices whose most recent return of `type` is addressed to this person.
 *
 * The target is read off the invoice_history row the return action itself wrote. Since migration
 * 20260901160500 the app writes `data.recipient_user_id`, a real account reference; rows written
 * before that carry only `data.returned_to`, a display name, so both are matched. The name half is
 * a legacy path and will go quiet on its own as old rows age out -- do not build anything new on
 * it, and note it is the half that broke silently whenever somebody was renamed.
 */
export function useInvoicesReturnedByType(
  historyType: "query" | "rejection",
  workflowStatus: WorkflowStatus,
  queryName: string,
  myUserId: string | null,
  myName: string | null,
) {
  const gated = useFeatureGate(PERMISSIONS.documentsRead);
  return useQuery({
    queryKey: ["belege", queryName, myUserId, myName],
    // The shell shows this as a badge, so it runs on every screen.
    enabled: gated && (!!myUserId || !!myName),
    staleTime: STALE,
    queryFn: async (): Promise<Document[]> => {
      const { data: invoices, error } = await sb
        .from(TABLE.documents)
        .select("*")
        .eq("workflow_status", workflowStatus)
        .is("deleted_at", null);
      if (error) throw error;
      const ids = ((invoices ?? []) as Document[]).map((b) => b.id);
      if (ids.length === 0) return [];

      const { data: history, error: histError } = await sb
        .from(TABLE.documentHistory)
        .select("document_id, data, created_at")
        .eq("type", historyType)
        .in("document_id", ids)
        .order("created_at", { ascending: false });
      if (histError) throw histError;

      // First occurrence per invoice wins -- history is ordered newest first.
      type Target = { recipient_user_id?: string; returned_to?: string };
      const targetProDocument = new Map<string, Target>();
      for (const row of history ?? []) {
        if (!targetProDocument.has(row.document_id)) {
          targetProDocument.set(row.document_id, (row.data as Target | null) ?? {});
        }
      }

      return (invoices as Document[]).filter((b) => {
        const target = targetProDocument.get(b.id);
        if (!target) return false;
        if (target.recipient_user_id) return target.recipient_user_id === myUserId;
        return !!myName && (target.returned_to ?? "").toLowerCase() === myName.toLowerCase();
      });
    },
  });
}

// Invoices parked in 'query' with the query addressed to this person -- the in-app "returned
// to me" notification (no email/push, per the app's recompute-live philosophy).
export function useInvoicesReturnedToMe(myUserId: string | null, myName: string | null) {
  return useInvoicesReturnedByType("query", "query", "query_to_me", myUserId, myName);
}

/**
 * Invoices handed to this person explicitly, and still somewhere in the approval phase.
 *
 * The plainest "this is waiting on you" signal the app has: unlike the rule-resolved chain it is
 * set because a human said so, so it needs no resolution to read back. Matched on
 * `assigned_user_id` (migration 20260901160400); the old `assigned_to` name match is deliberately
 * NOT included, because it is exactly the thing that broke whenever somebody was renamed.
 *
 * Terminal and post-approval statuses are excluded: an assignment that survives onto a paid,
 * rejected or handed-over invoice is a record of who dealt with it, not an open task, and listing
 * those under "waiting on you" would mean the count never drops.
 *
 * `workflow_status` is filtered client-side rather than with `.in()` because the column is
 * nullable and a NULL there means 'received' everywhere else in this codebase (see
 * nextLegalActions, which defaults it) -- a server-side `.in()` drops NULL rows silently, which
 * would hide exactly the freshest assignments.
 */
export function useInvoicesAssignedToMe(myUserId: string | null) {
  return useQuery({
    queryKey: ["belege", "zugewiesen_an_mich", myUserId],
    enabled: !!myUserId,
    staleTime: STALE,
    queryFn: async (): Promise<Document[]> => {
      const { data, error } = await sb
        .from(TABLE.documents)
        .select("*")
        .eq("assigned_user_id", myUserId!)
        .is("deleted_at", null);
      if (error) throw error;
      return ((data ?? []) as Document[]).filter((b) =>
        APPROVAL_PHASE_STATUSES.includes((b.workflow_status ?? "received") as WorkflowStatus),
      );
    },
  });
}

/**
 * "Who is acting" (Briefing Screen 6). Everybody is themselves; the SUPER ADMIN alone can act on
 * somebody else's behalf.
 *
 * WHAT CHANGED AND WHY. This used to resolve the signed-in account by matching its display name
 * against the `approvers` table, with a localStorage override offered to anyone holding
 * `invoices.override_workflow` (which is every Admin). Two problems: an account that had simply
 * never been registered as an approver resolved to null, which removed its approval buttons and
 * nav badges without a word; and the override was written into invoice_history as `handelnd_als`,
 * an assertion about who acted that nothing server-side ever checked.
 *
 * THE INVERSION THAT MATTERS. The old code matched the login name FIRST and only fell back to the
 * override. That worked only because the super admin was deliberately kept OUT of the approvers
 * table. The directory is now the employee list, the super admin is in it, so a name-first rule
 * would make the picker silently do nothing. The explicit choice therefore wins.
 *
 * This grants nothing. Every write is still checked against the SIGNED-IN account by
 * enforce_invoice_write_permissions(), and the super admin holds the whole catalogue
 * unconditionally (migration 20260901160300), so the picker can never reach a step that account
 * could not already take. It is break-glass for pushing a stuck receipt through, not a way to
 * borrow a permission.
 */
const ACTING_AS_CHANGED_EVENT = "hub:acting-as-changed";

/** The picker's "(nobody)" choice. It has to be a stored VALUE, not an absent key: an empty
 *  override falls through to "me", so the super admin could otherwise never clear the picker. */
export const ACTING_AS_NONE = "__keine";

// Keyed by user id now, not by name. A new key rather than the old one, so a stale name left in a
// browser from before this change resolves to nothing instead of being silently ignored forever.
const ACTING_AS_STORAGE_KEY = "freigabe_acting_as_id";

export function useActingAs() {
  const { role } = useAuth();
  const me = useMeInChain();
  const peopleQ = useChainPeople();
  const people = useMemo(() => peopleQ.data ?? [], [peopleQ.data]);
  // The owner/technical account, and only it. This used to be invoices.override_workflow, which
  // every Admin holds by default -- a real narrowing, and the point of the change.
  const canActAls = role === "super_admin";

  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setOverride(window.localStorage.getItem(ACTING_AS_STORAGE_KEY));
    sync();
    // The native "storage" event fires in OTHER tabs only, never the one that made the change, so
    // a same-tab broadcast keeps every instance (nav badge, invoice screen) in step without a
    // reload.
    window.addEventListener(ACTING_AS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTING_AS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const actingAs = useMemo(() => {
    // Anybody else is themselves, whatever is left in their localStorage.
    if (!canActAls) return me;
    if (override === ACTING_AS_NONE) return null;
    // An override naming somebody who has since been deleted falls back to being yourself, rather
    // than to nobody: silently having no buttons is the failure mode this whole change removes.
    if (override) return people.find((p) => p.id === override) ?? me;
    return me;
  }, [canActAls, me, people, override]);

  function chooseActingAs(userId: string) {
    window.localStorage.setItem(ACTING_AS_STORAGE_KEY, userId);
    setOverride(userId);
    window.dispatchEvent(new Event(ACTING_AS_CHANGED_EVENT));
  }

  return { actingAs, people, chooseActingAs, canActAls };
}

/**
 * What the person currently being ACTED AS may do.
 *
 * "Handelnd als X" has to mean the whole screen behaves as X, not just the approval buttons.
 * Reading the permissions from useAuth() instead meant a super admin previewing somebody with no
 * rights at all could still edit fields, release payments and correct statuses -- while the label
 * said otherwise, and while any write it produced would be recorded as that person's.
 *
 * ONE RULE, NO EXCEPTIONS: every permission-gated control on the invoice screen asks this. The way
 * back to your own authority is to pick "Super Admin" in the picker, which is one click away and
 * says so.
 *
 * THIS IS A PREVIEW, NOT A SANDBOX. The database still checks the SIGNED-IN account on every write
 * (enforce_invoice_write_permissions), so acting as somebody with fewer rights does not make the
 * writes safer -- it makes the screen honest. The reverse case is what matters and is covered: the
 * UI no longer offers a button whose history entry would claim somebody took a step they could not.
 *
 * While the employee list is loading the answer is NO rather than a fallback to the signed-in
 * account: a flash of buttons that should not be there is worse than a flash of none, because it
 * is clickable. Only the super admin can act as somebody else, and only an admin can read
 * useEmployees(), so the two gates line up.
 */
export function useActingCapabilities() {
  const { appUserId, can } = useAuth();
  const actingAsState = useActingAs();
  const { actingAs } = actingAsState;
  const employeesQ = useEmployees();

  const isForeignIdentity = !!actingAs && !!appUserId && actingAs.id !== appUserId;
  const foreignRights = useMemo(
    () =>
      isForeignIdentity
        ? ((employeesQ.data ?? []).find((e) => e.id === actingAs?.id)?.permissions ?? null)
        : null,
    [isForeignIdentity, employeesQ.data, actingAs?.id],
  );
  const canAlsPerson = useCallback(
    (key: string) => (isForeignIdentity ? (foreignRights?.includes(key) ?? false) : can(key)),
    [isForeignIdentity, foreignRights, can],
  );

  return { ...actingAsState, isForeignIdentity, canAlsPerson };
}
