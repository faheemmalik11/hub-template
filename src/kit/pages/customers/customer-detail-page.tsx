import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Skeleton } from "../../ui/skeleton";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, readableErrorMessage } from "../../components/feedback/query-states";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { CustomersAdapter } from "../../adapters/customers";
import { CopyButton } from "./copy-button";
import { EditCustomerDialog } from "./edit-customer-dialog";
import { countsAsRevenue, InvoiceStatusBadge } from "./invoice-status-badge";
import { englishCustomersLabels, type CustomersLabels } from "./labels";

export interface CustomerDetailPageProps {
  adapter: CustomersAdapter;
  customerId: string;
  labels?: CustomersLabels;
  formatters?: Formatters;
}

export function CustomerDetailPage({
  adapter,
  customerId,
  labels = englishCustomersLabels,
  formatters = englishFormatters,
}: CustomerDetailPageProps) {
  const customerQuery = adapter.useCustomer(customerId);
  const invoicesQuery = adapter.useCustomerInvoices(customerId);
  const companiesQuery = adapter.useCompanies();

  const customer = customerQuery.data ?? null;
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const company = useMemo(
    () => (companiesQuery.data ?? []).find((c) => c.id === customer?.companyId) ?? null,
    [companiesQuery.data, customer],
  );
  const invoices = invoicesQuery.data ?? [];
  // Every invoice stays in the table, but the headline sum only counts real revenue.
  const countedInvoices = invoices.filter((invoice) => countsAsRevenue(invoice.status));
  const totalAmount = countedInvoices.reduce((sum, invoice) => sum + (invoice.amountGross ?? 0), 0);
  const notCountedCount = invoices.length - countedInvoices.length;

  if (customerQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (customerQuery.isError) {
    return <ErrorState error={customerQuery.error} onRetry={customerQuery.refetch} />;
  }
  if (!customer) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {labels.detail.notFoundTitle}
        </h1>
        <Button className="mt-6" onClick={() => adapter.openCustomerList()}>
          {labels.detail.toList}
        </Button>
      </div>
    );
  }

  async function deleteCustomer() {
    setIsDeleting(true);
    try {
      await adapter.deleteCustomer(customerId, deleteReason.trim());
      toast.success(labels.detail.deleteDialog.deleted);
      adapter.openCustomerList();
    } catch (error) {
      toast.error(labels.detail.deleteDialog.failed(readableErrorMessage(error, "")));
    } finally {
      setIsDeleting(false);
    }
  }

  const readFields: { label: string; value: string; copyValue?: string }[] = [
    { label: labels.fields.name, value: customer.name },
    { label: labels.fields.company, value: company?.code ?? "—" },
    { label: labels.fields.contactPerson, value: customer.contactPerson ?? "—" },
    {
      label: labels.fields.address,
      value:
        [
          customer.addressStreet,
          [customer.addressZip, customer.addressCity].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(", ") || "—",
    },
    {
      label: labels.fields.vatId,
      value: customer.vatId ?? "—",
      copyValue: customer.vatId ?? undefined,
    },
    {
      label: labels.fields.phone,
      value: customer.phone ?? "—",
      copyValue: customer.phone ?? undefined,
    },
    {
      label: labels.fields.email,
      value: customer.email ?? "—",
      copyValue: customer.email ?? undefined,
    },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={() => adapter.openCustomerList()}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {labels.detail.back}
      </button>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> {labels.detail.editButton}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" /> {labels.detail.deleteButton}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.detail.deleteDialog.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {labels.detail.deleteDialog.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder={labels.detail.deleteDialog.reasonPlaceholder}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.detail.deleteDialog.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!deleteReason.trim() || isDeleting}
                  onClick={deleteCustomer}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {labels.detail.deleteDialog.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <EditCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        adapter={adapter}
        labels={labels}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.detail.masterDataSection}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">{labels.detail.masterDataHint}</p>
          <dl className="space-y-3">
            {readFields.map((field) => (
              <div
                key={field.label}
                className="flex items-start justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="text-sm text-foreground">{field.value}</dd>
                </div>
                {field.copyValue ? (
                  <CopyButton
                    value={field.copyValue}
                    fieldLabel={field.label}
                    labels={labels.copy}
                  />
                ) : null}
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {labels.detail.invoicesSection}
          </h2>
          <div className="mb-4 rounded-lg bg-muted/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              {labels.detail.invoiceTotal(countedInvoices.length)}
            </div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {formatters.formatMoney(totalAmount)}
            </div>
            {notCountedCount > 0 && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {labels.detail.notCounted(notCountedCount)}
              </div>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.detail.invoiceColumns.number}</TableHead>
                  <TableHead>{labels.detail.invoiceColumns.date}</TableHead>
                  <TableHead className="text-right">
                    {labels.detail.invoiceColumns.amount}
                  </TableHead>
                  <TableHead>{labels.detail.invoiceColumns.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium text-foreground">
                      {invoice.invoiceNumber ?? labels.detail.draftNumber}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatters.formatDate(invoice.invoiceDate)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatters.formatMoney(invoice.amountGross ?? 0)}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge
                        status={invoice.status}
                        dueDate={invoice.dueDate}
                        labels={labels.detail.invoiceStatus}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {labels.detail.invoicesEmpty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
