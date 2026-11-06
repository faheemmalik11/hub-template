import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { LabelledSelect } from "../../ui/labelled-select";
import type { PaymentAccountRow, PaymentFileAdapter } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";
import { usePaymentAccountForm } from "./use-payment-account-form";

export interface PaymentAccountFormDialogProps {
  adapter: PaymentFileAdapter;
  account: PaymentAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PaymentFileLabels;
}

export function PaymentAccountFormDialog({
  adapter,
  account,
  open,
  onOpenChange,
  labels,
}: PaymentAccountFormDialogProps) {
  const isEditing = !!account;
  const form = usePaymentAccountForm(open, account, labels.accountForm);

  function handleSave() {
    form.trySave(() => {
      const task = isEditing
        ? adapter.updateAccount(account!.id, form.values)
        : adapter.createAccount(form.values);
      void task.then(() => onOpenChange(false));
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEditing ? labels.accountForm.titleEdit : labels.accountForm.titleAdd}
          </DialogTitle>
        </DialogHeader>
        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="payment-account-label">{labels.accountForm.label}</Label>
            <Input
              id="payment-account-label"
              value={form.values.label}
              onChange={(e) => form.setValues({ ...form.values, label: e.target.value })}
              aria-invalid={form.attemptedSave && !!form.errors.label}
            />
            {form.attemptedSave && form.errors.label && (
              <p className="text-xs text-destructive">{form.errors.label}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-account-payer-name">{labels.accountForm.payerName}</Label>
            <Input
              id="payment-account-payer-name"
              value={form.values.payerName}
              onChange={(e) => form.setValues({ ...form.values, payerName: e.target.value })}
              aria-invalid={form.attemptedSave && !!form.errors.payerName}
            />
            {form.attemptedSave && form.errors.payerName && (
              <p className="text-xs text-destructive">{form.errors.payerName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-account-iban">{labels.accountForm.payerIban}</Label>
            <Input
              id="payment-account-iban"
              value={form.values.payerIban}
              onChange={(e) => form.setValues({ ...form.values, payerIban: e.target.value })}
              aria-invalid={form.attemptedSave && !!form.errors.payerIban}
            />
            {form.attemptedSave && form.errors.payerIban && (
              <p className="text-xs text-destructive">{form.errors.payerIban}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-account-bic">{labels.accountForm.payerBic}</Label>
            <Input
              id="payment-account-bic"
              value={form.values.payerBic}
              onChange={(e) => form.setValues({ ...form.values, payerBic: e.target.value })}
              aria-invalid={form.attemptedSave && !!form.errors.payerBic}
            />
            {form.attemptedSave && form.errors.payerBic && (
              <p className="text-xs text-destructive">{form.errors.payerBic}</p>
            )}
          </div>
          <LabelledSelect
            label={labels.accountForm.executionDateRule}
            value={form.values.executionDateRule}
            onValueChange={(value) => form.setValues({ ...form.values, executionDateRule: value })}
            options={[
              {
                value: "as_soon_as_possible",
                label: labels.accountForm.executionDateAsSoonAsPossible,
              },
              { value: "on_due_date", label: labels.accountForm.executionDateOnDueDate },
            ]}
          />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.accountForm.cancel}
          </Button>
          <Button disabled={!form.isDirty || adapter.busy.savingAccount} onClick={handleSave}>
            {labels.accountForm.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
