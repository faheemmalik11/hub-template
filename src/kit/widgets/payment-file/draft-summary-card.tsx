import { AlertTriangle } from "lucide-react";

import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-base font-semibold text-foreground" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}

export interface DraftSummaryCardProps {
  selectedCount: number;
  totalAvailable: number;
  invoiceTotalText: string;
  discountTotalText: string;
  paymentTotalText: string;
  hasAccounts: boolean;
  onManageAccounts: () => void;
  disabled: boolean;
  pending: boolean;
  onBuild: () => void;
  labels: PaymentFileLabels;
}

export function DraftSummaryCard({
  selectedCount,
  totalAvailable,
  invoiceTotalText,
  discountTotalText,
  paymentTotalText,
  hasAccounts,
  onManageAccounts,
  disabled,
  pending,
  onBuild,
  labels,
}: DraftSummaryCardProps) {
  const button = (
    <Button
      className="w-full"
      data-tour="payment-build-button"
      disabled={disabled}
      onClick={onBuild}
    >
      {pending ? labels.draft.building : labels.draft.build}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.draft.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SummaryRow label={labels.draft.selected} value={String(selectedCount)} />
        <SummaryRow label={labels.draft.invoiceTotal} value={invoiceTotalText} />
        <SummaryRow label={labels.draft.discountTotal} value={discountTotalText} />
        <div className="border-t border-border pt-3">
          <SummaryRow label={labels.draft.paymentTotal} value={paymentTotalText} strong />
        </div>
        {totalAvailable > selectedCount && (
          <p className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {labels.draft.unselectedHint(totalAvailable - selectedCount)}
          </p>
        )}
        {!hasAccounts && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            {labels.payFrom.missing}{" "}
            <button type="button" className="underline" onClick={onManageAccounts}>
              {labels.payFrom.manage}
            </button>
          </p>
        )}
        {selectedCount === 0 && hasAccounts && (
          <p className="text-xs text-muted-foreground">{labels.draft.selectHint}</p>
        )}
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="block">
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!hasAccounts ? labels.payFrom.missing : labels.draft.buildDisabledNoInvoices}
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </CardContent>
    </Card>
  );
}
