import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Landmark,
  MoreVertical,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Skeleton } from "../../ui/skeleton";
import { Badge } from "../../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, readableErrorMessage } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  NewSupplierBankAccount,
  SupplierDetailAdapter,
  SupplierRecord,
} from "../../adapters/supplier-detail";
import { englishSupplierDetailLabels, type SupplierDetailLabels } from "./labels";

export interface SupplierDetailPageProps {
  supplierId: string;
  adapter: SupplierDetailAdapter;
  labels?: SupplierDetailLabels;
  formatters?: Formatters;
}

interface SupplierForm {
  name: string;
  vat_id: string;
  address: string;
  phone: string;
  email: string;
  contact_person: string;
}

function formFrom(supplier: SupplierRecord): SupplierForm {
  const s = (v: string | null) => v ?? "";
  return {
    name: s(supplier.name),
    vat_id: s(supplier.vat_id),
    address: s(supplier.address),
    phone: s(supplier.phone),
    email: s(supplier.email),
    contact_person: s(supplier.contact_person),
  };
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function SupplierDetailPage({
  supplierId,
  adapter,
  labels = englishSupplierDetailLabels,
  formatters = englishFormatters,
}: SupplierDetailPageProps) {
  const supplierQuery = adapter.useSupplier(supplierId);
  const invoicesQuery = adapter.useInvoices(supplierId);
  const accountsQuery = adapter.bankAccounts?.useAccounts(supplierId);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<NewSupplierBankAccount>({
    iban: "",
    bic: "",
    bankName: "",
  });

  const supplier = supplierQuery.data;
  const invoices = useMemo(
    () =>
      (invoicesQuery.data ?? [])
        .slice()
        .sort((a, b) => (b.documentDate ?? "").localeCompare(a.documentDate ?? "")),
    [invoicesQuery.data],
  );

  if (supplierQuery.error) {
    return <ErrorState error={supplierQuery.error} onRetry={() => supplierQuery.refetch()} />;
  }

  if (supplierQuery.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {labels.notFoundTitle}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{labels.notFoundBody(supplierId)}</p>
        <Button className="mt-6" onClick={adapter.openSupplierList}>
          {labels.backToList}
        </Button>
      </div>
    );
  }

  function openEdit() {
    setForm(formFrom(supplier!));
    setEditOpen(true);
  }

  async function save() {
    if (!form) return;
    const changes: Record<string, unknown> = {};
    const s = (v: string) => (v.trim() === "" ? null : v.trim());
    (Object.keys(form) as (keyof SupplierForm)[]).forEach((key) => {
      const next = s(form[key]);
      const prev = (supplier as unknown as Record<string, unknown>)[key] ?? null;
      if (next !== prev) changes[key] = next;
    });
    if (Object.keys(changes).length === 0) {
      setEditOpen(false);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.updateSupplier(supplier!.id, changes);
      toast.success(labels.saved);
      setEditOpen(false);
    } catch (error) {
      toast.error(labels.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await adapter.softDelete(supplier!.id, deleteReason.trim());
      toast.success(labels.deletedToast);
      setDeleteOpen(false);
      adapter.openSupplierList();
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function restore() {
    try {
      await adapter.restore(supplier!.id);
      toast.success(labels.restoredToast);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function addAccount() {
    if (!adapter.bankAccounts || !newAccount.iban.trim()) return;
    try {
      await adapter.bankAccounts.addAccount(supplier!.id, newAccount);
      toast.success(labels.accountAdded);
      setNewAccount({ iban: "", bic: "", bankName: "" });
      setAddAccountOpen(false);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function removeAccount(accountId: string) {
    if (!adapter.bankAccounts) return;
    try {
      await adapter.bankAccounts.deleteAccount(accountId);
      toast.success(labels.accountRemoved);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function setDefaultAccount(accountId: string) {
    if (!adapter.bankAccounts) return;
    try {
      await adapter.bankAccounts.setDefault(supplier!.id, accountId);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  async function copyAccount(iban: string, bic: string | null, bankName: string | null) {
    const text = [formatIban(iban), bic, bankName].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(labels.copiedToast);
    } catch {
      return;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground"
            onClick={adapter.openSupplierList}
          >
            <ArrowLeft className="size-4" />
            {labels.backToList}
          </Button>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">
            {supplier.name}
          </h1>
          {supplier.vat_id && (
            <p className="mt-1 text-sm text-muted-foreground">{supplier.vat_id}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {adapter.canEdit && (
            <Button variant="outline" size="sm" onClick={openEdit}>
              {labels.edit}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {supplier.deleted_at ? (
                <DropdownMenuItem onClick={restore}>
                  <RotateCcw className="size-4" />
                  {labels.restoreButton}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
                  <Trash2 className="size-4" />
                  {labels.deleteButton}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {supplier.deleted_at && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {labels.deletedBanner(formatters.formatDate(supplier.deleted_at))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">{labels.fieldName}</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Row label={labels.fieldAddress} value={supplier.address} />
            <Row label={labels.fieldVatId} value={supplier.vat_id} />
            <Row label={labels.fieldPhone} value={supplier.phone} />
            <Row label={labels.fieldEmail} value={supplier.email} />
            <Row label={labels.fieldContactPerson} value={supplier.contact_person} />
          </dl>
        </div>

        {adapter.bankAccounts && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {labels.bankAccountsTitle}
              </h2>
              <Button variant="outline" size="sm" onClick={() => setAddAccountOpen(true)}>
                {labels.addAccount}
              </Button>
            </div>
            {accountsQuery?.loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : (accountsQuery?.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{labels.bankAccountsEmpty}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(accountsQuery?.data ?? []).map((account) => (
                  <li key={account.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-sm text-foreground">
                          <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
                          {formatIban(account.iban)}
                          {account.is_default && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="size-3" />
                              {labels.defaultBadge}
                            </Badge>
                          )}
                        </div>
                        {(account.bic || account.bank_name) && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {[account.bic, account.bank_name].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title={labels.copyAccount}
                          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => copyAccount(account.iban, account.bic, account.bank_name)}
                        >
                          <Copy className="size-3.5" />
                        </button>
                        {!account.is_default && (
                          <button
                            type="button"
                            title={labels.setDefault}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setDefaultAccount(account.id)}
                          >
                            <Check className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          title={labels.removeAccount}
                          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeAccount(account.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">{labels.invoicesTitle}</h2>
        {invoicesQuery.loading ? (
          <Skeleton className="mt-3 h-32 w-full rounded-lg" />
        ) : invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{labels.invoicesEmpty}</p>
        ) : (
          <div className="mt-3 overflow-hidden overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.invoicesTitle}</TableHead>
                  <TableHead className="text-right">{labels.fieldName}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => adapter.openInvoice(invoice.id)}
                  >
                    <TableCell>
                      <div className="text-sm text-foreground">
                        {invoice.invoiceNumber
                          ? labels.invoiceNumber(invoice.invoiceNumber)
                          : labels.noInvoiceNumber}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatters.formatDate(invoice.documentDate)}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        invoice.paidAt ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {formatters.formatMoney(invoice.amountGross)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.edit}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              <TextField
                label={labels.fieldName}
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <TextField
                label={labels.fieldVatId}
                value={form.vat_id}
                onChange={(v) => setForm({ ...form, vat_id: v })}
              />
              <TextField
                label={labels.fieldAddress}
                value={form.address}
                onChange={(v) => setForm({ ...form, address: v })}
              />
              <TextField
                label={labels.fieldPhone}
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
              />
              <TextField
                label={labels.fieldEmail}
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <TextField
                label={labels.fieldContactPerson}
                value={form.contact_person}
                onChange={(v) => setForm({ ...form, contact_person: v })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {labels.cancel}
            </Button>
            <Button onClick={save} disabled={isSaving}>
              {isSaving ? labels.saving : labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.addAccountTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <TextField
              label={labels.ibanField}
              value={newAccount.iban}
              onChange={(v) => setNewAccount({ ...newAccount, iban: v })}
            />
            <TextField
              label={labels.bicField}
              value={newAccount.bic}
              onChange={(v) => setNewAccount({ ...newAccount, bic: v })}
            />
            <TextField
              label={labels.bankNameField}
              value={newAccount.bankName}
              onChange={(v) => setNewAccount({ ...newAccount, bankName: v })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAccountOpen(false)}>
              {labels.cancel}
            </Button>
            <Button onClick={addAccount} disabled={!newAccount.iban.trim()}>
              {labels.addAccountConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteDialogTitle}</DialogTitle>
            <DialogDescription>{labels.deleteDialogDescription}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder={labels.deleteReasonPlaceholder}
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {labels.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {labels.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-foreground", !value && "text-muted-foreground")}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
