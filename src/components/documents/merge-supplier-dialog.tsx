import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Combobox } from "@/components/ui/combobox";
import { useMergeSuppliers } from "@/data";
import { useTranslation } from "@/lib/i18n";
import type { Supplier } from "@/lib/data/types";
import { errorText } from "@/lib/data/format";

// Briefing Screen 12: "merge duplicate supplier records" — always the merged-AWAY supplier that
// this dialog is opened for; the target picked here is the one that survives. Confirmed via a
// nested AlertDialog per this project's standing rule that every destructive action gets a
// confirmation step.
export function MergeSupplierDialog({
  supplier,
  suppliers,
  defaultTargetId,
  trigger,
  onMerged,
  open: openProp,
  onOpenChange,
}: {
  supplier: Supplier;
  suppliers: Supplier[]; // merge candidates; `supplier` itself is filtered out below
  defaultTargetId?: string;
  /** Omitted when the dialog is opened from somewhere the trigger cannot live, e.g. a menu item. */
  trigger?: React.ReactNode;
  onMerged?: () => void;
  /**
   * Controlled open state. Needed by callers that open this from a dropdown menu: selecting a menu
   * item closes the menu, which unmounts a trigger rendered inside it before it can do anything.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const merge = useMergeSuppliers();
  const [openState, setOpenState] = useState(false);
  const checked = openProp !== undefined;
  const open = checked ? openProp : openState;
  const setOpen = (o: boolean) => {
    if (!checked) setOpenState(o);
    onOpenChange?.(o);
  };
  const [targetId, setTargetId] = useState(defaultTargetId ?? "");

  const options = useMemo(
    () =>
      suppliers
        .filter((s) => s.id !== supplier.id)
        .map((s) => ({ value: s.id, label: s.name, keywords: s.vat_id ?? undefined })),
    [suppliers, supplier.id],
  );
  const target = suppliers.find((s) => s.id === targetId) ?? null;

  function run() {
    if (!target) return;
    merge.mutate(
      { keepId: target.id, mergeId: supplier.id },
      {
        onSuccess: () => {
          toast.success(
            t("suppliers.merge.toast.erfolgreich", { name: supplier.name, target: target.name }),
          );
          setOpen(false);
          setTargetId("");
          onMerged?.();
        },
        onError: (e) =>
          toast.error(
            t("suppliers.merge.toast.fehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTargetId(defaultTargetId ?? "");
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("suppliers.merge.title", { name: supplier.name })}</DialogTitle>
          <DialogDescription>{t("suppliers.merge.desc")}</DialogDescription>
        </DialogHeader>
        <Combobox
          value={targetId}
          onValueChange={setTargetId}
          options={options}
          placeholder={t("suppliers.merge.placeholder")}
          searchPlaceholder={t("suppliers.merge.search")}
          emptyText={t("suppliers.merge.empty")}
        />
        <DialogFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!target} variant="destructive">
                {t("suppliers.merge.action")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("suppliers.merge.confirm.title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {target
                    ? t("suppliers.merge.confirm.desc", {
                        fromDate: supplier.name,
                        target: target.name,
                      })
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("suppliers.merge.confirm.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={run}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("suppliers.merge.confirm.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
