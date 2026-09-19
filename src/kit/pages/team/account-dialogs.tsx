import { useState } from "react";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

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
} from "../../ui/alert-dialog";
import { IconAction } from "../../ui/icon-action";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { TeamAdapter, TeamEmployee } from "../../adapters/team";
import type { TeamPageLabels } from "./labels";
import { TempPasswordDialog } from "./temp-password-dialog";

export function ToggleActiveDialog({
  employee,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const isMyOwnAccount =
    !!adapter.currentUserEmail &&
    adapter.currentUserEmail.toLowerCase() === employee.email.toLowerCase();
  const isOwnerAccount = employee.roleName === "super_admin";
  const toggleLabels = labels.activeToggle;

  async function confirmToggle() {
    setIsSaving(true);
    try {
      await adapter.setEmployeeActive({ employeeId: employee.id, isActive: !employee.isActive });
      toast.success(employee.isActive ? toggleLabels.deactivated : toggleLabels.reactivated);
    } catch (error) {
      toast.error(toggleLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <IconAction
          className={
            employee.isActive
              ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
          }
          label={employee.isActive ? toggleLabels.deactivate : toggleLabels.reactivate}
          disabled={isSaving || (employee.isActive && (isOwnerAccount || isMyOwnAccount))}
          title={isOwnerAccount ? labels.edit.superAdminCannotBeDeactivated : undefined}
        >
          {employee.isActive ? (
            <ShieldOff className="size-4" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
        </IconAction>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {employee.isActive ? toggleLabels.deactivateTitle : toggleLabels.reactivateTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {employee.isActive
              ? toggleLabels.deactivateDescription(employee.email)
              : toggleLabels.reactivateDescription(employee.email)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{toggleLabels.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmToggle}
            className={
              employee.isActive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {employee.isActive ? toggleLabels.confirmDeactivate : toggleLabels.confirmReactivate}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ResetPasswordDialog({
  employee,
  adapter,
  labels,
}: {
  employee: TeamEmployee;
  adapter: TeamAdapter;
  labels: TeamPageLabels;
}) {
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const resetLabels = labels.resetPassword;

  async function confirmReset() {
    try {
      const result = await adapter.resetPassword({ employeeId: employee.id });
      setCredentials(result);
    } catch (error) {
      toast.error(resetLabels.failed(readableErrorMessage(error, "")));
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <IconAction
            label={resetLabels.open}
            disabled={!employee.isActive || employee.roleName === "super_admin"}
          >
            <KeyRound className="size-4" />
          </IconAction>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resetLabels.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {resetLabels.description(employee.email)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{resetLabels.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>{resetLabels.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {credentials && (
        <TempPasswordDialog
          credentials={credentials}
          onClose={() => setCredentials(null)}
          labels={labels}
          title={resetLabels.resultTitle}
          description={resetLabels.resultDescription(credentials.email)}
        />
      )}
    </>
  );
}
