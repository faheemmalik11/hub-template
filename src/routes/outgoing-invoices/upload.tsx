import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { FieldErrorText, RequiredStern } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { BUCKETS, buildStoragePath, UPLOAD_LIMIT_BYTES } from "@/features/file-upload/config";
import { uploadToStorage } from "@/features/file-upload/upload";
import {
  useCreateUploadedOutgoingInvoice,
  useCustomers,
  useExtractOutgoingInvoiceFields,
  useCompanies,
} from "@/data";
import { errorText, formatEUR, parseDecimalInput } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";
import {
  OUTGOING_INVOICE_UPLOAD_MIME,
  type OutgoingInvoiceUploadMime,
} from "@/lib/api/outgoing-invoice-shared";

export const Route = createFileRoute("/outgoing-invoices/upload")({
  head: () => ({ meta: [{ title: pageTitle("Ausgangsrechnung hochladen") }] }),
  component: UploadPage,
});

const ALLOWED = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_BYTES = UPLOAD_LIMIT_BYTES;
const EXTRACT_MAX_BYTES = 15 * 1024 * 1024;

type Phase = "drop" | "analyzing" | "rejected" | "preview" | "success";

function mimeFor(file: File): OutgoingInvoiceUploadMime | null {
  const raw = file.type || guessMimeFromName(file.name);
  return (OUTGOING_INVOICE_UPLOAD_MIME as readonly string[]).includes(raw)
    ? (raw as OutgoingInvoiceUploadMime)
    : null;
}

function guessMimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

// File → base64 (no "data:...;base64," prefix — the server adds that once mime is validated).
// Chunked to avoid a call-stack overflow from String.fromCharCode(...bytes) on a large file.
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface FormState {
  companyId: string;
  customerMode: "existing" | "new";
  customerId: string;
  newCustomerName: string;
  newCustomerAddress: string;
  voucherNumber: string;
  voucherDate: string;
  dueDate: string;
  amountNet: string;
  amountGross: string;
  vatRate: string;
}

function emptyForm(): FormState {
  return {
    companyId: "",
    customerMode: "existing",
    customerId: "",
    newCustomerName: "",
    newCustomerAddress: "",
    voucherNumber: "",
    voucherDate: "",
    dueDate: "",
    amountNet: "",
    amountGross: "",
    vatRate: "",
  };
}

/**
 * Which fields the save is still waiting on, as a message per field. The customer sits under one
 * key for both of its shapes: the person sees one "Kunde" row whichever of the two is showing.
 */
type FieldError = Partial<
  Record<
    | "companyId"
    | "customer"
    | "voucherNumber"
    | "voucherDate"
    | "amountNet"
    | "amountGross"
    | "vatRate",
    string
  >
>;

function UploadPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("drop");
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [file, setFile] = useState<{
    name: string;
    mime: OutgoingInvoiceUploadMime;
    base64: string;
    raw: File;
  } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [error, setError] = useState<FieldError>({});

  // Clear one field's message the moment that field changes. Without it the red text stayed put
  // under a field that had just been filled in, until the next click on Speichern.
  const deleteError = (field: keyof FieldError) =>
    setError((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const companiesQ = useCompanies();
  const companies = companiesQ.data ?? [];
  const customersQ = useCustomers(form.companyId || undefined);
  const customers = customersQ.data ?? [];

  const extract = useExtractOutgoingInvoiceFields();
  const createInvoice = useCreateUploadedOutgoingInvoice();

  function patchForm(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function onFilePicked(picked: File) {
    const mime = mimeFor(picked);
    if (!mime) {
      toast.error(t("outgoingInvoices.hochladen.toast.typUngueltig"));
      return;
    }
    if (picked.size > MAX_BYTES) {
      toast.error(t("outgoingInvoices.hochladen.toast.zuGross"));
      return;
    }

    if (picked.size > EXTRACT_MAX_BYTES) {
      setFile({ name: picked.name, mime, base64: "", raw: picked });
      setForm((prev) => ({ ...prev, voucherDate: prev.voucherDate }));
      setError({});
      setPhase("preview");
      toast.info(t("outgoingInvoices.hochladen.toast.zuGrossFuerAnalyse"));
      return;
    }

    const base64 = await fileToBase64(picked);
    setFile({ name: picked.name, mime, base64, raw: picked });
    setPhase("analyzing");

    extract.mutate(
      { filename: picked.name, mime, fileBase64: base64 },
      {
        onSuccess: (result) => {
          if (!result.isOutgoingInvoice) {
            setRejectReason(result.reason);
            setPhase("rejected");
            return;
          }
          const e = result.extracted;
          setForm({
            companyId: result.matchedCompanyId ?? "",
            customerMode: result.matchedCustomerId ? "existing" : "new",
            customerId: result.matchedCustomerId ?? "",
            newCustomerName: e.customerName ?? "",
            newCustomerAddress: e.customerAddress ?? "",
            voucherNumber: e.voucherNumber ?? "",
            voucherDate: e.voucherDate ?? "",
            dueDate: e.dueDate ?? "",
            amountNet: e.amountNet != null ? String(e.amountNet).replace(".", ",") : "",
            amountGross: e.amountGross != null ? String(e.amountGross).replace(".", ",") : "",
            vatRate: e.vatRate != null ? String(e.vatRate) : "",
          });
          setError({});
          setPhase("preview");
        },
        onError: (err) => {
          toast.error(
            t("outgoingInvoices.hochladen.toast.analyseFehlgeschlagen", {
              error: errorText(err),
            }),
          );
          setPhase("drop");
          setFile(null);
        },
      },
    );
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void onFilePicked(picked);
  }

  function reset() {
    setPhase("drop");
    setFile(null);
    setRejectReason(null);
    setForm(emptyForm());
    setCreatedNumber(null);
    setError({});
  }

  const amountGrossParsed = parseDecimalInput(form.amountGross);
  // null (field left empty) is fine for these two optional fields; NaN (garbled non-numeric text)
  // is not — parseDecimalInput only returns null for an empty string, so a non-empty unparsable
  // value surfaces as NaN and must block submit here, same as amountGross already does.
  const amountNetParsed = parseDecimalInput(form.amountNet);
  const vatRateParsed = parseDecimalInput(form.vatRate);
  // Everything the save needs, as a message naming the fix, per field. One function so the fields,
  // the toast and the save all read from the same list instead of each keeping its own idea of
  // "complete".
  function check(): FieldError {
    const f: FieldError = {};
    if (!form.companyId) {
      f.companyId = t("outgoingInvoices.hochladen.validierung.gesellschaft");
    }
    if (form.customerMode === "existing" ? !form.customerId : form.newCustomerName.trim() === "") {
      f.customer = t("outgoingInvoices.hochladen.validierung.kunde");
    }
    if (form.voucherNumber.trim() === "") {
      f.voucherNumber = t("outgoingInvoices.hochladen.validierung.rechnungsnummer");
    }
    if (form.voucherDate.trim() === "") {
      f.voucherDate = t("outgoingInvoices.hochladen.validierung.datum");
    }
    // Three separate messages, because "Bruttobetrag ungültig" on an empty field and on "12,3,4"
    // sends the reader looking for two very different things.
    if (amountGrossParsed == null) {
      f.amountGross = t("outgoingInvoices.hochladen.validierung.bruttoFehlt");
    } else if (Number.isNaN(amountGrossParsed)) {
      f.amountGross = t("outgoingInvoices.hochladen.validierung.zahl");
    } else if (amountGrossParsed <= 0) {
      f.amountGross = t("outgoingInvoices.hochladen.validierung.bruttoPositiv");
    }
    // Both optional, so empty (null) is fine and only unreadable text is not.
    if (Number.isNaN(amountNetParsed ?? 0)) {
      f.amountNet = t("outgoingInvoices.hochladen.validierung.zahl");
    }
    if (Number.isNaN(vatRateParsed ?? 0)) {
      f.vatRate = t("outgoingInvoices.hochladen.validierung.zahl");
    }
    return f;
  }

  async function submit() {
    // The button is clickable on an incomplete form on purpose. Disabled, it answered a click with
    // nothing at all, and there was no way to find out which of ten fields it was waiting on. Now
    // the click marks every one of them red and says what each needs.
    const found = check();
    setError(found);
    if (Object.keys(found).length > 0) {
      toast.error(t("outgoingInvoices.hochladen.toast.unvollstaendig"));
      return;
    }
    if (!file) {
      toast.error(t("outgoingInvoices.hochladen.toast.dateiFehlt"));
      return;
    }

    const invoiceId = crypto.randomUUID();
    let uploaded;
    try {
      uploaded = await uploadToStorage(file.raw, {
        bucket: BUCKETS.outgoing,
        path: buildStoragePath({
          scopeId: form.companyId,
          recordId: invoiceId,
          filename: file.name,
        }),
        mime: file.mime,
      });
    } catch (e) {
      toast.error(errorText(e));
      return;
    }

    createInvoice.mutate(
      {
        invoiceId,
        companyId: form.companyId,
        customerId: form.customerMode === "existing" ? form.customerId : null,
        newCustomer:
          form.customerMode === "new"
            ? { name: form.newCustomerName.trim(), address: form.newCustomerAddress.trim() || null }
            : null,
        voucherNumber: form.voucherNumber.trim(),
        voucherDate: form.voucherDate,
        dueDate: form.dueDate || null,
        amountNet: amountNetParsed,
        amountGross: amountGrossParsed as number,
        vatRate: vatRateParsed,
        filename: file.name,
        mime: file.mime,
        storagePath: uploaded.path,
        sizeBytes: uploaded.sizeBytes,
        checksumSha256: uploaded.checksumSha256,
      },
      {
        onSuccess: (row) => {
          toast.success(t("outgoingInvoices.hochladen.toast.erstellt"));
          setCreatedNumber(row.invoice_number ?? form.voucherNumber);
          setPhase("success");
        },
        onError: (e) =>
          toast.error(
            t("outgoingInvoices.hochladen.toast.fehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  if (phase === "success") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <CheckCircle2 className="mx-auto size-10 text-brand" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          {t("outgoingInvoices.hochladen.erfolg.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("outgoingInvoices.hochladen.erfolg.desc", { number: createdNumber ?? "" })}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>{t("outgoingInvoices.hochladen.erfolg.weitere")}</Button>
          <Button variant="ghost" asChild>
            <Link to="/outgoing-invoices">{t("outgoingInvoices.hochladen.erfolg.zurListe")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/outgoing-invoices"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("outgoingInvoices.hochladen.zurueck")}
      </Link>

      <div data-tour="outgoing-upload-intro" className="mt-2">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("outgoingInvoices.hochladen.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("outgoingInvoices.hochladen.subtitle")}
        </p>
      </div>

      {phase === "drop" && (
        <div
          data-tour="outgoing-upload-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragOver
              ? "border-brand bg-brand-wash"
              : "border-border bg-muted/30 hover:border-brand-soft",
          )}
        >
          <span
            className={cn(
              "grid size-14 place-items-center rounded-full transition-colors",
              dragOver ? "bg-brand text-primary-foreground" : "bg-brand-wash text-brand-dark",
            )}
          >
            <UploadCloud className="size-7" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              {dragOver
                ? t("outgoingInvoices.hochladen.dropRelease")
                : t("outgoingInvoices.hochladen.dropHint")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("outgoingInvoices.hochladen.fileTypes")}
            </p>
          </div>
          <Button variant="outline" className="mt-1" onClick={() => inputRef.current?.click()}>
            {t("outgoingInvoices.hochladen.chooseFile")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void onFilePicked(picked);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {phase === "analyzing" && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm font-medium text-foreground">
            {t("outgoingInvoices.hochladen.analysiere")}
          </p>
          <p className="text-xs text-muted-foreground">{file?.name}</p>
        </div>
      )}

      {phase === "rejected" && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <AlertTriangle className="mx-auto size-8 text-destructive" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {t("outgoingInvoices.hochladen.abgelehnt.title")}
          </p>
          {rejectReason && <p className="mt-1 text-sm text-muted-foreground">{rejectReason}</p>}
          <Button variant="outline" className="mt-5" onClick={reset}>
            {t("outgoingInvoices.hochladen.abgelehnt.andereDatei")}
          </Button>
        </div>
      )}

      {phase === "preview" && (
        <div className="mt-6 space-y-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{file?.name}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {t("outgoingInvoices.hochladen.feld.gesellschaft")} <RequiredStern />
              </Label>
              <Combobox
                value={form.companyId}
                // Changing the company clears the customer: a customer belongs to exactly one
                // company, and the server refuses the mismatch anyway, so it is better not to let
                // anybody build an invalid pair at all.
                onValueChange={(v) => {
                  patchForm({ companyId: v, customerId: "", customerMode: "existing" });
                  deleteError("companyId");
                }}
                options={companies.map((g) => ({
                  value: g.id,
                  label: `${g.code} · ${g.name}`,
                }))}
                placeholder={t("outgoingInvoices.hochladen.feld.gesellschaftPlaceholder")}
                className={cn(error.companyId && "border-destructive")}
              />
              <FieldErrorText text={error.companyId} />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("outgoingInvoices.hochladen.feld.rechnungsnummer")} <RequiredStern />
              </Label>
              <Input
                value={form.voucherNumber}
                onChange={(e) => {
                  patchForm({ voucherNumber: e.target.value });
                  deleteError("voucherNumber");
                }}
                aria-invalid={!!error.voucherNumber}
                className={cn(error.voucherNumber && "border-destructive")}
              />
              <FieldErrorText text={error.voucherNumber} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>
                  {t("outgoingInvoices.hochladen.feld.kunde")} <RequiredStern />
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => {
                    patchForm({
                      customerMode: form.customerMode === "existing" ? "new" : "existing",
                    });
                    // The other shape of the same field, so the message about it goes too. Left
                    // standing, the red "Bitte einen Kunden wählen" sat over an empty name box
                    // that had never been asked for anything yet.
                    deleteError("customer");
                  }}
                >
                  {form.customerMode === "existing"
                    ? t("outgoingInvoices.hochladen.feld.neuerKundeLink")
                    : t("outgoingInvoices.hochladen.feld.bestehenderKundeLink")}
                </button>
              </div>
              {form.customerMode === "existing" ? (
                <Combobox
                  value={form.customerId}
                  onValueChange={(v) => {
                    patchForm({ customerId: v });
                    deleteError("customer");
                  }}
                  disabled={!form.companyId}
                  options={customers.map((k) => ({ value: k.id, label: k.name }))}
                  placeholder={
                    form.companyId
                      ? t("outgoingInvoices.hochladen.feld.kundePlaceholder")
                      : t("outgoingInvoices.hochladen.feld.kundeErstGesellschaft")
                  }
                  emptyText={t("outgoingInvoices.hochladen.feld.keinKunde")}
                  className={cn(error.customer && "border-destructive")}
                />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={form.newCustomerName}
                    onChange={(e) => {
                      patchForm({ newCustomerName: e.target.value });
                      deleteError("customer");
                    }}
                    placeholder={t("outgoingInvoices.hochladen.feld.kundeName")}
                    aria-invalid={!!error.customer}
                    className={cn(error.customer && "border-destructive")}
                  />
                  <Input
                    value={form.newCustomerAddress}
                    onChange={(e) => patchForm({ newCustomerAddress: e.target.value })}
                    placeholder={t("outgoingInvoices.hochladen.feld.kundeAdresse")}
                  />
                </div>
              )}
              <FieldErrorText text={error.customer} />
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("outgoingInvoices.hochladen.feld.datum")} <RequiredStern />
              </Label>
              <DatePicker
                value={form.voucherDate}
                onChange={(v) => {
                  patchForm({ voucherDate: v });
                  deleteError("voucherDate");
                }}
                clearable={false}
                invalid={!!error.voucherDate}
              />
              <FieldErrorText text={error.voucherDate} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("outgoingInvoices.hochladen.feld.faelligkeit")}</Label>
              <DatePicker value={form.dueDate} onChange={(v) => patchForm({ dueDate: v })} />
            </div>

            <div className="space-y-1.5">
              <Label>{t("outgoingInvoices.hochladen.feld.nettobetrag")}</Label>
              <Input
                value={form.amountNet}
                onChange={(e) => {
                  patchForm({ amountNet: e.target.value });
                  deleteError("amountNet");
                }}
                placeholder="0,00"
                aria-invalid={!!error.amountNet}
                className={cn(error.amountNet && "border-destructive")}
              />
              <FieldErrorText text={error.amountNet} />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("outgoingInvoices.hochladen.feld.bruttobetrag")} <RequiredStern />
              </Label>
              <Input
                value={form.amountGross}
                onChange={(e) => {
                  patchForm({ amountGross: e.target.value });
                  deleteError("amountGross");
                }}
                placeholder="0,00"
                aria-invalid={!!error.amountGross}
                className={cn(error.amountGross && "border-destructive")}
              />
              <FieldErrorText text={error.amountGross} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("outgoingInvoices.hochladen.feld.ust")}</Label>
              <Input
                value={form.vatRate}
                onChange={(e) => {
                  patchForm({ vatRate: e.target.value });
                  deleteError("vatRate");
                }}
                placeholder="19"
                aria-invalid={!!error.vatRate}
                className={cn(error.vatRate && "border-destructive")}
              />
              <FieldErrorText text={error.vatRate} />
            </div>
          </div>

          {/* NaN guard as well as null: parseDecimalInput returns NaN for text it cannot read, and
              without this the running total answered "12,3,4" with "NaN €". */}
          {amountGrossParsed != null && !Number.isNaN(amountGrossParsed) && (
            <div className="flex items-center justify-end border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">
                {t("outgoingInvoices.hochladen.feld.bruttobetrag")}:{" "}
              </span>
              <span className="ml-1 font-semibold tabular-nums text-foreground">
                {formatEUR(amountGrossParsed)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={reset}>
              {t("outgoingInvoices.hochladen.abbrechen")}
            </Button>
            {/* Only disabled while the save is in flight, never because the form is incomplete.
                See submit() for why. */}
            <Button onClick={submit} disabled={createInvoice.isPending}>
              {createInvoice.isPending
                ? t("outgoingInvoices.hochladen.speichere")
                : t("outgoingInvoices.hochladen.speichern")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
