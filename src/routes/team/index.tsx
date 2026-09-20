import { createFileRoute } from "@tanstack/react-router";
import { useCallback, forwardRef, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Pencil, Plus, ShieldOff, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { KeinZugriff } from "@/components/layout/kein-zugriff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { useAuth } from "@/lib/auth";
import { PermissionChecklist } from "@/components/access/permission-checklist";
import { PermissionMatrix } from "@/components/access/permission-matrix";
import type { AccessPermission, AccessRole } from "@/components/access/types";
import { PERMISSIONS } from "@/config/permissions";
import {
  useCreateEmployee,
  useEmployees,
  useGesellschaften,
  useResetEmployeePassword,
  type PermissionRow,
  usePermissionCatalogue,
  useRolePermissions,
  useRoles,
  useSetAccountingRight,
  useSetRolePermission,
  useSetCompanyAccess,
  useSetEmployeeActive,
  useUpdateChainPerson,
  useUpdateEmployeeProfile,
  useUpdateEmployeeRole,
  AreaConflictError,
  type AssignableRole,
} from "@/data";
import type { ApprovalArea, Employee } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { BRAND, pageTitle } from "@/config/brand";
import { fehlerText } from "@/lib/data/format";

export const Route = createFileRoute("/team/")({
  validateSearch: tabSearch,
  head: () => ({ meta: [{ title: pageTitle("Team & Rollen") }] }),
  component: TeamGuard,
});

// Admin-only page (Briefing Screen 17 / Appendix A7). The real boundary is RLS
// (app_users_admin_read/insert/update, migration 0046) -- this is just the UX guard so a
// non-admin never even sees an empty/erroring management screen.
function TeamGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageTeam)) return <KeinZugriff />;
  return <TeamPage />;
}

/** Sentinel for the "all companies" row. Not a company id, so it can never collide. */
const ALLE_GESELLSCHAFTEN = "__alle";
// The two sentinels the approval-settings selects need. LEER is "not set"; a Select cannot carry
// an empty-string value, so absence needs a value of its own. ALLE_BEREICHE is the one option that
// is not an `area` at all -- it writes covers_all_areas instead, which is why the two move as a
// pair (app_users_area_shape rejects having both).
const LEER = "__none";
const ALLE_BEREICHE = "__alle_bereiche";

const ROLE_OPTIONS: AssignableRole[] = ["admin", "supervisor", "assistant"];

// Deliberately permissive — the point is to catch "abc" and a missing @, not to police the RFC.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function TeamPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(["personen", "rollen"] as const, "personen");
  const q = useEmployees();
  // Super admin pinned to the top and highlighted below: it is the owner/technical account, the
  // only one whose access cannot be edited, so burying it mid-list under an alphabetical email
  // sort makes the one row with different rules the hardest to find. Everything else keeps
  // useEmployees' own email ordering.
  const [suche, setSuche] = useState("");
  const [nurInaktive, setNurInaktive] = useState(false);

  const employees = useMemo(() => {
    const term = suche.trim().toLowerCase();
    const rows = (q.data ?? []).filter((e) => {
      // #9: no search and no filter at all — which is why a leftover test account sits unnoticed.
      if (nurInaktive && e.is_active) return false;
      if (!term) return true;
      return [e.name ?? "", e.email, t(`team.role.${e.role_name}`)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    return [...rows].sort((a, b) => {
      const aSuper = a.role_name === "super_admin" ? 0 : 1;
      const bSuper = b.role_name === "super_admin" ? 0 : 1;
      return aSuper - bSuper;
    });
  }, [q.data, suche, nurInaktive, t]);
  const companiesQ = useGesellschaften();
  const companies = companiesQ.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("team.list.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("team.list.subtitle")}</p>
        </div>
        <NewEmployeeDialog
          companies={companies}
          vorhandeneEmails={(q.data ?? []).map((e) => e.email.toLowerCase())}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        {/* Tabs left, the list's own controls right, one row: the search only applies to the
            people tab, so it travels with the tabs rather than sitting on its own line. */}
        <div className="flex flex-wrap items-center gap-3">
          <TabsList
            className="flex h-auto w-auto flex-wrap justify-start gap-1"
            data-tour="team-tabs"
          >
            <TabsTrigger value="personen">{t("team.tab.personen")}</TabsTrigger>
            <TabsTrigger value="rollen">{t("team.tab.rollen")}</TabsTrigger>
          </TabsList>
          {tab === "personen" && (
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-[260px] sm:flex-none">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={suche}
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder={t("team.list.suche")}
                  className="h-9 pl-9"
                />
              </div>
              <Button
                variant={nurInaktive ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => setNurInaktive((v) => !v)}
              >
                {t("team.list.nurInaktive")}
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="personen" className="mt-3" data-tour="team-people">
          {q.isError ? (
            <div className="mt-3">
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            </div>
          ) : q.isLoading ? (
            <div className="mt-3">
              <TableSkeleton rows={4} cols={5} />
            </div>
          ) : (
            <>
              {/* Desktop/tablet: real table (9 columns — name/email/role/companies/3 rights/active/
              actions, no way that fits a phone). Below `sm`, one card per employee instead. */}
              <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
                <Table className="[&_td]:py-1.5 [&_th]:h-9">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>{t("team.list.col.name")}</TableHead>
                      <TableHead>{t("team.list.col.email")}</TableHead>
                      <TableHead>{t("team.list.col.role")}</TableHead>
                      <TableHead>{t("team.list.col.companies")}</TableHead>
                      {/* One count, not a column per permission: the catalogue is 17 keys and growing,
                      and the list is already nine columns wide. Editing happens in the pencil
                      dialog, where every permission is reachable. */}
                      <TableHead className="w-[130px] text-center">
                        {t("team.list.col.rechte")}
                      </TableHead>
                      <TableHead className="w-[92px] text-center">
                        {t("team.list.col.active")}
                      </TableHead>
                      <TableHead className="w-[64px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee, index) => (
                      <TableRow
                        key={employee.id}
                        className={cn(
                          !employee.is_active && "opacity-60",
                          employee.role_name === "super_admin" &&
                            "bg-brand-wash/60 hover:bg-brand-wash",
                        )}
                      >
                        <TableCell className="font-medium text-foreground">
                          <span className="block">{employee.name ?? "—"}</span>
                          {employee.must_change_password && (
                            <span className="block text-xs font-normal whitespace-nowrap text-muted-foreground">
                              {t("team.status.nieAngemeldet")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={ROLE_BADGE[employee.role_name] ?? ROLE_BADGE.assistant}
                          >
                            {t(`team.role.${employee.role_name}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {employee.allowed_company_ids.length === 0 ? (
                              <Badge variant="default">{t("team.access.alle")}</Badge>
                            ) : (
                              /* #10: one badge per allowed company, unbounded — eight of twelve
                             wrapped inside the cell with no truncation. Capped, with the full
                             list still reachable via the title. */
                              (() => {
                                const codes = companies
                                  .filter((c) => employee.allowed_company_ids.includes(c.id))
                                  .map((c) => c.code);
                                const sichtbar = codes.slice(0, 4);
                                const rest = codes.length - sichtbar.length;
                                return (
                                  <>
                                    {sichtbar.map((code) => (
                                      <Badge key={code} variant="secondary">
                                        {code}
                                      </Badge>
                                    ))}
                                    {rest > 0 && (
                                      <Badge variant="outline" title={codes.join(", ")}>
                                        {t("team.access.weitere", { count: rest })}
                                      </Badge>
                                    )}
                                  </>
                                );
                              })()
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          <PermissionCount employee={employee} />
                        </TableCell>
                        <TableCell className="text-center">
                          {employee.is_active ? (
                            <Badge className="border-transparent bg-success-soft text-success">
                              {t("team.status.aktiv")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              {t("team.status.inaktiv")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div
                            className="flex justify-end gap-1"
                            data-tour={index === 0 ? "team-actions" : undefined}
                          >
                            <EditEmployeeDialog employee={employee} companies={companies} />
                            <ResetPasswordDialog employee={employee} />
                            <ToggleActiveDialog employee={employee} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                          {t("team.list.empty")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 space-y-3 sm:hidden">
                {employees.map((employee, index) => (
                  <div
                    key={employee.id}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4",
                      !employee.is_active && "opacity-60",
                      employee.role_name === "super_admin" && "border-brand-soft bg-brand-wash/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {employee.name ?? "—"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {employee.email}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {employee.is_active ? (
                          <Badge variant="secondary">{t("team.status.aktiv")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("team.status.inaktiv")}</Badge>
                        )}
                        {employee.must_change_password && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {t("team.status.nieAngemeldet")}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{t(`team.role.${employee.role_name}`)}</Badge>
                      {employee.allowed_company_ids.length === 0 ? (
                        <Badge variant="default">{t("team.access.alle")}</Badge>
                      ) : (
                        /* #10: same cap as the desktop table above. */
                        (() => {
                          const codes = companies
                            .filter((c) => employee.allowed_company_ids.includes(c.id))
                            .map((c) => c.code);
                          const sichtbar = codes.slice(0, 4);
                          const rest = codes.length - sichtbar.length;
                          return (
                            <>
                              {sichtbar.map((code) => (
                                <Badge key={code} variant="secondary">
                                  {code}
                                </Badge>
                              ))}
                              {rest > 0 && (
                                <Badge variant="outline" title={codes.join(", ")}>
                                  {t("team.access.weitere", { count: rest })}
                                </Badge>
                              )}
                            </>
                          );
                        })()
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {t("team.list.col.rechte")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <PermissionCount employee={employee} />
                        </span>
                      </div>
                    </div>

                    <div
                      className="mt-3 flex justify-end gap-1 border-t border-border pt-2"
                      data-tour={index === 0 ? "team-actions" : undefined}
                    >
                      <EditEmployeeDialog employee={employee} companies={companies} />
                      <ResetPasswordDialog employee={employee} />
                      <ToggleActiveDialog employee={employee} />
                    </div>
                  </div>
                ))}
                {employees.length === 0 && (
                  <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                    {t("team.list.empty")}
                  </p>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="rollen" className="mt-3">
          <RolePermissionMatrix />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// The Switch + tooltip alone, shared by the desktop table cell and the mobile card row below —
// same control, two different wrappers around it. forcedByRole: admins are always trusted for all
// three -- shown as on-and-disabled rather than hidden, so it's still visible *why* an admin can
// book/approve/pay, instead of that answer only existing implicitly in the role column.
/**
 * What each ROLE grants. Renders the shared, project-agnostic `PermissionMatrix`; this wrapper only
 * supplies this Hub's data source and labels.
 *
 * Changing a cell moves everyone holding that role who has no personal exception — the one control
 * here with blast radius beyond a single employee, hence the note and the change_history entry
 * `useSetRolePermission` writes.
 */
/**
 * A catalogue row -> what the admin actually reads beside the checkbox.
 *
 * The wording comes from the LOCALE, keyed by the permission key, not from the database. It is UI
 * copy: rewording "Rechnungen freigeben" into something a layman follows should be a front-end
 * edit, not a migration against production. The `permissions` table's own label/description
 * columns stay as the FALLBACK, so a key added by a future seed still renders a sentence rather
 * than a raw key.
 *
 * The key's dots nest, so `invoices.book` resolves `permissions.invoices.book.label`.
 */
function usePermissionText() {
  const { t, i18n } = useTranslation();
  const deutsch = i18n.language.startsWith("de");
  return useCallback(
    (p: PermissionRow): AccessPermission => ({
      key: p.key,
      category: p.category,
      label: t(`permissions.${p.key}.label`, {
        defaultValue: (deutsch ? p.label_de : p.label_en) ?? p.key,
      }),
      description: t(`permissions.${p.key}.desc`, {
        // Falls back to the German text rather than showing nothing, for a Hub whose seed has not
        // supplied the English half yet.
        defaultValue: (deutsch ? p.description_de : p.description_en) ?? p.description_de ?? "",
      }),
    }),
    [t, deutsch],
  );
}

function RolePermissionMatrix() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const catalogueQ = usePermissionCatalogue();
  const rolesQ = useRoles();
  const rolePermsQ = useRolePermissions();
  const setRolePermission = useSetRolePermission();

  const permissionText = usePermissionText();
  const permissions = useMemo<AccessPermission[]>(
    () => (catalogueQ.data ?? []).map(permissionText),
    [catalogueQ.data, permissionText],
  );

  const roles = useMemo<AccessRole[]>(
    () =>
      // The owner account's role is omitted rather than shown permanently ticked and locked: the
      // trigger forces it regardless, so the column could only be noise.
      (rolesQ.data ?? [])
        .filter((r) => r.name !== "super_admin")
        .map((r) => ({ id: r.id, label: t(`team.role.${r.name}`) })),
    [rolesQ.data, t],
  );

  const rolleNach = useMemo(
    () => new Map((rolesQ.data ?? []).map((r) => [r.id, r.name])),
    [rolesQ.data],
  );

  if (catalogueQ.isLoading || rolesQ.isLoading || rolePermsQ.isLoading) {
    return <TableSkeleton rows={6} cols={4} />;
  }
  if (catalogueQ.isError || rolesQ.isError || rolePermsQ.isError) {
    return (
      <ErrorState
        error={catalogueQ.error ?? rolesQ.error ?? rolePermsQ.error}
        onRetry={() => {
          catalogueQ.refetch();
          rolesQ.refetch();
          rolePermsQ.refetch();
        }}
      />
    );
  }

  return (
    <div data-tour="team-roles">
      <p className="max-w-3xl text-sm text-muted-foreground">{t("team.rollenrechte.hinweis")}</p>
      <PermissionMatrix
        className="mt-4"
        permissions={permissions}
        roles={roles}
        grantedByRole={rolePermsQ.data ?? {}}
        disabled={setRolePermission.isPending}
        permissionColumnLabel={t("team.rollenrechte.spalte")}
        categoryLabel={(c) => t(`team.permissions.kategorie.${c}`, { defaultValue: c })}
        onToggle={(roleId, key, next) =>
          setRolePermission.mutate(
            { roleId, roleName: rolleNach.get(roleId) ?? "", key, value: next },
            {
              // A role change can move the signed-in admin without naming them.
              onSuccess: () => void refreshProfile(),
              onError: (e) => toast.error(fehlerText(e)),
            },
          )
        }
      />
    </div>
  );
}

/** How many of the catalogue's permissions this person holds. One glanceable number instead of a
 *  column per key. */
// One hue, four weights. Rank is the only thing that separates these, so a colour PER role would
// invent four unrelated categories; status colours are out because a role is not a state.
const ROLE_BADGE: Record<string, string> = {
  super_admin: "border-transparent bg-brand-dark text-white",
  admin: "border-transparent bg-brand-tint text-brand-dark",
  supervisor: "border-transparent bg-muted text-foreground",
  assistant: "border-border bg-card text-muted-foreground",
};

function PermissionCount({ employee }: { employee: Employee }) {
  const { t } = useTranslation();
  const catalogueQ = usePermissionCatalogue();
  const gesamt = catalogueQ.data?.length ?? 0;
  if (!gesamt) return <>—</>;
  if (employee.role_name === "super_admin")
    return <>{t("team.list.rechteAnzahl", { n: gesamt, gesamt })}</>;
  return <>{t("team.list.rechteAnzahl", { n: employee.permissions.length, gesamt })}</>;
}

/**
 * What one employee may do. Renders the shared, project-agnostic `PermissionChecklist`; this
 * wrapper only supplies this Hub's data source and labels.
 */
function PermissionsSection({
  employee,
  held,
  onChange,
  readOnly = false,
  grantable,
}: {
  employee: Employee;
  held: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  /** Whether the person editing holds a permission themselves. Nobody may grant beyond their own. */
  grantable?: (key: string) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const deutsch = i18n.language.startsWith("de");
  const catalogueQ = usePermissionCatalogue();
  // The owner account holds everything unconditionally (guard_super_admin_permissions), so its
  // boxes could only ever be ones nobody may untick.
  const gesperrt = employee.role_name === "super_admin";

  const permissionText = usePermissionText();
  const permissions = useMemo<AccessPermission[]>(
    () => (catalogueQ.data ?? []).map(permissionText),
    [catalogueQ.data, permissionText],
  );

  if (catalogueQ.isLoading || permissions.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>{t("team.permissions.titel")}</Label>
      <div className="rounded-lg border border-border p-3">
        <PermissionChecklist
          permissions={permissions}
          held={gesperrt ? permissions.map((p) => p.key) : held}
          disabled={gesperrt || readOnly}
          lockedNote={t("team.rights.nichtVergebbar")}
          lockedKeys={
            gesperrt || readOnly || !grantable
              ? undefined
              : permissions
                  .filter((p) => !grantable(p.key) && !held.includes(p.key))
                  .map((p) => p.key)
          }
          readOnlyNote={
            gesperrt
              ? t("team.rights.impliedBySuperAdmin")
              : readOnly
                ? t("team.rights.nurAdmin")
                : undefined
          }
          categoryLabel={(c) => t(`team.permissions.kategorie.${c}`, { defaultValue: c })}
          onToggle={(key, next) => onChange(next ? [...held, key] : held.filter((k) => k !== key))}
        />
      </div>
    </div>
  );
}

/**
 * The three approval-chain settings that are NOT permissions: deputy, escalation days, and area
 * of responsibility.
 *
 * They used to live on the Approvers tab of Freigabe-Regeln, on a second people-table you had to
 * register somebody in before they could appear in a chain (migration 20260901160000). They are
 * properties of a PERSON, so they belong on the person, next to what that person may do.
 *
 * Saved on the spot, like the permission checklist below it and unlike role and company access,
 * which are staged until the drawer's own Save. Each is an independent single value with no
 * cross-field consequence, so staging them would only add a way to lose them by closing the
 * drawer.
 *
 * Payment handling is deliberately absent. It fed one hint sentence on the invoice screen, it is a
 * property of a company or a rule rather than of a person, and the client asked for it to go.
 */
function ApprovalSettingsSection({ employee }: { employee: Employee }) {
  const { t } = useTranslation();
  const employeesQ = useEmployees();
  const update = useUpdateChainPerson();

  // The escalation input is the one field that can be typed into a wrong state, so it holds local
  // text and commits on blur. The other two are selects: their value is always valid.
  const [tage, setTage] = useState(
    employee.escalation_days ? String(employee.escalation_days) : "",
  );
  const tageZahl = tage.trim() === "" ? null : Number(tage);
  const tageUngueltig =
    tageZahl != null &&
    (!Number.isFinite(tageZahl) || !Number.isInteger(tageZahl) || tageZahl <= 0);

  // Who can deputise: anybody active except this person themselves (app_users_deputy_not_self) and
  // except the owner account, which is technical and never part of a chain.
  const vertretungen = useMemo(
    () =>
      (employeesQ.data ?? [])
        .filter((e) => e.is_active && e.id !== employee.id && e.role_name !== "super_admin")
        // With the role, because who can usefully cover for somebody depends on what they may do:
        // an Assistenz standing in for a Vorgesetzter is a name in a warning, not a replacement.
        .map((e) => ({
          value: e.id,
          label: `${e.name ?? e.email} (${t(`team.role.${e.role_name}`)})`,
        })),
    [employeesQ.data, employee.id, t],
  );

  // This replaces a CHECK constraint. `approvers_area_requires_manager` said only a manager may own
  // an area; on app_users the equivalent question is "does this person hold invoices.approve_final",
  // a cross-table permission lookup a CHECK cannot express. Enforced here instead, at the point of
  // entry, which is where the constraint was doing its work: an area owner who cannot give the
  // final approval is a receipt routed to somebody who then sees no button.
  const darfFinalFreigeben = employee.permissions.includes(PERMISSIONS.invoicesApproveFinal);
  const bereichWert = employee.covers_all_areas ? ALLE_BEREICHE : (employee.area ?? LEER);

  function speichern(changes: Parameters<typeof update.mutate>[0]["changes"]) {
    update.mutate(
      { userId: employee.id, changes },
      {
        onSuccess: () => toast.success(t("team.chain.gespeichert")),
        onError: (e) =>
          toast.error(
            e instanceof AreaConflictError
              ? t("team.chain.bereichKonflikt", { bereich: t(`freigabeRegeln.bereich.${e.area}`) })
              : fehlerText(e),
          ),
      },
    );
  }

  return (
    <div className="space-y-2">
      <Label>{t("team.chain.titel")}</Label>
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("team.chain.bereich")}</Label>
          <Select
            value={bereichWert}
            disabled={!darfFinalFreigeben || update.isPending}
            onValueChange={(v) =>
              speichern({
                area: v === LEER || v === ALLE_BEREICHE ? null : (v as ApprovalArea),
                covers_all_areas: v === ALLE_BEREICHE,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LEER}>{t("freigabeRegeln.bereich.keiner")}</SelectItem>
              <SelectItem value="hospitality">{t("freigabeRegeln.bereich.hospitality")}</SelectItem>
              <SelectItem value="stay_re">{t("freigabeRegeln.bereich.stay_re")}</SelectItem>
              <SelectItem value={ALLE_BEREICHE}>{t("freigabeRegeln.bereich.alle")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {darfFinalFreigeben ? t("team.chain.bereichHint") : t("team.chain.bereichBrauchtRecht")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("team.chain.vertretung")}</Label>
          <Select
            value={employee.deputy_user_id ?? LEER}
            disabled={update.isPending}
            onValueChange={(v) => speichern({ deputy_user_id: v === LEER ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LEER}>{t("freigabeRegeln.keineVertretung")}</SelectItem>
              {vertretungen.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("team.chain.vertretungHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("team.chain.eskalation")}</Label>
          <Input
            value={tage}
            inputMode="numeric"
            placeholder={t("freigabeRegeln.feld.eskalationPlaceholder")}
            disabled={update.isPending}
            onChange={(e) => setTage(e.target.value)}
            // Committed on blur, not per keystroke: typing "12" would otherwise write 1 on the way
            // through, and 1 is a valid escalation the person would then have to notice and undo.
            onBlur={() => {
              if (tageUngueltig) return;
              if ((tageZahl ?? null) === (employee.escalation_days ?? null)) return;
              speichern({ escalation_days: tageZahl });
            }}
          />
          {tageUngueltig ? (
            <p className="text-xs text-destructive">
              {t("freigabeRegeln.feld.eskalationUngueltig")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("team.chain.eskalationHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// A single pencil-icon-triggered edit modal for role + company access together -- edits happen
// behind an explicit "open the modal, change, save" step, never as an inline table-row control.
function EditEmployeeDialog({
  employee,
  companies,
}: {
  employee: Employee;
  companies: { id: string; code: string; name: string }[];
}) {
  const { t } = useTranslation();
  const { user, isAdmin, can, refreshProfile } = useAuth();
  // #1: the super admin was protected three ways; a plain admin had none of that protection against
  // ITSELF — nothing compared the row being edited to the person editing it, so an admin could
  // demote or deactivate their own account and lose the screen that undoes it.
  const istIchSelbst = !!user && user.email.toLowerCase() === employee.email.toLowerCase();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee.name ?? "");
  const [email, setEmail] = useState(employee.email);
  const [roleName, setRoleName] = useState<AssignableRole>(
    employee.role_name === "super_admin" ? "admin" : employee.role_name,
  );
  const [selected, setSelected] = useState<string[]>(employee.allowed_company_ids);
  const [rechte, setRechte] = useState<string[]>(employee.permissions);

  const updateProfile = useUpdateEmployeeProfile();
  const updateRole = useUpdateEmployeeRole();
  const setAccess = useSetCompanyAccess();
  const setRight = useSetAccountingRight();
  const pending =
    updateProfile.isPending || updateRole.isPending || setAccess.isPending || setRight.isPending;
  // The super admin is the owner/technical account: it already has access to everything, that
  // access is not something an admin gets to narrow, and its role is not assignable at all
  // (AssignableRole excludes it, and the server function rejects it). Only the display name is
  // editable. This is a hard guard, not just a disabled input: `roleName` is seeded to "admin" for
  // a super admin (there is no super_admin entry in ROLE_OPTIONS to seed from), so without it
  // roleChanged would be TRUE on open and saving would silently DEMOTE the super admin.
  const isSuperAdmin = employee.role_name === "super_admin";
  const rolleGesperrt = isSuperAdmin || istIchSelbst;
  const roleChanged = !rolleGesperrt && roleName !== employee.role_name;
  const profileChanged = name.trim() !== (employee.name ?? "") || email.trim() !== employee.email;
  const accessChanged =
    selected.length !== employee.allowed_company_ids.length ||
    selected.some((id) => !employee.allowed_company_ids.includes(id));
  const geaenderteRechte = useMemo(() => {
    const vorher = new Set(employee.permissions);
    const nachher = new Set(rechte);
    const keys = new Set([...vorher, ...nachher]);
    return [...keys].filter((key) => vorher.has(key) !== nachher.has(key));
  }, [employee.permissions, rechte]);
  const rechteChanged = geaenderteRechte.length > 0;
  // #3: an EMPTY selection means unrestricted, so removing the last company WIDENS access.
  const weitetZugriffAus =
    accessChanged && selected.length === 0 && employee.allowed_company_ids.length > 0;
  const invalid = !name.trim() || !email.trim();
  const dirty = isSuperAdmin
    ? name.trim() !== (employee.name ?? "")
    : profileChanged || roleChanged || accessChanged || rechteChanged;

  async function speichern() {
    try {
      if (isSuperAdmin) {
        // Name only. The email is passed back unchanged because updateEmployeeProfile takes both,
        // and changing it would move the Supabase Auth login identity too.
        // Toast only when a request actually went out -- reporting "saved" for a no-op trains the
        // admin to trust a message that does not mean anything.
        if (name.trim() !== (employee.name ?? "")) {
          await updateProfile.mutateAsync({
            employeeId: employee.id,
            name: name.trim(),
            email: employee.email,
          });
          toast.success(t("team.access.toast.gespeichert"));
        }
        setOpen(false);
        return;
      }
      // #2: three separate writes, no transaction. A failure between them left the person with the
      // new role and the old access, reported as one generic "fehlgeschlagen". They cannot be made
      // atomic from the client, so: skip writes that change nothing (access was written on EVERY
      // save), and name the step that failed so the half-applied state is legible.
      let schritt = "";
      try {
        if (profileChanged) {
          schritt = t("team.access.schritt.profil");
          await updateProfile.mutateAsync({
            employeeId: employee.id,
            name: name.trim(),
            email: email.trim(),
          });
        }
        if (roleChanged) {
          schritt = t("team.access.schritt.rolle");
          await updateRole.mutateAsync({ employeeId: employee.id, roleName });
        }
        if (accessChanged) {
          schritt = t("team.access.schritt.zugriff");
          await setAccess.mutateAsync({ employeeId: employee.id, companyIds: selected });
        }
        if (rechteChanged) {
          schritt = t("team.access.schritt.rechte");
          for (const key of geaenderteRechte) {
            await setRight.mutateAsync({
              employeeId: employee.id,
              right: key,
              value: rechte.includes(key),
            });
          }
          await refreshProfile();
        }
      } catch (e) {
        toast.error(t("team.access.toast.teilweise", { schritt, error: fehlerText(e) }));
        throw e;
      }
      toast.success(t("team.access.toast.gespeichert"));
      setOpen(false);
    } catch (e) {
      toast.error(
        t("team.access.toast.fehlgeschlagen", {
          error: fehlerText(e),
        }),
      );
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(employee.name ?? "");
          setEmail(employee.email);
          setRoleName(employee.role_name === "super_admin" ? "admin" : employee.role_name);
          setSelected(employee.allowed_company_ids);
          setRechte(employee.permissions);
        }
      }}
    >
      <SheetTrigger asChild>
        <IconAction label={t("team.list.action.bearbeiten")}>
          <Pencil className="size-4" />
        </IconAction>
      </SheetTrigger>
      <SheetContent
        side="right"
        /* Wider than the default sm:max-w-sm: this drawer carries a profile, a company list and a
           17-item permission catalogue, and at drawer width the permission rows wrap to two lines
           each. Scrolls internally so the footer stays reachable. */
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{t("team.access.dialog.title")}</SheetTitle>
          {/* Radix needs a description for the drawer's aria-describedby; the visible one said
              nothing the title and the sections below do not already say. */}
          <SheetDescription className="sr-only">{t("team.access.dialog.desc")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("team.new.field.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("team.new.field.email")}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSuperAdmin}
            />
            {!isSuperAdmin && email.trim() !== employee.email && (
              <p className="text-xs text-muted-foreground">{t("team.edit.emailChangeHint")}</p>
            )}
          </div>
          {istIchSelbst && !isSuperAdmin && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("team.edit.selbstHinweis")}
            </p>
          )}
          {isSuperAdmin ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("team.new.field.role")}</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {t("team.role.super_admin")}
              </div>
              <p className="text-xs text-muted-foreground">{t("team.edit.superAdminHint")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("team.new.field.role")}</Label>
                <Select
                  value={roleName}
                  disabled={istIchSelbst}
                  onValueChange={(v) => setRoleName(v as AssignableRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`team.role.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("team.new.field.companies")}
                </Label>
                {/* Same control as the create dialog: one picker for company access, wherever it is
                    set. "Alle Gesellschaften" first, and it is the empty selection the model already
                    stores -- allowed_company_ids = [] is unrestricted. Note that picking it WIDENS
                    access, which is why the warning below fires on exactly that transition. */}
                <MultiCombobox
                  values={selected.length === 0 ? [ALLE_GESELLSCHAFTEN] : selected}
                  onValuesChange={(next) => {
                    const willAlle = next.includes(ALLE_GESELLSCHAFTEN) && selected.length > 0;
                    setSelected(willAlle ? [] : next.filter((v) => v !== ALLE_GESELLSCHAFTEN));
                  }}
                  options={[
                    {
                      value: ALLE_GESELLSCHAFTEN,
                      label: t("team.new.field.companiesAlle"),
                    },
                    ...companies.map((c) => ({
                      value: c.id,
                      label: `${c.code} · ${c.name}`,
                      keywords: c.name,
                    })),
                  ]}
                  placeholder={t("team.new.field.companiesWaehlen")}
                />
              </div>

              <ApprovalSettingsSection employee={employee} />

              <PermissionsSection
                employee={employee}
                held={rechte}
                onChange={setRechte}
                readOnly={!isAdmin || istIchSelbst}
                grantable={can}
              />
            </>
          )}
        </div>
        {/* #4: promoting someone to admin grants Team, Papierkorb, Freigabe-Regeln, the BWA and
            unrestricted DATEV control — it went through the same silent Speichern as fixing a typo,
            while DEACTIVATING an account (fully reversible) got a confirm dialog. */}
        {roleChanged && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("team.edit.rollenwechsel", {
              von: t(`team.role.${employee.role_name}`),
              nach: t(`team.role.${roleName}`),
            })}
          </p>
        )}
        {weitetZugriffAus && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("team.edit.zugriffAusweitung")}
          </p>
        )}
        <SheetFooter className="mt-auto gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("team.access.dialog.cancel")}
          </Button>
          <Button onClick={speichern} disabled={pending || invalid || !dirty}>
            {pending ? t("team.access.dialog.saving") : t("team.access.dialog.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ToggleActiveDialog({ employee }: { employee: Employee }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const istIchSelbstToggle = !!user && user.email.toLowerCase() === employee.email.toLowerCase();
  const setActive = useSetEmployeeActive();

  function bestaetigen() {
    setActive.mutate(
      { employeeId: employee.id, isActive: !employee.is_active },
      {
        onSuccess: () =>
          toast.success(
            t(employee.is_active ? "team.deactivate.toast.ok" : "team.reactivate.toast.ok"),
          ),
        onError: (e) =>
          toast.error(
            t("team.deactivate.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <IconAction
          className={
            employee.is_active
              ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
          }
          label={t(
            employee.is_active ? "team.list.action.deaktivieren" : "team.list.action.reaktivieren",
          )}
          // The super admin is the owner/technical account and must always be able to get back in;
          // deactivating it could lock the last unrestricted account out of the app. Enforced in
          // the database too (app_users_super_admin_stays_active), since this toggle writes
          // straight to app_users via RLS rather than through a server function that could check.
          // Only the DEACTIVATE direction is blocked. The DB trigger allows false -> true, so
          // disabling both directions would leave an inactive super admin with no way back in.
          disabled={
            employee.is_active && (employee.role_name === "super_admin" || istIchSelbstToggle)
          }
          title={
            employee.role_name === "super_admin"
              ? t("team.edit.superAdminCannotBeDeactivated")
              : undefined
          }
        >
          {employee.is_active ? (
            <ShieldOff className="size-4" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
        </IconAction>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(employee.is_active ? "team.deactivate.title" : "team.reactivate.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(employee.is_active ? "team.deactivate.desc" : "team.reactivate.desc", {
              email: employee.email,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("team.deactivate.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={bestaetigen}
            className={
              employee.is_active
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {t(employee.is_active ? "team.deactivate.confirm" : "team.reactivate.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Active employees only -- an inactive account can't log in regardless of password
// (resetEmployeePassword itself rejects it server-side too), so offering to reset one here would
// just be misleading. Reactivate via ToggleActiveDialog first.
function ResetPasswordDialog({ employee }: { employee: Employee }) {
  const { t } = useTranslation();
  const resetPassword = useResetEmployeePassword();
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );

  function bestaetigen() {
    resetPassword.mutate(
      { employeeId: employee.id },
      {
        onSuccess: (result) =>
          setCredentials({ email: result.email, tempPassword: result.tempPassword }),
        onError: (e) =>
          toast.error(
            t("team.resetPassword.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {/* An unlabelled key icon says nothing to a sighted user; the aria-label only ever
              reached screen readers. Same for the shield beside it and the pencil. */}
          <IconAction
            label={t("team.list.action.passwortZuruecksetzen")}
            disabled={!employee.is_active || employee.role_name === "super_admin"}
          >
            <KeyRound className="size-4" />
          </IconAction>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team.resetPassword.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("team.resetPassword.desc", { email: employee.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("team.resetPassword.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={bestaetigen}>
              {t("team.resetPassword.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {credentials && (
        <TempPasswordDialog
          credentials={credentials}
          onClose={() => setCredentials(null)}
          title={t("team.resetPassword.tempPasswordTitle")}
          desc={t("team.resetPassword.tempPasswordDesc", { email: credentials.email })}
        />
      )}
    </>
  );
}

/**
 * An icon-only row action with a real tooltip.
 *
 * `aria-label` alone is not enough: it reaches screen readers and nobody else, so a row of bare
 * icons is a guessing game for everyone looking at it. `asChild`-friendly, so it still works as a
 * Dialog/AlertDialog trigger.
 */
const IconAction = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { label: string }
>(function IconAction({ label, children, ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

function NewEmployeeDialog({
  companies,
  vorhandeneEmails,
}: {
  companies: { id: string; code: string; name: string }[];
  vorhandeneEmails: string[];
}) {
  const { t, i18n } = useTranslation();
  const deutsch = i18n.language.startsWith("de");
  const create = useCreateEmployee();
  const setRight = useSetAccountingRight();
  const catalogueQ = usePermissionCatalogue();
  const rolesQ = useRoles();
  const rolePermsQ = useRolePermissions();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleName, setRoleName] = useState<AssignableRole>("assistant");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  // Deviations from what the chosen role grants, as {key: granted}. Held locally because the
  // employee has no id until createEmployee returns one; written immediately afterwards.
  const [abweichungen, setAbweichungen] = useState<Record<string, boolean>>({});
  // The three chain settings, held locally for the same reason as the permission deviations: the
  // account has no id until createEmployee returns one. Written straight afterwards.
  const [deputyUserId, setDeputyUserId] = useState(LEER);
  const [escalationDays, setEscalationDays] = useState("");
  const [bereich, setBereich] = useState(LEER);
  const updateChain = useUpdateChainPerson();
  const employeesQ = useEmployees();
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  // What the chosen role grants today, and the resulting effective set with local deviations
  // applied. Recomputed when the role dropdown changes, so the list always previews reality.
  const rollenVorgabe = useMemo(() => {
    const rolle = (rolesQ.data ?? []).find((r) => r.name === roleName);
    return rolle ? ((rolePermsQ.data ?? {})[rolle.id] ?? []) : [];
  }, [rolesQ.data, rolePermsQ.data, roleName]);

  const permissionText = usePermissionText();
  const neuePermissions = useMemo<AccessPermission[]>(
    () => (catalogueQ.data ?? []).map(permissionText),
    [catalogueQ.data, permissionText],
  );

  const neueGehalten = useMemo(() => {
    const keys = new Set(rollenVorgabe);
    for (const [key, granted] of Object.entries(abweichungen)) {
      if (granted) keys.add(key);
      else keys.delete(key);
    }
    return [...keys];
  }, [rollenVorgabe, abweichungen]);

  // Live, so ticking "Endgültig freigeben" below unlocks the area select in the same breath. Same
  // rule the edit drawer enforces: an area owner who cannot give the final approval is a receipt
  // routed to somebody who then sees no button.
  const darfFinalFreigeben = neueGehalten.includes(PERMISSIONS.invoicesApproveFinal);
  const eskalationZahl = escalationDays.trim() === "" ? null : Number(escalationDays);
  const eskalationUngueltig =
    eskalationZahl != null &&
    (!Number.isFinite(eskalationZahl) || !Number.isInteger(eskalationZahl) || eskalationZahl <= 0);

  const emailUngueltig = email.trim().length > 0 && !EMAIL_RE.test(email.trim());
  const bereitsVergeben = vorhandeneEmails.includes(email.trim().toLowerCase());

  function reset() {
    setEmail("");
    setName("");
    setRoleName("assistant");
    setCompanyIds([]);
    setAbweichungen({});
    setDeputyUserId(LEER);
    setEscalationDays("");
    setBereich(LEER);
  }

  function anlegen() {
    if (!email.trim()) {
      toast.error(t("team.new.toast.emailPflicht"));
      return;
    }
    // #7: type="email" does nothing outside a form submit, so "abc" reached the server and came
    // back as a raw error. The email IS the login identity, so it is worth getting right here.
    if (!EMAIL_RE.test(email.trim())) {
      toast.error(t("team.new.toast.emailUngueltig"));
      return;
    }
    if (bereitsVergeben) {
      toast.error(t("team.new.toast.emailVergeben"));
      return;
    }
    if (!name.trim()) {
      toast.error(t("team.new.toast.namePflicht"));
      return;
    }
    create.mutate(
      { email: email.trim(), name: name.trim(), roleName, companyIds },
      {
        onSuccess: async (result) => {
          // Exceptions are written AFTER creation, because the id does not exist before it. A
          // failure here is reported on its own rather than folded into the create error: the
          // account exists and works at its role's defaults, which is a different situation from
          // "creating the employee failed" and needs a different next step.
          const eintraege = Object.entries(abweichungen);
          if (eintraege.length > 0) {
            try {
              await Promise.all(
                eintraege.map(([key, value]) =>
                  setRight.mutateAsync({ employeeId: result.employeeId, right: key, value }),
                ),
              );
            } catch (e) {
              toast.error(t("team.new.toast.rechteFehlgeschlagen", { error: fehlerText(e) }));
            }
          }
          // Same reasoning as the deviations above: these need the id, and a failure here leaves a
          // working account that simply has no deputy yet, which is its own situation.
          const tage = escalationDays.trim() === "" ? null : Number(escalationDays);
          const chainChanges = {
            ...(deputyUserId !== LEER ? { deputy_user_id: deputyUserId } : {}),
            ...(tage != null && Number.isFinite(tage) && tage > 0 ? { escalation_days: tage } : {}),
            ...(bereich !== LEER && darfFinalFreigeben
              ? {
                  area: bereich === ALLE_BEREICHE ? null : (bereich as ApprovalArea),
                  covers_all_areas: bereich === ALLE_BEREICHE,
                }
              : {}),
          };
          if (Object.keys(chainChanges).length > 0) {
            try {
              await updateChain.mutateAsync({ userId: result.employeeId, changes: chainChanges });
            } catch (e) {
              toast.error(t("team.new.toast.rechteFehlgeschlagen", { error: fehlerText(e) }));
            }
          }
          setCreatedCredentials({ email: result.email, tempPassword: result.tempPassword });
          reset();
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("team.new.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button className="gap-2">
            <Plus className="size-4" /> {t("team.list.neu.button")}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          /* Same drawer as editing a person, for the same reason: the form carries a profile, a
             company list and a role, and the two flows should not feel like different screens. */
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{t("team.new.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("team.new.desc")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {/* #8: name, email and role are all mandatory and none of them said so — the only
                signal was a toast after pressing Anlegen. */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("team.new.field.name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vorname Nachname"
                aria-required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("team.new.field.email")} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`name@${BRAND.emailDomain}`}
                aria-required
                aria-invalid={emailUngueltig || bereitsVergeben}
              />
              {emailUngueltig && (
                <p className="text-xs text-amber-700">{t("team.new.toast.emailUngueltig")}</p>
              )}
              {bereitsVergeben && (
                <p className="text-xs text-amber-700">{t("team.new.toast.emailVergeben")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("team.new.field.role")} <span className="text-destructive">*</span>
              </Label>
              <Select value={roleName} onValueChange={(v) => setRoleName(v as AssignableRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`team.role.${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("team.new.field.companies")}
              </Label>
              {/* A dropdown, not a column of checkboxes: twelve companies made this dialog scroll
                  inside a scroll, and the list pushed the role and permission fields below the fold.
                  "Alle Gesellschaften" is the FIRST option because it is the default the data model
                  already has -- allowed_company_ids = [] means unrestricted -- and it was previously
                  expressed only by ticking nothing, which reads as "not filled in yet" rather than as
                  a choice. Picking it clears the specific ones; picking a company drops it. */}
              <MultiCombobox
                values={companyIds.length === 0 ? [ALLE_GESELLSCHAFTEN] : companyIds}
                onValuesChange={(next) => {
                  const willAlle = next.includes(ALLE_GESELLSCHAFTEN) && companyIds.length > 0;
                  setCompanyIds(willAlle ? [] : next.filter((v) => v !== ALLE_GESELLSCHAFTEN));
                }}
                options={[
                  {
                    value: ALLE_GESELLSCHAFTEN,
                    label: t("team.new.field.companiesAlle"),
                  },
                  ...companies.map((c) => ({
                    value: c.id,
                    label: `${c.code} · ${c.name}`,
                    keywords: c.name,
                  })),
                ]}
                placeholder={t("team.new.field.companiesWaehlen")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("team.chain.titel")}</Label>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("team.chain.bereich")}</Label>
                  <Select
                    value={bereich}
                    disabled={!darfFinalFreigeben || create.isPending}
                    onValueChange={setBereich}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LEER}>{t("freigabeRegeln.bereich.keiner")}</SelectItem>
                      <SelectItem value="hospitality">
                        {t("freigabeRegeln.bereich.hospitality")}
                      </SelectItem>
                      <SelectItem value="stay_re">{t("freigabeRegeln.bereich.stay_re")}</SelectItem>
                      <SelectItem value={ALLE_BEREICHE}>
                        {t("freigabeRegeln.bereich.alle")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {darfFinalFreigeben
                      ? t("team.chain.bereichHint")
                      : t("team.chain.bereichBrauchtRecht")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("team.chain.vertretung")}
                  </Label>
                  <Select
                    value={deputyUserId}
                    disabled={create.isPending}
                    onValueChange={setDeputyUserId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LEER}>{t("freigabeRegeln.keineVertretung")}</SelectItem>
                      {(employeesQ.data ?? [])
                        .filter((e) => e.is_active && e.role_name !== "super_admin")
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {`${e.name ?? e.email} (${t(`team.role.${e.role_name}`)})`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("team.chain.eskalation")}
                  </Label>
                  <Input
                    value={escalationDays}
                    inputMode="numeric"
                    placeholder={t("freigabeRegeln.feld.eskalationPlaceholder")}
                    disabled={create.isPending}
                    onChange={(e) => setEscalationDays(e.target.value)}
                  />
                  {eskalationUngueltig ? (
                    <p className="text-xs text-destructive">
                      {t("freigabeRegeln.feld.eskalationUngueltig")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("team.chain.eskalationHint")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("team.permissions.titel")}</Label>
              <div className="rounded-lg border border-border p-3">
                {/* Seeded from the chosen role, so this shows what the person will ACTUALLY get,
                    and re-seeds when the role changes. Ticking here records a deviation, written
                    right after the account exists -- see anlegen(). */}
                <PermissionChecklist
                  permissions={neuePermissions}
                  held={neueGehalten}
                  disabled={create.isPending || setRight.isPending}
                  categoryLabel={(c) => t(`team.permissions.kategorie.${c}`, { defaultValue: c })}
                  onToggle={(key, next) =>
                    setAbweichungen((v) => {
                      const vonRolle = rollenVorgabe.includes(key);
                      const rest = { ...v };
                      // A tick that matches the role default is not a deviation -- drop it, so the
                      // person keeps inheriting and a later change to the role still reaches them.
                      if (next === vonRolle) delete rest[key];
                      else rest[key] = next;
                      return rest;
                    })
                  }
                />
              </div>
            </div>
          </div>
          <SheetFooter className="mt-auto gap-2 border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("team.new.cancel")}
            </Button>
            <Button
              onClick={anlegen}
              disabled={
                create.isPending ||
                !name.trim() ||
                !email.trim() ||
                emailUngueltig ||
                eskalationUngueltig ||
                bereitsVergeben
              }
            >
              {create.isPending ? t("team.new.saving") : t("team.new.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {createdCredentials && (
        <TempPasswordDialog
          credentials={createdCredentials}
          onClose={() => setCreatedCredentials(null)}
        />
      )}
    </>
  );
}

// Shown exactly once right after creation (or a reset) -- Supabase never stores or re-displays
// the plaintext password, so this is the only chance to hand it to the employee.
function TempPasswordDialog({
  credentials,
  onClose,
  title,
  desc,
}: {
  credentials: { email: string; tempPassword: string };
  onClose: () => void;
  title?: string;
  desc?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const [copyFailed, setCopyFailed] = useState(false);

  // #6: this used to `void` the promise and flip to a check mark unconditionally, so a rejection —
  // no clipboard permission, or any non-secure context — looked exactly like success, and this is
  // the only place the plaintext password ever exists.
  async function copy() {
    try {
      await navigator.clipboard.writeText(credentials.tempPassword);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <Dialog open>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title ?? t("team.tempPassword.title")}</DialogTitle>
          <DialogDescription>
            {desc ?? t("team.tempPassword.desc", { email: credentials.email })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <code className="flex-1 break-all font-mono text-sm text-foreground">
            {credentials.tempPassword}
          </code>
          <Button
            variant="outline"
            size="icon"
            onClick={copy}
            aria-label={t("team.tempPassword.copy")}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        {copyFailed && (
          <p className="text-xs text-amber-700">{t("team.tempPassword.copyFailed")}</p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("team.tempPassword.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
