import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { SINGLETON_ROW_ID, STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFeatureGate } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { useInvoicesReturnedByType } from "@/data/approval";
import { keepPreviousData } from "@tanstack/react-query";
import { EDGE_FUNCTION } from "@/config/edge-functions";
import { todayLocal } from "@/lib/data/format";
import { notifyTargetPath } from "@/lib/data/notification-target";
import {
  createEmployee as createEmployeeFn,
  resetEmployeePassword as resetEmployeePasswordFn,
  updateEmployeeProfile as updateEmployeeProfileFn,
} from "@/lib/api/employees.functions";
import type { AppRole } from "@/lib/auth";
import type { ApprovalArea, Employee, TrashRecord } from "@/lib/data/types";
import type { NotificationTargetKind } from "@/lib/data/notification-target";

// ===========================================================================
// Team & Rollen (Briefing Screen 17, Appendix A7)
// ===========================================================================

// The three roles an admin may ASSIGN from the UI. 'super_admin' (the owner/technical account) is
// deliberately excluded: it is not assignable, and the DB refuses to grant it besides
// (guard_super_admin_row, migrations 20260813120000 + 20260813140000). It IS visible now -- Team & Rollen lists it
// pinned and highlighted so its name can be edited -- which reverses A7's original "invisible to
// the client entirely"; everything about it except the name stays read-only.
export type AssignableRole = Exclude<AppRole, "super_admin">;

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    staleTime: STALE,
    queryFn: async (): Promise<{ id: string; name: AppRole }[]> => {
      const { data, error } = await sb.from(TABLE.roles).select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: AppRole }[];
    },
  });
}

/**
 * What each role grants by default, keyed by role id.
 *
 * Read whole rather than per role: the Team screen renders a matrix, and `useEmployees` already
 * folds these into each person's effective set, so the two must come from the same fetch shape.
 */
export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await sb
        .from(TABLE.rolePermissions)
        .select("role_id, permission_key");
      if (error) throw error;
      const nach: Record<string, string[]> = {};
      for (const rp of (data ?? []) as { role_id: string; permission_key: string }[]) {
        (nach[rp.role_id] ??= []).push(rp.permission_key);
      }
      return nach;
    },
  });
}

/**
 * Grant or revoke a permission for a whole ROLE.
 *
 * Absence is the answer here -- `role_permissions` has no `granted` column, so a revoke is a
 * delete. Verified against the live policies: `role_permissions_write` is `for all` gated on
 * `is_admin()`, so both directions work for an admin and are refused for anyone else at the
 * database, not just in this UI.
 *
 * Logged, because it moves everyone holding that role who has no personal override -- the one
 * change in this system with blast radius beyond a single person.
 */
export function useSetRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { roleId: string; roleName: string; key: string; value: boolean }) => {
      if (args.value) {
        const { error } = await sb
          .from(TABLE.rolePermissions)
          .upsert(
            { role_id: args.roleId, permission_key: args.key },
            { onConflict: "role_id,permission_key" },
          );
        if (error) throw error;
      } else {
        const { error } = await sb
          .from(TABLE.rolePermissions)
          .delete()
          .eq("role_id", args.roleId)
          .eq("permission_key", args.key);
        if (error) throw error;
      }
      await insertChangeHistory(
        "role_permissions",
        args.roleId,
        args.value ? "role_permission_granted" : "role_permission_revoked",
        `${args.roleName}: ${args.key} ${args.value ? "erteilt" : "entzogen"}`,
        { role: args.roleName, permission: args.key, granted: args.value },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      // Employee rows show EFFECTIVE permissions, which fold in these defaults: a role change moves
      // everyone without a personal override, so that list is stale the moment this succeeds.
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

interface EmployeeRow {
  id: string;
  email: string;
  name: string | null;
  role_id: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  deputy_user_id: string | null;
  escalation_days: number | null;
  area: ApprovalArea | null;
  covers_all_areas: boolean;
  roles: { name: AppRole } | null;
  user_company_access: { company_id: string; can_view: boolean; deleted_at: string | null }[];
  user_permissions: { permission_key: string; granted: boolean }[];
}

export interface PermissionRow {
  key: string;
  category: string;
  label_de: string;
  label_en: string;
  description_de: string | null;
  description_en: string | null;
  sort_order: number;
}

/**
 * The permission catalogue, straight from the table.
 *
 * Read rather than hardcoded so a key added by a project's own `permissions.seed.sql` shows up on
 * Team & Rollen without a front-end change -- which is the whole point of the catalogue being data.
 */
export function usePermissionCatalogue() {
  return useQuery({
    queryKey: ["permission-catalogue"],
    staleTime: STALE,
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await sb
        .from(TABLE.permissions)
        .select("key, category, label_de, label_en, description_de, description_en, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });
}

/** Effective permission set: a personal override wins, otherwise the role default. */
function effectivePermissions(
  overrides: { permission_key: string; granted: boolean }[],
  roleDefaults: Set<string>,
): string[] {
  const own = new Map(overrides.map((o) => [o.permission_key, o.granted]));
  const keys = new Set<string>([...roleDefaults, ...own.keys()]);
  return [...keys].filter((k) => own.get(k) ?? roleDefaults.has(k));
}

// Admin-only (RLS: app_users_admin_read).
// Returns EVERY employee, super_admin included, because Team & Rollen has to list and rename them.
// Super admin is deliberately NOT filtered here any more, so any consumer that must not offer it --
// the approval-rule pickers, where a super admin must never appear as a step or a deputy --
// filters on role_name itself. See freigabe-regeln/index.tsx and team/index.tsx for both of those.
export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    staleTime: STALE,
    queryFn: async (): Promise<Employee[]> => {
      const { data: rolePerms, error: rolePermsError } = await sb
        .from(TABLE.rolePermissions)
        .select("role_id, permission_key");
      if (rolePermsError) throw rolePermsError;
      const rolePermissions = new Map<string, Set<string>>();
      for (const rp of (rolePerms ?? []) as { role_id: string; permission_key: string }[]) {
        if (!rolePermissions.has(rp.role_id)) rolePermissions.set(rp.role_id, new Set());
        rolePermissions.get(rp.role_id)!.add(rp.permission_key);
      }
      const { data, error } = await sb
        .from(TABLE.appUsers)
        .select(
          "id, email, name, role_id, is_active, must_change_password, created_at, " +
            "deputy_user_id, escalation_days, area, covers_all_areas, " +
            "roles(name), user_company_access(company_id, can_view, deleted_at), " +
            "user_permissions(permission_key, granted)",
        )
        .order("email");
      if (error) throw error;
      return ((data ?? []) as EmployeeRow[]).map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role_id: row.role_id,
        role_name: (row.roles?.name ?? "assistant") as AppRole,
        is_active: row.is_active,
        must_change_password: row.must_change_password,
        created_at: row.created_at,
        allowed_company_ids: row.user_company_access
          .filter((g) => g.can_view && g.deleted_at === null)
          .map((g) => g.company_id),
        // Effective = the person's own override where one exists, otherwise their role's default.
        // The same rule current_permissions() applies server-side, so the switches on Team & Rollen
        // show what the database would actually decide. Nothing is forced by role here: an earlier
        // version rewrote an admin's value to true before the UI saw it, which meant their switch
        // could be turned off, written, and still read back as on.
        deputy_user_id: row.deputy_user_id,
        escalation_days: row.escalation_days,
        area: row.area,
        covers_all_areas: row.covers_all_areas,
        permissions: effectivePermissions(
          row.user_permissions ?? [],
          rolePermissions.get(row.role_id) ?? new Set<string>(),
        ),
      }));
    },
  });
}

function invalidateEmployeeState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["employees"] });
}

// Toggle one of the three itemized accounting capabilities (migration 20260812150000). Distinct
// from useUpdateEmployeeRole: role changes what screens someone can reach, this changes whether
// they're flagged as trusted for booking/approving/paying specifically.
export function useSetAccountingRight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; right: string; value: boolean }) => {
      // Written as an explicit row in BOTH directions. `granted: false` is a REVOKE of something the
      // role would otherwise grant -- deleting the row instead would silently fall back to the role
      // default, so an admin could never be denied a permission their role includes.
      const { error } = await sb.from(TABLE.userPermissions).upsert(
        {
          user_id: args.employeeId,
          permission_key: args.right,
          granted: args.value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,permission_key" },
      );
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.value ? "accounting_right_granted" : "accounting_right_revoked",
        `${args.right} ${args.value ? "erteilt" : "entzogen"}`,
        { right: args.right },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Creates a real Supabase Auth login (server-side, service role -- see
// src/lib/api/employees.functions.ts) plus the app_users/user_company_access rows. Returns a
// one-time temp password the admin hands to the new employee (must_change_password forces them
// to set their own on first login).
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      email: string;
      name: string;
      roleName: AssignableRole;
      companyIds: string[];
    }) => {
      return createEmployeeFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Delegates to the server function (updateEmployeeProfile) rather than writing app_users
// directly: renaming is a plain row edit, but the email is also the employee's login identity
// (matched against auth.jwt() by has_company_access()/current_role_name()), so it has to update
// the real Supabase Auth account in lockstep -- only server code holding the service-role key
// can do that. See employees.functions.ts for the full reasoning.
export function useUpdateEmployeeProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; name: string; email: string }) => {
      return updateEmployeeProfileFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Delegates to the server function (resetEmployeePassword) -- setting a Supabase Auth password
// needs the service-role Admin API, same as createEmployee/updateEmployeeProfile. Returns a
// fresh one-time temp password the admin hands to the employee; must_change_password is flipped
// back to true server-side so it's forced to be replaced on next login (see auth-gate.tsx).
export function useResetEmployeePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string }) => {
      return resetEmployeePasswordFn({ data: args });
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

export function useUpdateEmployeeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; roleName: AssignableRole }) => {
      // Resolve the TARGET role's id from its name. This used to take a `roleId` argument, and
      // every caller passed the employee's CURRENT role_id -- so the update wrote the same value
      // back and the role never changed, while still writing a "Rolle geändert auf X"
      // change_history row and returning success. Role edits silently did nothing.
      const { data: role, error: roleError } = await sb
        .from(TABLE.roles)
        .select("id")
        .eq("name", args.roleName)
        .maybeSingle();
      if (roleError) throw roleError;
      if (!role) throw new Error(`Role ${args.roleName} not found`);

      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ role_id: (role as { id: string }).id, updated_at: new Date().toISOString() })
        .eq("id", args.employeeId);
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        "role_changed",
        `Rolle geändert auf ${args.roleName}`,
        { role_name: args.roleName },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// Replaces the full grant set for an employee. Upsert-then-soft-delete, deliberately in that
// order: if the upsert of the new grants fails, the mutation throws with the employee's PRIOR
// grants still fully intact; only once the new grants are safely written do the old ones get
// revoked. The reverse order (revoke-then-upsert) has a real failure window in the middle where
// the employee would have zero grants recorded -- which has_company_access() reads as
// UNRESTRICTED ("no grants = everything"), i.e. a failed edit could silently widen a restricted
// employee's access instead of leaving them at their narrower prior state. An empty companyIds
// array is itself a deliberate, valid end state ("unrestricted"), just never one reached via a
// mid-mutation failure.
//
// Revoking is a soft-delete (deleted_at), not a row delete: user_company_access has admin
// select/insert/update RLS policies but deliberately no delete policy (migration 0059), so a
// plain .delete() call silently removes zero rows under RLS -- no error, no effect -- instead of
// failing loudly. has_company_access() already filters on deleted_at is null, so setting it is
// the real revoke.
export function useSetCompanyAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; companyIds: string[] }) => {
      if (args.companyIds.length > 0) {
        const { error: upsertError } = await sb.from(TABLE.userCompanyAccess).upsert(
          args.companyIds.map((companyId) => ({
            user_id: args.employeeId,
            company_id: companyId,
            can_view: true,
            deleted_at: null,
          })),
          { onConflict: "user_id,company_id" },
        );
        if (upsertError) throw upsertError;
      }
      const revokeQuery = sb
        .from(TABLE.userCompanyAccess)
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", args.employeeId)
        .is("deleted_at", null);
      const { error: revokeError } =
        args.companyIds.length > 0
          ? await revokeQuery.not("company_id", "in", `(${args.companyIds.join(",")})`)
          : await revokeQuery;
      if (revokeError) throw revokeError;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.companyIds.length > 0 ? "access_granted" : "access_revoked",
        args.companyIds.length > 0
          ? `Firmenzugriff gesetzt (${args.companyIds.length})`
          : "Firmenzugriff auf uneingeschränkt zurückgesetzt",
        { company_ids: args.companyIds },
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

export function useSetEmployeeActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; isActive: boolean }) => {
      const { error } = await sb
        .from(TABLE.appUsers)
        .update({ is_active: args.isActive, updated_at: new Date().toISOString() })
        .eq("id", args.employeeId);
      if (error) throw error;
      await insertChangeHistory(
        "app_users",
        args.employeeId,
        args.isActive ? "user_reactivated" : "user_deactivated",
        args.isActive ? "Mitarbeiter reaktiviert" : "Mitarbeiter deaktiviert",
      );
    },
    onSuccess: () => invalidateEmployeeState(qc),
  });
}

// ===========================================================================
// Papierkorb (Briefing Screen 18)
// ===========================================================================

/**
 * The trash list.
 *
 * Paged through `fetchAllRows` rather than sent as one open-ended select. `v_trash` is a 14-way
 * UNION ALL over every soft-deletable table in the system, so it is the query in this file most
 * likely to cross the platform's per-request row cap first — and when an unbounded select crosses
 * it, PostgREST returns a silent prefix. Ordered newest-first, that prefix drops the OLDEST
 * deletions, which are exactly the ones somebody is looking for when they open this screen.
 * (docs/audit/papierkorb/trash/ISSUES.md #4)
 */
export function useTrash(tableFilter?: string) {
  return useQuery({
    queryKey: ["trash", tableFilter ?? "alle"],
    staleTime: STALE,
    queryFn: async (): Promise<TrashRecord[]> => {
      return fetchAllRows<TrashRecord>((from, to, withCount) => {
        let query = sb.from(TABLE.vTrash).select("*", withCount ? { count: "exact" } : undefined);
        if (tableFilter) query = query.eq("table_name", tableFilter);
        return query
          .order("deleted_at", { ascending: false })
          .range(from, to) as unknown as Promise<{
          data: TrashRecord[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

/**
 * The two table allow-lists, read from the database that enforces them.
 *
 * Migration 0049 made `trash_eligible_tables()` / `trash_purge_eligible_tables()` the single
 * source of truth for the RPCs and noted that the frontend's own copies "stay manually kept in
 * sync". They no longer do: the screen asks. A table added to the DB list now appears in the
 * filter without a frontend change, and a table that stops being purgeable grows its padlock on
 * its own. (docs/audit/papierkorb/trash/ISSUES.md #7)
 *
 * Long `staleTime`: these are `immutable` SQL functions returning a literal array.
 */
export function useTrashTables() {
  return useQuery({
    queryKey: ["trash-tables"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<{ eligible: string[]; purgeable: string[] }> => {
      const [eligible, purgeable] = await Promise.all([
        sb.rpc("trash_eligible_tables"),
        sb.rpc("trash_purge_eligible_tables"),
      ]);
      if (eligible.error) throw eligible.error;
      if (purgeable.error) throw purgeable.error;
      return {
        eligible: (eligible.data ?? []) as string[],
        purgeable: (purgeable.data ?? []) as string[],
      };
    },
  });
}

function invalidateTrashState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["trash"] });
  // A restore/purge can touch virtually any list screen (invoices, suppliers, customers, ...) --
  // broad invalidation here is the honest choice over silently stale lists elsewhere.
  qc.invalidateQueries({ queryKey: ["belege"] });
  qc.invalidateQueries({ queryKey: ["belege-liste"] });
  qc.invalidateQueries({ queryKey: ["lieferanten"] });
  qc.invalidateQueries({ queryKey: ["kunden"] });
  // "ausgangsrechnungen-liste" was never a real query key -- useOutgoingInvoices/useOutgoingInvoice
  // key on "outgoing_invoices"/"outgoing_invoice". Fixed here so a restore/purge touching
  // outgoing_invoices actually refreshes the list instead of silently no-opping.
  qc.invalidateQueries({ queryKey: ["outgoing_invoices"] });
  qc.invalidateQueries({ queryKey: ["outgoing_invoice"] });
  qc.invalidateQueries({ queryKey: ["gesellschaften"] });
  // A restored approver no longer changes anything the app reads -- the table is frozen
  // (migration 20260901160000) -- but approval_rules still shares the trash, so its list would
  // otherwise stay stale for the whole STALE window after a restore or purge.
  qc.invalidateQueries({ queryKey: ["approval_rules"] });
}

/**
 * Restore, with the reason the person gave for restoring.
 *
 * `restore_record` grew a third argument (`p_reason`) so the change-history entry says WHY a
 * record came back, not only that it did — restoring is the action with the wider blast radius of
 * the two on this screen (docs/audit/papierkorb/trash/ISSUES.md #5). The two-argument call is kept
 * as a fallback: PostgREST answers PGRST202 when no overload matches, which is exactly what a
 * database that has not had the migration applied yet will say. Without the fallback, deploying
 * the frontend ahead of the migration would break restore outright.
 */
export function useRestoreRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: string; id: string; reason?: string | null }) => {
      const reason = args.reason?.trim() || null;
      const withReason = await sb.rpc("restore_record", {
        p_table: args.table,
        p_id: args.id,
        p_reason: reason,
      });
      if (!withReason.error) return;
      const notFound =
        withReason.error.code === "PGRST202" ||
        /could not find the function/i.test(withReason.error.message ?? "");
      if (!notFound) throw withReason.error;
      const { error } = await sb.rpc("restore_record", { p_table: args.table, p_id: args.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrashState(qc),
  });
}

export function usePurgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { table: string; id: string }) => {
      const { error } = await sb.rpc("purge_record", { p_table: args.table, p_id: args.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateTrashState(qc),
  });
}
export interface BankMatchingCounts {
  total: number;
  open: number;
  suggestion: number;
  matched: number;
  ignored: number;
}

export function useBankMatchingCounts() {
  // Runs in the shell, not on the banking screen, so nothing else stops it for a client who does
  // not use banking at all.
  const enabled = useFeatureGate(PERMISSIONS.bankRead);
  return useQuery({
    queryKey: ["bank-matching-counts"],
    staleTime: STALE,
    enabled,
    queryFn: async (): Promise<BankMatchingCounts> => {
      const head = { count: "exact" as const, head: true };
      const [totalQ, openQ, suggestionQ, assignedQ, ignoredQ] = await Promise.all([
        sb.from(TABLE.bankTransactions).select("id", head),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "open"),
        sb.from(TABLE.vBankTransactionsList).select("id", head).eq("has_suggested_match", true),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "matched"),
        sb.from(TABLE.bankTransactions).select("id", head).eq("matching_status", "ignored"),
      ]);
      for (const q of [totalQ, openQ, suggestionQ, assignedQ, ignoredQ]) {
        if (q.error) throw q.error;
      }
      return {
        total: totalQ.count ?? 0,
        open: Math.max((openQ.count ?? 0) - (suggestionQ.count ?? 0), 0),
        suggestion: suggestionQ.count ?? 0,
        matched: assignedQ.count ?? 0,
        ignored: ignoredQ.count ?? 0,
      };
    },
  });
}

/**
 * The header bell's own figures (docs/NOTIFICATIONS.md phase 1): what is NEW since this user
 * last opened the bell, plus the standing to-do counts the dropdown lists. Head counts only.
 *
 * "New" is bounded to the last 7 days when the user has never opened the bell (or the migration
 * adding notifications_seen_at is not applied yet): an unbounded count would greet a new user
 * with the size of the whole table, which reads as a bug, not as news.
 */
export interface NotificationCounts {
  seenAt: string | null;
  newDocuments: number;
  zuCheck: number;
  due: number;
}

export function useNotificationCounts(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-counts", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificationCounts> => {
      let seenAt: string | null = null;
      const seenQ = await sb
        .from(TABLE.appUsers)
        .select("notifications_seen_at")
        .eq("id", appUserId)
        .maybeSingle();
      // 42703: the column does not exist yet (migration not applied). Degrade to the 7 day
      // window instead of failing the whole bell.
      if (!seenQ.error) seenAt = seenQ.data?.notifications_seen_at ?? null;
      else if (seenQ.error.code !== "42703") throw seenQ.error;

      const since = seenAt ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      const today = todayLocal();
      const head = { count: "exact" as const, head: true };
      const [newQ, checkQ, dueQ] = await Promise.all([
        sb
          .from(TABLE.documents)
          .select("id", head)
          .is("deleted_at", null)
          .is("archived_at", null)
          .is("not_relevant_at", null)
          .neq("status", "split")
          .gt("created_at", since),
        sb
          .from(TABLE.documents)
          .select("id", head)
          .is("deleted_at", null)
          .is("archived_at", null)
          .is("not_relevant_at", null)
          .eq("status", "needs_review"),
        // Strictly past, mirroring the Offene-Posten screen's overdue rule, so the bell row
        // and the filtered list it links to show the same number.
        sb
          .from(TABLE.vOpenItems)
          .select("id", head)
          .eq("is_open", true)
          .not("due_date", "is", null)
          .lt("due_date", today),
      ]);
      for (const q of [newQ, checkQ, dueQ]) {
        if (q.error) throw q.error;
      }
      return {
        seenAt,
        newDocuments: newQ.count ?? 0,
        zuCheck: checkQ.count ?? 0,
        due: dueQ.count ?? 0,
      };
    },
  });
}

/**
 * Stamps "the user has looked at the bell" via the narrow self-service RPC (migration
 * 20260827090000), the same pattern as clear_must_change_password: app_users writes stay
 * admin-only, this opens exactly one timestamp. A missing RPC (migration not applied) is
 * swallowed: the bell then simply keeps its 7 day window.
 */
export function useMarkNotificationsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("mark_notifications_seen");
      if (error && error.code !== "PGRST202" && error.code !== "42883") throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-counts"] });
    },
  });
}

// The bell's and the settings screen's shared vocabulary. Adding a type here makes it appear
// in the bell (default on) and as a toggle on /benachrichtigungen; an explicit false in
// notification_settings.bell_events hides it.
export const NOTIFICATION_EVENT_TYPES = [
  "neu",
  "assigned",
  "query",
  "rejected",
  "zuPruefen",
  "faellig",
  "suggestions",
  "fehler",
  "ping",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export interface NotificationSettings {
  bell_events: Record<string, boolean>;
  /** Per bell row the count last acknowledged by clicking through; synced across devices. */
  bell_ack: Record<string, number>;
  digest_enabled: boolean;
  /** "HH:MM" (Postgres time comes back as "HH:MM:SS"; normalized on read). */
  digest_time: string;
  digest_channel: "team" | "personal";
  digest_events: Record<string, boolean>;
  timezone: string;
}

const NOTIFICATION_SETTINGS_DEFAULTS: NotificationSettings = {
  bell_events: {},
  bell_ack: {},
  digest_enabled: false,
  digest_time: "08:00",
  digest_channel: "team",
  digest_events: {},
  timezone: "Europe/Berlin",
};

export function useNotificationSettings(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-settings", appUserId],
    enabled: !!appUserId,
    staleTime: STALE,
    queryFn: async (): Promise<NotificationSettings> => {
      const { data, error } = await sb
        .from(TABLE.notificationSettings)
        .select(
          "bell_events, bell_ack, digest_enabled, digest_time, digest_channel, digest_events, timezone",
        )
        .eq("user_id", appUserId)
        .maybeSingle();
      // Missing table (migration not applied) or no row yet: the defaults ARE the settings.
      if (error) {
        if (error.code === "42P01") return NOTIFICATION_SETTINGS_DEFAULTS;
        throw error;
      }
      if (!data) return NOTIFICATION_SETTINGS_DEFAULTS;
      const row = data as unknown as NotificationSettings;
      return {
        ...NOTIFICATION_SETTINGS_DEFAULTS,
        ...row,
        digest_time: (row.digest_time ?? "08:00").slice(0, 5),
        bell_events: row.bell_events ?? {},
        bell_ack: row.bell_ack ?? {},
        digest_events: row.digest_events ?? {},
      };
    },
  });
}

export function useSaveNotificationSettings(appUserId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<NotificationSettings>) => {
      if (!appUserId) throw new Error("no app user");
      const { error } = await sb
        .from(TABLE.notificationSettings)
        .upsert(
          { user_id: appUserId, ...changes, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
  });
}

export interface NotificationChannel {
  key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Admin only by RLS; non-admins simply get zero rows back, which the settings screen never
 *  shows them anyway. */
export function useNotificationChannels() {
  return useQuery({
    queryKey: ["notification-channels"],
    staleTime: STALE,
    queryFn: async (): Promise<NotificationChannel[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationChannels)
        .select("key, enabled, config")
        .order("key");
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as NotificationChannel[];
    },
  });
}

export function useSaveNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: NotificationChannel) => {
      const { error } = await sb
        .from(TABLE.notificationChannels)
        .upsert({ ...channel, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-channels"] });
    },
  });
}

export function useChannelSecretPresent(channel: string) {
  return useQuery({
    queryKey: ["channel-secret-present", channel],
    staleTime: STALE,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sb.rpc("channel_secret_present", { p_channel: channel });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return false;
        throw error;
      }
      return data === true;
    },
  });
}

export function useSaveChannelSecret(channel: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (secret: string | null) => {
      const { error } = await sb.rpc("set_channel_secret", {
        p_channel: channel,
        p_secret: secret,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-secret-present", channel] });
      qc.invalidateQueries({ queryKey: ["notification-channels"] });
    },
  });
}

export interface SlackDirectory {
  channels: { id: string; name: string }[];
  members: { id: string; label: string }[];
  /** `slackUserId` is the stored link: an id, "" for never DM, or null to match by email.
   *  `autoMatch` is what the email lookup would resolve to right now. */
  people: { id: string; name: string; slackUserId: string | null; autoMatch: string | null }[];
  channelError?: string;
  peopleError?: string;
}

export function useSetUserSlackId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; slackId: string | null }) => {
      const { error } = await sb.rpc("set_user_slack_id", {
        p_user: args.userId,
        p_slack_id: args.slackId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slack-directory"] });
    },
  });
}

/** Channels and people, read live from Slack. Enabled only once a token is stored, so it never
 *  fires on a Hub that has not connected Slack. */
export function useSlackDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ["slack-directory"],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<SlackDirectory> => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.notifyDispatch, {
        body: { mode: "directory" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return {
        ...data,
        channels: data?.channels ?? [],
        members: data?.members ?? [],
        people: data?.people ?? [],
      };
    },
  });
}

export interface PingEvent {
  id: number;
  payload: {
    document_id?: string;
    /** Set instead of document_id when the ping is about a bank transaction. */
    transaction_id?: string;
    note?: string;
    from_name?: string;
  };
  created_at: string;
}

/** Pings addressed to this user, newest first. RLS scopes the select to the recipient. */
export function usePingsForMe(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-events", "pings", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PingEvent[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select("id, payload, created_at")
        .eq("recipient_user_id", appUserId)
        .eq("type", "ping")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as PingEvent[];
    },
  });
}

export interface SentPingEvent extends PingEvent {
  recipient: { name: string | null } | null;
}

export function useSentPings(appUserId: string | null) {
  return useQuery({
    queryKey: ["notification-events", "pings-sent", appUserId],
    enabled: !!appUserId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<SentPingEvent[]> => {
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select(
          `id, payload, created_at, recipient:${TABLE.appUsers}!notification_events_recipient_user_id_fkey(name)`,
        )
        .eq("created_by", appUserId)
        .eq("type", "ping")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === "42P01" || error.code === "42703") return [];
        throw error;
      }
      return (data ?? []) as SentPingEvent[];
    },
  });
}

/**
 * Ask one colleague to look at one record.
 *
 * Takes a kind and an id rather than a column per record type (migration 20260911100000), so a
 * supplier, a customer or a screen added next year needs nothing here. The path is worked out on
 * this side because routes live here, not in SQL.
 */
export function useSendPing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      recipientUserId: string;
      targetKind?: NotificationTargetKind;
      targetId?: string;
      /** Overrides the path derived from kind and id. For a screen with no record behind it. */
      targetPath?: string;
      note?: string;
    }) => {
      const path =
        args.targetPath ??
        (args.targetKind && args.targetId
          ? notifyTargetPath(args.targetKind, args.targetId)
          : null);
      const { data, error } = await sb.rpc("send_notification", {
        p_recipient: args.recipientUserId,
        p_note: args.note ?? null,
        p_target_kind: args.targetKind ?? null,
        p_target_id: args.targetId ?? null,
        p_target_path: path,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-events"] });
      qc.invalidateQueries({ queryKey: ["record-notifications"] });
    },
  });
}

/** One notification addressed to the signed-in user about a record they are looking at. */
export interface RecordNotification {
  id: number;
  note: string | null;
  fromName: string | null;
  createdAt: string;
}

/**
 * What this user still has to read about THIS record.
 *
 * The bell already lists everything they were sent, but it lists it away from the thing it is
 * about: they click through, land on a transaction, and the sentence explaining why they are here
 * is back on the previous screen. This is the same data, asked the other way round.
 *
 * Unacknowledged only, and acknowledgement is per row (migration 20260911100000). It cannot ride
 * on the bell's single seen-timestamp: opening the bell would silence a note on a record they
 * never opened, and dismissing one note would silence every other notification they have.
 */
export function useRecordNotifications(target: {
  kind?: NotificationTargetKind;
  id?: string | null;
}) {
  const { appUserId } = useAuth();
  const key = target.id ?? null;
  const kind = target.kind ?? null;
  return useQuery({
    queryKey: ["record-notifications", kind, key, appUserId],
    enabled: Boolean(key && kind && appUserId),
    queryFn: async (): Promise<RecordNotification[]> => {
      // Matched on the new target shape OR the two legacy columns, because rows written before
      // 20260911100000 are not backfilled: the history is a log, and rewriting what it said is
      // worse than reading both shapes. `or` takes a flat list, so the legacy arm is only added
      // for the two kinds that ever had a column of their own.
      const legacy =
        kind === "invoice"
          ? `,payload->>document_id.eq.${key}`
          : kind === "transaction"
            ? `,payload->>transaction_id.eq.${key}`
            : "";
      const { data, error } = await sb
        .from(TABLE.notificationEvents)
        .select(
          `id, payload, created_at, sender:${TABLE.appUsers}!notification_events_created_by_fkey(name)`,
        )
        .eq("recipient_user_id", appUserId)
        // AND NOT FROM YOU. `send_notification` refuses a recipient equal to the sender, but the
        // guard lives in the RPC and the table is older than it: rows written before it, and any
        // row written directly, can still be addressed to their own author. Reading those back is
        // what put "Faheem Malik asked you to look at this" on Faheem Malik's screen. Filtered
        // here rather than deleted, because the history is a log.
        .neq("created_by", appUserId)
        .is("acknowledged_at", null)
        .or(`and(payload->target->>kind.eq.${kind},payload->target->>id.eq.${key})${legacy}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const sender = row.sender as { name?: string | null } | null;
        return {
          id: Number(row.id),
          note: (payload.note as string | null) ?? null,
          // The join is the live name; payload.from_name is what it was when sent. Prefer the
          // live one so a rename does not leave an old name on screen, fall back for a deleted
          // account.
          fromName: sender?.name ?? (payload.from_name as string | null) ?? null,
          createdAt: String(row.created_at),
        };
      });
    },
  });
}

/** An invoice uploaded from this transaction, on its way through extraction. */
export interface TransactionUpload {
  id: string;
  filename: string | null;
  amountGross: number | null;
  createdAt: string;
  /** True once extraction has run, whatever it found. */
  extracted: boolean;
}

/**
 * Invoices uploaded from THIS transaction.
 *
 * Shown while the link does not exist yet. Extraction is asynchronous and up to two hours behind
 * the upload (migration 20260911190000), and for that whole window the transaction otherwise looks
 * exactly as it did before, so the next person uploads the same document again.
 *
 * Confirmed matches are excluded: once the link is made, the matching panel shows it and a second
 * notice about the same document would be noise.
 */
export function useTransactionUploads(transactionId: string | null | undefined) {
  return useQuery({
    queryKey: ["transaction-uploads", transactionId],
    enabled: Boolean(transactionId),
    queryFn: async (): Promise<TransactionUpload[]> => {
      const { data, error } = await sb
        .from(TABLE.documents)
        .select(
          `id, issuer, amount_gross, created_at, extracted, ${TABLE.documentTransactionMatches}(status)`,
        )
        .eq("uploaded_for_transaction_id", transactionId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .filter((row) => {
          const matches = (row.invoice_transaction_matches ?? []) as { status?: string }[];
          return !matches.some((m) => m.status === "confirmed");
        })
        .map((row) => ({
          id: String(row.id),
          filename: (row.issuer as string | null) ?? null,
          amountGross: (row.amount_gross as number | null) ?? null,
          createdAt: String(row.created_at),
          extracted: row.extracted != null,
        }));
    },
    // Extraction lands out of band, so the page has to look again rather than wait for a write.
    refetchInterval: 60_000,
  });
}

/** Dismissing the banner is a write, not local state: otherwise it greets them again next visit. */
export function useAcknowledgeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: number) => {
      const { error } = await sb.rpc("acknowledge_notification", { p_event_id: eventId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["record-notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-events"] });
    },
  });
}

/** The settings screen's "send test" button: asks the dispatcher to post one test message
 *  through a channel. Admin-gated inside the function itself. */
export function useSendTestNotification() {
  return useMutation({
    mutationFn: async (channel: string) => {
      const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION.notifyDispatch, {
        body: { mode: "test", channel },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
    },
  });
}

export interface DispatchRun {
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  digests: number;
  errors: string[];
}

/** The dispatcher's newest run, for the settings screen's health line. Admin-read by RLS;
 *  everyone else (and a Hub whose migration lags) just gets null. */
export function useLastDispatchRun() {
  return useQuery({
    queryKey: ["notification-dispatch-log", "last"],
    staleTime: 60_000,
    queryFn: async (): Promise<DispatchRun | null> => {
      const { data, error } = await sb
        .from(TABLE.notificationDispatchLog)
        .select("started_at, finished_at, ok, digests, errors")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        if (error.code === "42P01") return null;
        throw error;
      }
      return (data as DispatchRun | null) ?? null;
    },
  });
}

// Rejected invoices whose rejection is addressed to this person. Same shape as
// useInvoicesReturnedToMe -- see useInvoicesReturnedByType for how the target is resolved.
export function useInvoicesRejectedToMe(myUserId: string | null, myName: string | null) {
  return useInvoicesReturnedByType("rejection", "rejected", "abgelehnt_an_mich", myUserId, myName);
}
