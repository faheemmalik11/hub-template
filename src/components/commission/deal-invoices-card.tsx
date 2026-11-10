import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OutgoingStatusBadge } from "@/components/documents/badges";
import { useOutgoingInvoices, useSetOutgoingInvoiceNumber } from "@/data";
import type { Deal } from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function InvoiceNumberField({ invoiceId, value }: { invoiceId: string; value: string | null }) {
  const { t } = useTranslation();
  const setNumber = useSetOutgoingInvoiceNumber(invoiceId);
  const [draft, setDraft] = useState(value ?? "");

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== (value ?? "");

  const save = () => {
    if (!canSave) return;
    setNumber.mutate(trimmed, {
      onError: (error) =>
        toast.error(t("commissionDeals.invoices.numberFailed"), { description: errorText(error) }),
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && save()}
        placeholder={t("commissionDeals.invoices.numberPlaceholder")}
        aria-label={t("commissionDeals.invoices.number")}
        className="h-8 w-36"
        disabled={setNumber.isPending}
      />
      {canSave && (
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          disabled={setNumber.isPending}
          onClick={save}
          aria-label={t("commissionDeals.invoices.saveNumber")}
        >
          <Check className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function DealInvoicesCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const invoicesQ = useOutgoingInvoices({ dealId: deal.id });

  if (invoicesQ.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32" />
      </section>
    );
  }

  const invoices = invoicesQ.data ?? [];
  if (invoices.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.invoices.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("commissionDeals.invoices.hint")}</p>
      <div className="mt-3 space-y-2">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {invoice.customers?.name ?? t("commissionDeals.invoices.unknownCustomer")}
              </div>
              <div className="mt-1">
                <InvoiceNumberField invoiceId={invoice.id} value={invoice.invoice_number} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {formatEUR(invoice.amount_gross)}
              </div>
              <OutgoingStatusBadge status={invoice.status} dueDate={invoice.due_date} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
