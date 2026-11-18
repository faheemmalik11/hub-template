import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import type { UnsavedChangesGuardState } from "@/lib/use-unsaved-changes-guard";

export function UnsavedChangesGuard({ guard }: { guard: UnsavedChangesGuardState }) {
  const { t } = useTranslation();
  const { blocker } = guard;
  const keepEditing = () => {
    if (blocker.status === "blocked") blocker.reset();
  };
  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) keepEditing();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.unsavedChanges.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("common.unsavedChanges.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={keepEditing}>
            {t("common.unsavedChanges.continueEditing")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => blocker.status === "blocked" && blocker.proceed()}
            className={buttonVariants({ variant: "destructive" })}
          >
            {t("common.unsavedChanges.discard")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
