// "Mit KI importieren" — the ONLY way to import a chart of accounts (the previous manual
// "Konto;Kategorie-Code" textarea import was removed; every account file goes through this
// dialog now). The user picks company + one or more fiscal years right here (a chart of accounts
// from the tax advisor is usually identical across several years, so importing the same extracted
// mapping into more than one year at once is the common case, not an edge case), then drops a
// file (CSV/Excel/PDF/image). The AI extracts account + description and suggests a category per
// row from the client's own bwa_categories; every row stays editable in a preview before anything
// is written. The write itself reuses useImportBwaAccountMapping, once per selected year.
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, FileText, Loader2, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useExtractChartOfAccounts, useImportBwaAccountMapping } from "@/lib/data/queries";
import type { BwaAccountMappingRow } from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";
import type { BwaCategory, Gesellschaft } from "@/lib/data/types";
import { CHART_OF_ACCOUNTS_FILE_MIME } from "@/lib/api/chart-of-accounts-extraction-shared";
import { fehlerText } from "@/lib/data/format";

const MAX_BYTES = 15 * 1024 * 1024;
const ERLAUBT = [".pdf", ".jpg", ".jpeg", ".png", ".csv", ".xlsx", ".xls"];

// Same reasoning as the tab's own FISCAL_YEAR_OPTIONS: a plain number input lets the mouse scroll
// wheel silently change the year. Kept as its own module-scope copy rather than importing the
// route's private constant, since this dialog is meant to be reusable outside this one route.
const FISCAL_YEAR_OPTIONS: ComboboxOption[] = Array.from({ length: 2099 - 1999 + 1 }, (_, i) => {
  const year = 1999 + i;
  return { value: String(year), label: String(year) };
});

type Phase = "drop" | "analyzing" | "preview" | "error";

interface PreviewRow {
  account: string;
  description: string | null;
  categoryId: string | null;
}

function guessMimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// XLSX/XLS are a binary format, so they're converted to a CSV-shaped text blob first, then sent
// exactly like a raw CSV upload — the AI reads text either way, there is no benefit to a richer
// structured parse here since the AI (not the app) is the one interpreting arbitrary columns.
function xlsxToCsvText(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Die Excel-Datei enthält keine Tabellenblätter.");
  return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
}

export function KiImportKontenrahmenDialog({
  companies,
  categories,
  defaultCompanyId,
  defaultJahr,
}: {
  companies: Gesellschaft[];
  categories: BwaCategory[];
  defaultCompanyId?: string | null;
  defaultJahr?: number;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("drop");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(defaultCompanyId ?? null);
  const [jahre, setJahre] = useState<string[]>([String(defaultJahr ?? new Date().getFullYear())]);
  const [saving, setSaving] = useState(false);

  const extract = useExtractChartOfAccounts();
  const importMutation = useImportBwaAccountMapping();

  function reset() {
    setPhase("drop");
    setDragOver(false);
    setErrorMsg(null);
    setFilename(null);
    setRows([]);
  }

  async function onFilePicked(picked: File) {
    if (picked.size > MAX_BYTES) {
      toast.error(t("kontenrahmen.kiImport.toast.zuGross"));
      return;
    }
    const name = picked.name.toLowerCase();
    setFilename(picked.name);
    setPhase("analyzing");

    try {
      let args: Parameters<typeof extract.mutate>[0];
      if (name.endsWith(".csv")) {
        args = { mode: "text", filename: picked.name, textContent: await picked.text() };
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const csvText = xlsxToCsvText(await picked.arrayBuffer());
        args = { mode: "text", filename: picked.name, textContent: csvText };
      } else {
        const mime = guessMimeFromName(picked.name);
        if (!(CHART_OF_ACCOUNTS_FILE_MIME as readonly string[]).includes(mime)) {
          toast.error(t("kontenrahmen.kiImport.toast.typUngueltig"));
          setPhase("drop");
          return;
        }
        args = {
          mode: "file",
          filename: picked.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mime: mime as any,
          fileBase64: await fileToBase64(picked),
        };
      }

      extract.mutate(args, {
        onSuccess: (result) => {
          if (result.rows.length === 0) {
            setErrorMsg(t("kontenrahmen.kiImport.toast.keineKonten"));
            setPhase("error");
            return;
          }
          setRows(
            result.rows.map((r) => ({
              account: r.account,
              description: r.description,
              categoryId: r.matchedCategoryId,
            })),
          );
          setPhase("preview");
        },
        onError: (err) => {
          toast.error(
            t("kontenrahmen.kiImport.toast.analyseFehlgeschlagen", {
              error: fehlerText(err),
            }),
          );
          setPhase("drop");
        },
      });
    } catch (e) {
      toast.error(fehlerText(e));
      setPhase("drop");
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void onFilePicked(picked);
  }

  const recognized = rows.filter((r) => r.categoryId);
  const canUpload = !!companyId && jahre.length > 0;

  async function speichern() {
    if (!companyId || jahre.length === 0) return;
    const payload: BwaAccountMappingRow[] = recognized.map((r) => ({
      account: r.account,
      category_id: r.categoryId!,
      note: r.description ?? null,
    }));

    setSaving(true);
    // Sequential, not Promise.all: the same import mutation object is reused for every year, and
    // the point of picking multiple years is "the same file applies to each of them" — a partial
    // failure should say exactly which year broke, not report a mixed race of successes/errors.
    // currentYear is tracked outside the try so the catch block can name it in the error toast.
    let currentYear: string | null = null;
    try {
      for (const jahrStr of jahre) {
        currentYear = jahrStr;
        await importMutation.mutateAsync({
          fiscalYear: Number(jahrStr),
          companyId,
          rows: payload,
        });
      }
      toast.success(
        t("kontenrahmen.kiImport.toast.importiert", {
          count: payload.length,
          jahre: jahre.join(", "),
        }),
      );
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(
        t("kontenrahmen.kiImport.toast.jahrFehlgeschlagen", {
          jahr: currentYear,
          error: fehlerText(e),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          // Re-seed from the tab's current filters every time the dialog opens — it doesn't
          // remount between opens, so without this a stale company/year from a previous open
          // (or from before the tab's own filters changed) would silently carry over.
          setCompanyId(defaultCompanyId ?? null);
          setJahre([String(defaultJahr ?? new Date().getFullYear())]);
        } else {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="size-4" /> {t("kontenrahmen.kiImport.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("kontenrahmen.kiImport.title")}</DialogTitle>
          <DialogDescription>{t("kontenrahmen.kiImport.desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("kontenrahmen.gesellschaft")}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={companies.map((g) => ({
                value: g.id,
                label: `${g.code} · ${g.name}`,
                keywords: g.name,
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kontenrahmen.kiImport.jahre")}</Label>
            <MultiCombobox values={jahre} onValuesChange={setJahre} options={FISCAL_YEAR_OPTIONS} />
          </div>
        </div>

        {phase === "drop" && (
          <div
            onDragOver={(e) => {
              if (!canUpload) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={canUpload ? handleDrop : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              !canUpload && "cursor-not-allowed opacity-50",
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
                {!canUpload
                  ? t("kontenrahmen.kiImport.auswahlFehlt")
                  : dragOver
                    ? t("kontenrahmen.kiImport.dropRelease")
                    : t("kontenrahmen.kiImport.dropHint")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("kontenrahmen.kiImport.fileTypes")}
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-1"
              disabled={!canUpload}
              onClick={() => inputRef.current?.click()}
            >
              {t("kontenrahmen.kiImport.chooseFile")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ERLAUBT.join(",")}
              className="hidden"
              disabled={!canUpload}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void onFilePicked(picked);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <Loader2 className="size-8 animate-spin text-brand" />
            <p className="text-sm font-medium text-foreground">
              {t("kontenrahmen.kiImport.analysiere")}
            </p>
            <p className="text-xs text-muted-foreground">{filename}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {t("kontenrahmen.kiImport.fehler.title")}
            </p>
            {errorMsg && <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>}
            <Button variant="outline" className="mt-5" onClick={reset}>
              {t("kontenrahmen.kiImport.fehler.andereDatei")}
            </Button>
          </div>
        )}

        {phase === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{filename}</span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {t("kontenrahmen.kiImport.vorschau", {
                recognized: recognized.length,
                total: rows.length,
              })}
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table containerClassName="max-h-96">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("kontenrahmen.col.konto")}</TableHead>
                    <TableHead>{t("kontenrahmen.col.notiz")}</TableHead>
                    <TableHead>{t("kontenrahmen.col.kategorie")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.account}-${i}`}>
                      <TableCell className="font-mono text-sm">{r.account}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.description}
                      </TableCell>
                      <TableCell>
                        <Combobox
                          value={r.categoryId}
                          onValueChange={(v) =>
                            setRows((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, categoryId: v } : row)),
                            )
                          }
                          options={categories.map((c) => ({
                            value: c.id,
                            label: c.name,
                            keywords: c.code,
                          }))}
                          placeholder={t("kontenrahmen.kiImport.keineKategorie")}
                          className="min-w-48"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {phase === "preview" && (
          <DialogFooter>
            <Button variant="ghost" onClick={reset}>
              {t("kontenrahmen.kiImport.abbrechen")}
            </Button>
            <Button onClick={speichern} disabled={recognized.length === 0 || saving || !canUpload}>
              {saving
                ? t("kontenrahmen.kiImport.speichere")
                : t("kontenrahmen.kiImport.speichernConfirm", {
                    count: recognized.length,
                    jahre: jahre.length,
                  })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
