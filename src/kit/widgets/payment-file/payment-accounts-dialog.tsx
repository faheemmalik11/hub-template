import { useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

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
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { IconAction } from "../../ui/icon-action";
import { Skeleton } from "../../ui/skeleton";
import type { PaymentAccountRow, PaymentFileAdapter } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";
import { PaymentAccountFormDialog } from "./payment-account-form-dialog";

export interface PaymentAccountsDialogProps {
  adapter: PaymentFileAdapter;
  accounts: PaymentAccountRow[];
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PaymentFileLabels;
}

export function PaymentAccountsDialog({
  adapter,
  accounts,
  loading,
  open,
  onOpenChange,
  labels,
}: PaymentAccountsDialogProps) {
  const [formAccount, setFormAccount] = useState<PaymentAccountRow | "new" | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{labels.accounts.title}</DialogTitle>
          </DialogHeader>
          <div className="-mx-6 flex-1 space-y-3 overflow-y-auto px-6 py-1">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.accounts.empty}</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{account.label}</span>
                      {account.isDefault && (
                        <Badge variant="outline">{labels.accounts.default}</Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{account.payerName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{account.payerIban}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconAction
                      label={labels.accounts.setDefault}
                      disabled={account.isDefault}
                      onClick={() => void adapter.setDefaultAccount(account.id)}
                    >
                      <Star className={account.isDefault ? "size-4 fill-current" : "size-4"} />
                    </IconAction>
                    <IconAction
                      label={labels.accounts.edit}
                      onClick={() => setFormAccount(account)}
                    >
                      <Pencil className="size-4" />
                    </IconAction>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <IconAction label={labels.accounts.delete}>
                          <Trash2 className="size-4" />
                        </IconAction>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{labels.accounts.deleteConfirmTitle}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {labels.accounts.deleteConfirmBody}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {labels.accounts.deleteConfirmCancel}
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={() => void adapter.deleteAccount(account.id)}>
                            {labels.accounts.deleteConfirmConfirm}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="shrink-0 sm:justify-between">
            <Button variant="outline" onClick={() => setFormAccount("new")}>
              <Plus className="size-4" />
              {labels.accounts.add}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {labels.accounts.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PaymentAccountFormDialog
        adapter={adapter}
        account={formAccount === "new" ? null : formAccount}
        open={formAccount !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setFormAccount(null);
        }}
        labels={labels}
      />
    </>
  );
}
