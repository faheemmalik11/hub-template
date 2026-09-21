import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomer, useCompanies, useOutgoingInvoices, useSoftDeleteCustomer } from "@/data";
import { errorText, formatDate, formatEUR, countsAlsRevenue } from "@/lib/data/format";
import { CopyButton } from "@/components/documents/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FactList, type Fact } from "@/components/records/fact-list";
import { OutgoingStatusBadge } from "@/components/documents/badges";
import { ErrorState } from "@/components/documents/query-states";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/customers/$id")({
  head: () => ({ meta: [{ title: pageTitle("Kunde") }] }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const customerQ = useCustomer(id);
  const invoicesQ = useOutgoingInvoices({ customerId: id });
  const companiesQ = useCompanies();
  const deleteK = useSoftDeleteCustomer(id);

  const customer = customerQ.data ?? null;
  const [deleteReason, setDeleteReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const company = useMemo(
    () => (companiesQ.data ?? []).find((g) => g.id === customer?.company_id) ?? null,
    [companiesQ.data, customer],
  );
  const invoices = invoicesQ.data ?? [];
  // Every document stays in the table below -- a cancellation is still something you want to see.
  // The headline figure, though, is money, so it only counts what zaehltAlsUmsatz() allows. When
  // something is left out we say so, rather than letting the count silently disagree with the rows.
  const countedInvoices = invoices.filter((r) => countsAlsRevenue(r.status));
  const total = countedInvoices.reduce((s, r) => s + (r.amount_gross ?? 0), 0);
  const notCounted = invoices.length - countedInvoices.length;

  if (customerQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (customerQ.isError) {
    return <ErrorState error={customerQ.error} onRetry={() => customerQ.refetch()} />;
  }
  if (!customer) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("customers.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/customers">{t("customers.detail.toList")}</Link>
        </Button>
      </div>
    );
  }

  function confirmDelete() {
    deleteK.mutate(deleteReason.trim(), {
      onSuccess: () => {
        toast.success(t("customers.detail.toast.geloescht"));
        navigate({ to: "/customers" });
      },
      onError: (e) =>
        toast.error(
          t("customers.detail.toast.loeschenFehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  // Label above value, one under the other, the same list the company, property and supplier
  // detail pages read their master data from.
  const masterData: Fact[] = [
    { label: t("customers.detail.field.name"), value: customer.name },
    { label: t("customers.detail.field.gesellschaft"), value: company?.code ?? null },
    { label: t("customers.detail.field.ansprechpartner"), value: customer.contact_person },
    {
      label: t("customers.detail.field.adresse"),
      wide: true,
      value:
        [
          customer.address_street,
          [customer.address_zip, customer.address_city].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(", ") || null,
    },
    {
      label: t("customers.detail.field.ustId"),
      value: customer.vat_id,
      node: customer.vat_id ? (
        <span className="inline-flex items-center gap-1">
          {customer.vat_id}
          <CopyButton value={customer.vat_id} label={t("customers.detail.field.ustId")} />
        </span>
      ) : undefined,
    },
    {
      label: t("customers.detail.field.telefon"),
      value: customer.phone,
      node: customer.phone ? (
        <span className="inline-flex items-center gap-1">
          {customer.phone}
          <CopyButton value={customer.phone} label={t("customers.detail.field.telefon")} />
        </span>
      ) : undefined,
    },
    {
      label: t("customers.detail.field.email"),
      value: customer.email,
      wide: true,
      node: customer.email ? (
        <span className="inline-flex items-center gap-1">
          {customer.email}
          <CopyButton value={customer.email} label={t("customers.detail.field.email")} />
        </span>
      ) : undefined,
    },
  ];

  return (
    <div>
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("customers.detail.back")}
      </Link>
      <div
        data-tour="customer-detail-header"
        className="mt-2 flex flex-wrap items-end justify-between gap-4"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> {t("customers.detail.edit.button")}
          </Button>
          {/* The destructive action moved into a menu, matching the company and property pages: it
              sat beside Edit with the same weight as the thing people actually come here to do. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("customers.detail.action.mehr")}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-56">
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> {t("customers.detail.delete.button")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Driven by state and rendered OUTSIDE the menu on purpose: selecting a menu item closes
          the menu, which would unmount a trigger rendered inside it before it could open. */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDeleteReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.detail.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("customers.detail.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder={t("customers.detail.delete.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("customers.detail.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteReason.trim()}
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("customers.detail.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditCustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />

      <div data-tour="customer-detail-content" className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("customers.detail.section.stammdaten")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("customers.detail.editHinweis")}</p>
          <FactList facts={masterData} columns={2} />
          <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-border/60 pt-3.5">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("customers.detail.field.erstellt")}
              </dt>
              <dd className="mt-0.5 text-base text-foreground">
                {formatDate(customer.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("customers.detail.field.aktualisiert")}
              </dt>
              <dd className="mt-0.5 text-base text-foreground">
                {formatDate(customer.updated_at ?? customer.created_at)}
              </dd>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          {/* Count and total sit ON the heading line, the same way the company, property and
              supplier pages carry theirs. */}
          <h2 className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("customers.detail.section.rechnungen")}
            {invoicesQ.data === undefined ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <>
                <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                  {t("customers.detail.gesamt", { count: countedInvoices.length })}
                </span>
                <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                  {formatEUR(total)}
                </span>
              </>
            )}
          </h2>
          {/* Count and total belong on the heading line. As a tinted tile they were a box competing
              with the table for the eye, for two numbers that are a subtitle. */}
          {notCounted > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t("customers.detail.nichtGezaehlt", { count: notCounted })}
            </p>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Capped and scrolled rather than left to grow: the card sits in a grid row, so an
                unbounded table drags the whole page height with it. */}
            <Table containerClassName="max-h-[26rem]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("customers.detail.col.nr")}</TableHead>
                  <TableHead>{t("customers.detail.col.datum")}</TableHead>
                  <TableHead className="text-right">{t("customers.detail.col.betrag")}</TableHead>
                  <TableHead>{t("customers.detail.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-foreground">
                      {r.invoice_number ?? t("customers.detail.entwurf")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {formatDate(r.invoice_date)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatEUR(r.amount_gross)}
                    </TableCell>
                    <TableCell>
                      <OutgoingStatusBadge status={r.status} dueDate={r.due_date} />
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("customers.detail.rechnungenEmpty")}
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
