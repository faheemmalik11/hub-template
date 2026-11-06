import { Skeleton } from "../../ui/skeleton";
import { LabelledSelect } from "../../ui/labelled-select";
import type { PaymentAccountRow } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

export interface AccountPickerProps {
  accounts: PaymentAccountRow[];
  loading: boolean;
  accountId: string | null;
  onAccountChange: (id: string) => void;
  onManageAccounts: () => void;
  labels: PaymentFileLabels;
}

export function AccountPicker({
  accounts,
  loading,
  accountId,
  onAccountChange,
  onManageAccounts,
  labels,
}: AccountPickerProps) {
  if (loading) return <Skeleton className="mb-4 h-10 w-full max-w-sm" />;

  if (accounts.length === 0) {
    return (
      <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        {labels.payFrom.missing}{" "}
        <button type="button" className="underline" onClick={onManageAccounts}>
          {labels.payFrom.manage}
        </button>
      </div>
    );
  }

  if (accounts.length === 1) {
    const account = accounts[0];
    return (
      <div className="mb-4 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{labels.payFrom.label}</p>
        <p className="text-sm text-foreground">
          {account.label}{" "}
          <span className="font-mono text-muted-foreground">{account.payerIban}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 max-w-sm space-y-1.5">
      <LabelledSelect
        label={labels.payFrom.label}
        value={accountId ?? ""}
        onValueChange={onAccountChange}
        options={accounts.map((account) => ({
          value: account.id,
          label: `${account.label} · ${account.payerIban}`,
        }))}
        labelPosition="start"
      />
      <button type="button" className="text-xs text-primary underline" onClick={onManageAccounts}>
        {labels.payFrom.manage}
      </button>
    </div>
  );
}
