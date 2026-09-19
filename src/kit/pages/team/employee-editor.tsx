import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { IconAction } from "../../ui/icon-action";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../ui/sheet";
import { PermissionChecklist } from "../../components/access/permission-checklist";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { TeamAdapter, TeamCompany, TeamEmployee } from "../../adapters/team";
import type { TeamPageLabels } from "./labels";

export function CompanyPickList({
  companies,
  selectedIds,
  onChange,
  maxHeightClass = "max-h-72",
}: {
  companies: TeamCompany[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  maxHeightClass?: string;
}) {
  return (
    <div className={`grid ${maxHeightClass} gap-2 overflow-y-auto`}>
      {companies.map((company) => {
        const checked = selectedIds.includes(company.id);
        return (
          <label
            key={company.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(next) =>
                onChange(
                  next
                    ? [...selectedIds, company.id]
                    : selectedIds.filter((id) => id !== company.id),
                )
              }
            />
            <span className="font-medium text-foreground">{company.code}</span>
            <span className="text-muted-foreground">{company.name}</span>
          </label>
        );
      })}
    </div>
  );
}

export function EmployeePermissionsSection({
  employee,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const catalogueQuery = adapter.usePermissionCatalogue();
  const [isSaving, setIsSaving] = useState(false);
  const permissions = catalogueQuery.data ?? [];
  // The owner account holds everything, so its boxes would only be ones nobody may untick.
  const locked = employee.roleName === "super_admin";

  if (catalogueQuery.isLoading || permissions.length === 0) return null;

  async function togglePermission(key: string, value: boolean) {
    setIsSaving(true);
    try {
      await adapter.setEmployeeRight({ employeeId: employee.id, right: key, value });
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{labels.permissionsTitle}</Label>
      <div className="rounded-lg border border-border p-3">
        <PermissionChecklist
          permissions={permissions}
          held={locked ? permissions.map((p) => p.key) : employee.permissions}
          disabled={locked || isSaving}
          readOnlyNote={locked ? labels.impliedBySuperAdmin : undefined}
          categoryLabel={labels.categoryLabel}
          onToggle={togglePermission}
        />
      </div>
    </div>
  );
}

export function EditEmployeeSheet({
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
  const editLabels = labels.edit;
  const isMyOwnAccount =
    !!adapter.currentUserEmail &&
    adapter.currentUserEmail.toLowerCase() === employee.email.toLowerCase();
  const isOwnerAccount = employee.roleName === "super_admin";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee.name ?? "");
  const [email, setEmail] = useState(employee.email);
  const [roleName, setRoleName] = useState(
    isOwnerAccount ? adapter.assignableRoles[0] : employee.roleName,
  );
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>(
    employee.allowedCompanyIds,
  );
  const [isSaving, setIsSaving] = useState(false);

  // The owner role is not assignable, and editing your own row must not change your own role.
  const roleLocked = isOwnerAccount || isMyOwnAccount;
  const roleChanged = !roleLocked && roleName !== employee.roleName;
  const profileChanged = name.trim() !== (employee.name ?? "") || email.trim() !== employee.email;
  const accessChanged =
    selectedCompanyIds.length !== employee.allowedCompanyIds.length ||
    selectedCompanyIds.some((id) => !employee.allowedCompanyIds.includes(id));
  // An empty selection means unrestricted, so removing the last company WIDENS access.
  const accessWidens =
    accessChanged && selectedCompanyIds.length === 0 && employee.allowedCompanyIds.length > 0;
  const invalid = !name.trim() || !email.trim();

  async function save() {
    setIsSaving(true);
    try {
      if (isOwnerAccount) {
        // Name only: the owner's email is the login identity and its role is fixed.
        if (name.trim() !== (employee.name ?? "")) {
          await adapter.updateEmployeeProfile({
            employeeId: employee.id,
            name: name.trim(),
            email: employee.email,
          });
          toast.success(editLabels.saved);
        }
        setOpen(false);
        return;
      }
      // Three writes with no transaction: skip the unchanged ones and name the step that failed.
      let failedStep = "";
      try {
        if (profileChanged) {
          failedStep = editLabels.stepProfile;
          await adapter.updateEmployeeProfile({
            employeeId: employee.id,
            name: name.trim(),
            email: email.trim(),
          });
        }
        if (roleChanged) {
          failedStep = editLabels.stepRole;
          await adapter.updateEmployeeRole({ employeeId: employee.id, roleName });
        }
        if (accessChanged) {
          failedStep = editLabels.stepAccess;
          await adapter.setCompanyAccess({
            employeeId: employee.id,
            companyIds: selectedCompanyIds,
          });
        }
      } catch (error) {
        toast.error(editLabels.partlyFailed(failedStep, readableErrorMessage(error, "")));
        return;
      }
      toast.success(editLabels.saved);
      setOpen(false);
    } catch (error) {
      toast.error(editLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setName(employee.name ?? "");
          setEmail(employee.email);
          setRoleName(isOwnerAccount ? adapter.assignableRoles[0] : employee.roleName);
          setSelectedCompanyIds(employee.allowedCompanyIds);
        }
      }}
    >
      <SheetTrigger asChild>
        <IconAction label={editLabels.open}>
          <Pencil className="size-4" />
        </IconAction>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{editLabels.title}</SheetTitle>
          <SheetDescription className="sr-only">{editLabels.title}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{labels.newEmployee.name}</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{labels.newEmployee.email}</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isOwnerAccount}
            />
            {!isOwnerAccount && email.trim() !== employee.email && (
              <p className="text-xs text-muted-foreground">{editLabels.emailChangeHint}</p>
            )}
          </div>
          {isMyOwnAccount && !isOwnerAccount && (
            <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground">
              {editLabels.editingMyselfNote}
            </p>
          )}
          {isOwnerAccount ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{labels.newEmployee.role}</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {labels.roleLabel("super_admin")}
              </div>
              <p className="text-xs text-muted-foreground">{editLabels.superAdminRoleHint}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{labels.newEmployee.role}</Label>
                <Select value={roleName} disabled={isMyOwnAccount} onValueChange={setRoleName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {adapter.assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {labels.roleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {labels.newEmployee.companies}
                </Label>
                <CompanyPickList
                  companies={companies}
                  selectedIds={selectedCompanyIds}
                  onChange={setSelectedCompanyIds}
                />
                {selectedCompanyIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {labels.newEmployee.noCompaniesHint}
                  </p>
                )}
              </div>

              <EmployeePermissionsSection employee={employee} adapter={adapter} labels={labels} />
            </>
          )}
          {roleChanged && (
            <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground">
              {editLabels.roleChangeWarning(
                labels.roleLabel(employee.roleName),
                labels.roleLabel(roleName),
              )}
            </p>
          )}
          {accessWidens && (
            <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground">
              {editLabels.accessWidensWarning}
            </p>
          )}
        </div>
        <SheetFooter className="mt-auto gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {editLabels.cancel}
          </Button>
          <Button onClick={save} disabled={isSaving || invalid}>
            {isSaving ? editLabels.saving : editLabels.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
