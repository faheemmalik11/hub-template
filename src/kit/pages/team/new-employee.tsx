import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
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
import type { TeamAdapter, TeamCompany } from "../../adapters/team";
import type { TeamPageLabels } from "./labels";
import { CompanyPickList } from "./employee-editor";
import { TempPasswordDialog } from "./temp-password-dialog";

// Catches "abc" and a missing @, without trying to police the full RFC.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function NewEmployeeSheet({
  companies,
  existingEmails,
  adapter,
  labels,
}: {
  companies: TeamCompany[];
  existingEmails: string[];
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const newLabels = labels.newEmployee;
  const catalogueQuery = adapter.usePermissionCatalogue();
  const rolesQuery = adapter.useRoles();
  const rolePermissionsQuery = adapter.useRolePermissions();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleName, setRoleName] = useState(
    adapter.assignableRoles[adapter.assignableRoles.length - 1] ?? "",
  );
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  // Deviations from what the chosen role grants; written right after the account exists.
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  const roleDefaultKeys = useMemo(() => {
    const role = (rolesQuery.data ?? []).find((r) => r.name === roleName);
    return role ? ((rolePermissionsQuery.data ?? {})[role.id] ?? []) : [];
  }, [rolesQuery.data, rolePermissionsQuery.data, roleName]);

  const effectiveHeldKeys = useMemo(() => {
    const keys = new Set(roleDefaultKeys);
    for (const [key, granted] of Object.entries(permissionOverrides)) {
      if (granted) keys.add(key);
      else keys.delete(key);
    }
    return [...keys];
  }, [roleDefaultKeys, permissionOverrides]);

  const emailInvalid = email.trim().length > 0 && !EMAIL_PATTERN.test(email.trim());
  const emailTaken = existingEmails.includes(email.trim().toLowerCase());

  function reset() {
    setEmail("");
    setName("");
    setRoleName(adapter.assignableRoles[adapter.assignableRoles.length - 1] ?? "");
    setCompanyIds([]);
    setPermissionOverrides({});
  }

  async function create() {
    if (!email.trim()) return toast.error(newLabels.emailRequired);
    if (!EMAIL_PATTERN.test(email.trim())) return toast.error(newLabels.emailInvalid);
    if (emailTaken) return toast.error(newLabels.emailTaken);
    if (!name.trim()) return toast.error(newLabels.nameRequired);

    setIsCreating(true);
    try {
      const result = await adapter.createEmployee({
        email: email.trim(),
        name: name.trim(),
        roleName,
        companyIds,
      });
      // Overrides need the new id, so they are written right after creation.
      const overrides = Object.entries(permissionOverrides);
      if (overrides.length > 0) {
        try {
          await Promise.all(
            overrides.map(([key, value]) =>
              adapter.setEmployeeRight({ employeeId: result.employeeId, right: key, value }),
            ),
          );
        } catch (error) {
          toast.error(newLabels.rightsFailed(readableErrorMessage(error, "")));
        }
      }
      setCreatedCredentials({ email: result.email, tempPassword: result.tempPassword });
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(newLabels.createFailed(readableErrorMessage(error, "")));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button className="gap-2">
            <Plus className="size-4" /> {newLabels.button}
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{newLabels.title}</SheetTitle>
            <SheetDescription className="sr-only">{newLabels.title}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {newLabels.name} <span className="text-destructive">*</span>
              </Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} aria-required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {newLabels.email} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={`name@${adapter.emailDomain}`}
                aria-required
                aria-invalid={emailInvalid || emailTaken}
              />
              {emailInvalid && <p className="text-xs text-warning">{newLabels.emailInvalid}</p>}
              {emailTaken && <p className="text-xs text-warning">{newLabels.emailTaken}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {newLabels.role} <span className="text-destructive">*</span>
              </Label>
              <Select value={roleName} onValueChange={setRoleName}>
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{newLabels.companies}</Label>
              <CompanyPickList
                companies={companies}
                selectedIds={companyIds}
                onChange={setCompanyIds}
                maxHeightClass="max-h-48"
              />
              <p className="text-xs text-muted-foreground">
                {companyIds.length === 0 ? newLabels.noCompaniesHint : newLabels.someCompaniesHint}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{labels.permissionsTitle}</Label>
              <div className="rounded-lg border border-border p-3">
                <PermissionChecklist
                  permissions={catalogueQuery.data ?? []}
                  held={effectiveHeldKeys}
                  disabled={isCreating}
                  categoryLabel={labels.categoryLabel}
                  onToggle={(key, next) =>
                    setPermissionOverrides((current) => {
                      const fromRole = roleDefaultKeys.includes(key);
                      const rest = { ...current };
                      // A tick matching the role default is not a deviation, so drop it.
                      if (next === fromRole) delete rest[key];
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
              {newLabels.cancel}
            </Button>
            <Button
              onClick={create}
              disabled={isCreating || !name.trim() || !email.trim() || emailInvalid || emailTaken}
            >
              {isCreating ? newLabels.creating : newLabels.create}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {createdCredentials && (
        <TempPasswordDialog
          credentials={createdCredentials}
          onClose={() => setCreatedCredentials(null)}
          labels={labels}
        />
      )}
    </>
  );
}
