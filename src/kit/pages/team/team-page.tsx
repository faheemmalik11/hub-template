import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import type { TeamAdapter, TeamCompany, TeamEmployee } from "../../adapters/team";
import { englishTeamPageLabels, type TeamPageLabels } from "./labels";
import { EditEmployeeSheet } from "./employee-editor";
import { NewEmployeeSheet } from "./new-employee";
import { ResetPasswordDialog, ToggleActiveDialog } from "./account-dialogs";
import { RolesPermissionsTab } from "./roles-tab";

// One hue, four weights: rank separates roles, so a color per role would invent categories.
const ROLE_BADGE_STYLE: Record<string, string> = {
  super_admin: "border-transparent bg-brand-dark text-white",
  admin: "border-transparent bg-brand-tint text-brand-dark",
  supervisor: "border-transparent bg-muted text-foreground",
  assistant: "border-border bg-card text-muted-foreground",
};

export interface TeamPageProps {
  adapter: TeamAdapter;
  labels?: TeamPageLabels;
}

export function TeamPage({ adapter, labels = englishTeamPageLabels }: TeamPageProps) {
  const [activeTab, setActiveTab] = useState("people");
  const employeesQuery = adapter.useEmployees();
  const companiesQuery = adapter.useCompanies();
  const companies = companiesQuery.data ?? [];
  const [searchInput, setSearchInput] = useState("");
  const [inactiveOnly, setInactiveOnly] = useState(false);

  // Owner account pinned to the top: the one row with different rules must be easy to find.
  const employees = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    const rows = (employeesQuery.data ?? []).filter((employee) => {
      if (inactiveOnly && employee.isActive) return false;
      if (!term) return true;
      return [employee.name ?? "", employee.email, labels.roleLabel(employee.roleName)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    return [...rows].sort((a, b) => {
      const aOwner = a.roleName === "super_admin" ? 0 : 1;
      const bOwner = b.roleName === "super_admin" ? 0 : 1;
      return aOwner - bOwner;
    });
  }, [employeesQuery.data, searchInput, inactiveOnly, labels]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <NewEmployeeSheet
          companies={companies}
          existingEmails={(employeesQuery.data ?? []).map((e) => e.email.toLowerCase())}
          adapter={adapter}
          labels={labels}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="flex h-auto w-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="people">{labels.peopleTab}</TabsTrigger>
            <TabsTrigger value="roles">{labels.rolesTab}</TabsTrigger>
          </TabsList>
          {activeTab === "people" && (
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-[260px] sm:flex-none">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={labels.searchPlaceholder}
                  className="h-9 pl-9"
                />
              </div>
              <Button
                variant={inactiveOnly ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => setInactiveOnly((value) => !value)}
              >
                {labels.inactiveOnly}
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="people" className="mt-3">
          {employeesQuery.isError ? (
            <ErrorState error={employeesQuery.error} onRetry={employeesQuery.refetch} />
          ) : employeesQuery.isLoading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
                <Table className="[&_td]:py-1.5 [&_th]:h-9">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>{labels.columns.name}</TableHead>
                      <TableHead>{labels.columns.email}</TableHead>
                      <TableHead>{labels.columns.role}</TableHead>
                      <TableHead>{labels.columns.companies}</TableHead>
                      <TableHead className="w-[130px] text-center">
                        {labels.columns.permissions}
                      </TableHead>
                      <TableHead className="w-[92px] text-center">
                        {labels.columns.active}
                      </TableHead>
                      <TableHead className="w-[64px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <EmployeeRow
                        key={employee.id}
                        employee={employee}
                        companies={companies}
                        adapter={adapter}
                        labels={labels}
                      />
                    ))}
                    {employees.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                          {labels.empty}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-3 space-y-3 sm:hidden">
                {employees.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    companies={companies}
                    adapter={adapter}
                    labels={labels}
                  />
                ))}
                {employees.length === 0 && (
                  <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                    {labels.empty}
                  </p>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="roles" className="mt-3">
          <RolesPermissionsTab adapter={adapter} labels={labels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoleBadge({ roleName, labels }: { roleName: string; labels: TeamPageLabels }) {
  return (
    <Badge variant="outline" className={ROLE_BADGE_STYLE[roleName] ?? ROLE_BADGE_STYLE.assistant}>
      {labels.roleLabel(roleName)}
    </Badge>
  );
}

function ActiveBadge({ employee, labels }: { employee: TeamEmployee; labels: TeamPageLabels }) {
  return employee.isActive ? (
    <Badge className="border-transparent bg-success-soft text-success">{labels.active}</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      {labels.inactive}
    </Badge>
  );
}

function CompanyBadges({
  employee,
  companies,
  labels,
}: {
  employee: TeamEmployee;
  companies: TeamCompany[];
  labels: TeamPageLabels;
}) {
  if (employee.allowedCompanyIds.length === 0) {
    return <Badge variant="default">{labels.allCompanies}</Badge>;
  }
  const codes = companies
    .filter((company) => employee.allowedCompanyIds.includes(company.id))
    .map((company) => company.code);
  const visibleCodes = codes.slice(0, 4);
  const hiddenCount = codes.length - visibleCodes.length;
  return (
    <>
      {visibleCodes.map((code) => (
        <Badge key={code} variant="secondary">
          {code}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge variant="outline" title={codes.join(", ")}>
          {labels.moreCompanies(hiddenCount)}
        </Badge>
      )}
    </>
  );
}

function PermissionCount({
  employee,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const catalogueQuery = adapter.usePermissionCatalogue();
  const total = catalogueQuery.data?.length ?? 0;
  if (!total) return <>—</>;
  const held = employee.roleName === "super_admin" ? total : employee.permissions.length;
  return <>{labels.permissionCount(held, total)}</>;
}

function EmployeeRow({
  employee,
  companies,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  companies: TeamCompany[];
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  return (
    <TableRow
      className={cn(
        !employee.isActive && "opacity-60",
        employee.roleName === "super_admin" && "bg-brand-wash/60 hover:bg-brand-wash",
      )}
    >
      <TableCell className="font-medium text-foreground">
        <span className="block">{employee.name ?? "—"}</span>
        {employee.mustChangePassword && (
          <span className="block text-xs font-normal whitespace-nowrap text-muted-foreground">
            {labels.neverSignedIn}
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{employee.email}</TableCell>
      <TableCell>
        <RoleBadge roleName={employee.roleName} labels={labels} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <CompanyBadges employee={employee} companies={companies} labels={labels} />
        </div>
      </TableCell>
      <TableCell className="text-center text-sm text-muted-foreground">
        <PermissionCount employee={employee} adapter={adapter} labels={labels} />
      </TableCell>
      <TableCell className="text-center">
        <ActiveBadge employee={employee} labels={labels} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <EditEmployeeSheet
            employee={employee}
            companies={companies}
            adapter={adapter}
            labels={labels}
          />
          <ResetPasswordDialog employee={employee} adapter={adapter} labels={labels} />
          <ToggleActiveDialog employee={employee} adapter={adapter} labels={labels} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function EmployeeCard({
  employee,
  companies,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  companies: TeamCompany[];
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        !employee.isActive && "opacity-60",
        employee.roleName === "super_admin" && "border-brand-soft bg-brand-wash/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{employee.name ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">{employee.email}</div>
        </div>
        <div className="shrink-0 text-right">
          <ActiveBadge employee={employee} labels={labels} />
          {employee.mustChangePassword && (
            <div className="mt-1 text-[10px] text-muted-foreground">{labels.neverSignedIn}</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <RoleBadge roleName={employee.roleName} labels={labels} />
        <CompanyBadges employee={employee} companies={companies} labels={labels} />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{labels.columns.permissions}</span>
          <span className="text-xs text-muted-foreground">
            <PermissionCount employee={employee} adapter={adapter} labels={labels} />
          </span>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-1 border-t border-border pt-2">
        <EditEmployeeSheet
          employee={employee}
          companies={companies}
          adapter={adapter}
          labels={labels}
        />
        <ResetPasswordDialog employee={employee} adapter={adapter} labels={labels} />
        <ToggleActiveDialog employee={employee} adapter={adapter} labels={labels} />
      </div>
    </div>
  );
}
