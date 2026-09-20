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
import { useCustomer, useGesellschaften, useOutgoingInvoices, useSoftDeleteCustomer } from "@/data";
import { fehlerText, formatDate, formatEUR, zaehltAlsUmsatz } from "@/lib/data/format";
import { CopyButton } from "@/components/belege/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FactList, type Fact } from "@/components/records/fact-list";
import { OutgoingStatusBadge } from "@/components/belege/badges";
import { ErrorState } from "@/components/belege/query-states";
import { EditCustomerDialog } from "@/components/kunden/edit-customer-dialog";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/kunden/$id")({
  head: () => ({ meta: [{ title: pageTitle("Kunde") }] }),
  component: KundeDetailPage,
});

function KundeDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const kundeQ = useCustomer(id);
  const invoicesQ = useOutgoingInvoices({ customerId: id });
  const gesellschaftenQ = useGesellschaften();
  const deleteK = useSoftDeleteCustomer(id);

  const kunde = kundeQ.data ?? null;
  const [loeschGrund, setLoeschGrund] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);

  const gesellschaft = useMemo(
    () => (gesellschaftenQ.data ?? []).find((g) => g.id === kunde?.company_id) ?? null,
    [gesellschaftenQ.data, kunde],
  );
  const rechnungen = invoicesQ.data ?? [];
  // Every document stays in the table below -- a cancellation is still something you want to see.
  // The headline figure, though, is money, so it only counts what zaehltAlsUmsatz() allows. When
  // something is left out we say so, rather than letting the count silently disagree with the rows.
  const gezaehlteRechnungen = rechnungen.filter((r) => zaehltAlsUmsatz(r.status));
  const summe = gezaehlteRechnungen.reduce((s, r) => s + (r.amount_gross ?? 0), 0);
  const nichtGezaehlt = rechnungen.length - gezaehlteRechnungen.length;

  if (kundeQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (kundeQ.isError) {
    return <ErrorState error={kundeQ.error} onRetry={() => kundeQ.refetch()} />;
  }
  if (!kunde) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("kunden.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/kunden">{t("kunden.detail.toList")}</Link>
        </Button>
      </div>
    );
  }

  function loeschen() {
    deleteK.mutate(loeschGrund.trim(), {
      onSuccess: () => {
        toast.success(t("kunden.detail.toast.geloescht"));
        navigate({ to: "/kunden" });
      },
      onError: (e) =>
        toast.error(
          t("kunden.detail.toast.loeschenFehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  // Label above value, one under the other, the same list the company, property and supplier
  // detail pages read their master data from.
  const stammdaten: Fact[] = [
    { label: t("kunden.detail.field.name"), value: kunde.name },
    { label: t("kunden.detail.field.gesellschaft"), value: gesellschaft?.code ?? null },
    { label: t("kunden.detail.field.ansprechpartner"), value: kunde.contact_person },
    {
      label: t("kunden.detail.field.adresse"),
      wide: true,
      value:
        [kunde.address_street, [kunde.address_zip, kunde.address_city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ") || null,
    },
    {
      label: t("kunden.detail.field.ustId"),
      value: kunde.vat_id,
      node: kunde.vat_id ? (
        <span className="inline-flex items-center gap-1">
          {kunde.vat_id}
          <CopyButton value={kunde.vat_id} label={t("kunden.detail.field.ustId")} />
        </span>
      ) : undefined,
    },
    {
      label: t("kunden.detail.field.telefon"),
      value: kunde.phone,
      node: kunde.phone ? (
        <span className="inline-flex items-center gap-1">
          {kunde.phone}
          <CopyButton value={kunde.phone} label={t("kunden.detail.field.telefon")} />
        </span>
      ) : undefined,
    },
    {
      label: t("kunden.detail.field.email"),
      value: kunde.email,
      wide: true,
      node: kunde.email ? (
        <span className="inline-flex items-center gap-1">
          {kunde.email}
          <CopyButton value={kunde.email} label={t("kunden.detail.field.email")} />
        </span>
      ) : undefined,
    },
  ];

  return (
    <div>
      <Link
        to="/kunden"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("kunden.detail.back")}
      </Link>
      <div
        data-tour="customer-detail-header"
        className="mt-2 flex flex-wrap items-end justify-between gap-4"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{kunde.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> {t("kunden.detail.edit.button")}
          </Button>
          {/* The destructive action moved into a menu, matching the company and property pages: it
              sat beside Edit with the same weight as the thing people actually come here to do. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("kunden.detail.action.mehr")}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-56">
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onSelect={() => setLoeschenOffen(true)}
              >
                <Trash2 className="size-4" /> {t("kunden.detail.delete.button")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Driven by state and rendered OUTSIDE the menu on purpose: selecting a menu item closes
          the menu, which would unmount a trigger rendered inside it before it could open. */}
      <AlertDialog
        open={loeschenOffen}
        onOpenChange={(o) => {
          setLoeschenOffen(o);
          if (!o) setLoeschGrund("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kunden.detail.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("kunden.detail.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={loeschGrund}
            onChange={(e) => setLoeschGrund(e.target.value)}
            placeholder={t("kunden.detail.delete.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("kunden.detail.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!loeschGrund.trim()}
              onClick={loeschen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("kunden.detail.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditCustomerDialog open={editOpen} onOpenChange={setEditOpen} kunde={kunde} />

      <div data-tour="customer-detail-content" className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("kunden.detail.section.stammdaten")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("kunden.detail.editHinweis")}</p>
          <FactList facts={stammdaten} columns={2} />
          <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-border/60 pt-3.5">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("kunden.detail.field.erstellt")}
              </dt>
              <dd className="mt-0.5 text-base text-foreground">{formatDate(kunde.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("kunden.detail.field.aktualisiert")}
              </dt>
              <dd className="mt-0.5 text-base text-foreground">
                {formatDate(kunde.updated_at ?? kunde.created_at)}
              </dd>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          {/* Count and total sit ON the heading line, the same way the company, property and
              supplier pages carry theirs. */}
          <h2 className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("kunden.detail.section.rechnungen")}
            {invoicesQ.data === undefined ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <>
                <span className="text-sm font-normal normal-case tracking-normal text-muted-foreground">
                  {t("kunden.detail.gesamt", { count: gezaehlteRechnungen.length })}
                </span>
                <span className="text-sm font-semibold normal-case tracking-normal tabular-nums text-foreground">
                  {formatEUR(summe)}
                </span>
              </>
            )}
          </h2>
          {/* Count and total belong on the heading line. As a tinted tile they were a box competing
              with the table for the eye, for two numbers that are a subtitle. */}
          {nichtGezaehlt > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t("kunden.detail.nichtGezaehlt", { count: nichtGezaehlt })}
            </p>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            {/* Capped and scrolled rather than left to grow: the card sits in a grid row, so an
                unbounded table drags the whole page height with it. */}
            <Table containerClassName="max-h-[26rem]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("kunden.detail.col.nr")}</TableHead>
                  <TableHead>{t("kunden.detail.col.datum")}</TableHead>
                  <TableHead className="text-right">{t("kunden.detail.col.betrag")}</TableHead>
                  <TableHead>{t("kunden.detail.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rechnungen.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-foreground">
                      {r.invoice_number ?? t("kunden.detail.entwurf")}
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
                {rechnungen.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {t("kunden.detail.rechnungenEmpty")}
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
