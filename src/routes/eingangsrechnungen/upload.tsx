import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, FileCheck2, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useCreateUploadBelege, type UploadInput } from "@/lib/data/queries";
import {
  ACCEPTED_EXTENSIONS,
  BUCKETS,
  buildStoragePath,
  isAcceptedFile,
  UPLOAD_LIMIT_BYTES,
} from "@/features/file-upload/config";
import { uploadToStorage } from "@/features/file-upload/upload";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";
import { fehlerText } from "@/lib/data/format";

export const Route = createFileRoute("/eingangsrechnungen/upload")({
  head: () => ({ meta: [{ title: pageTitle("Beleg hochladen") }] }),
  /**
   * `?fuer=txn:<id>` means the upload started on a bank transaction that has no document.
   *
   * Same `txn:` shape /offene-posten already uses for `?match=`, so the two deep links into the
   * bank screens read alike. Anything unparseable is dropped rather than rejected: a mangled link
   * should still land you on a working upload page.
   */
  validateSearch: (search: Record<string, unknown>): { fuer?: string } => {
    const raw = typeof search.fuer === "string" ? search.fuer : "";
    return raw.startsWith("txn:") && raw.length > 4 ? { fuer: raw } : {};
  },
  component: UploadPage,
});

/** The transaction id out of `?fuer=txn:<id>`, or null when the upload is a plain one. */
function transactionAus(fuer: string | undefined): string | null {
  return fuer?.startsWith("txn:") ? fuer.slice(4) : null;
}

type Phase = "queued" | "uploading" | "done";

interface UploadDatei {
  id: string;
  file: File;
  name: string;
  groesse: number;
  typ: string;
  phase: Phase;
  progress: number;
}

const MAX_BYTES = UPLOAD_LIMIT_BYTES;

function formatGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeFuer(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".xml")) return "application/xml";
  return "application/octet-stream";
}

function UploadPage() {
  const navigate = useNavigate();
  const { fuer } = Route.useSearch();
  const fuerTransaktion = transactionAus(fuer);
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dateien, setDateien] = useState<UploadDatei[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const createUpload = useCreateUploadBelege();

  function dateienHinzufuegen(liste: FileList | File[]) {
    const arr = Array.from(liste);
    const zuGross = arr.filter((f) => f.size > MAX_BYTES);
    const angenommen = arr.filter((f) => isAcceptedFile(f.name) && f.size <= MAX_BYTES);
    const abgelehnt = arr.length - angenommen.length;
    if (zuGross.length > 0)
      toast.error(
        t("upload.toast.tooBig", { count: zuGross.length, limit: formatGroesse(MAX_BYTES) }),
      );
    else if (abgelehnt > 0) toast.error(t("upload.toast.ignored", { count: abgelehnt }));
    if (angenommen.length === 0) return;
    setDateien((prev) => [
      ...prev,
      ...angenommen.map((f) => ({
        id: `f-${Math.random().toString(36).slice(2, 9)}`,
        file: f,
        name: f.name,
        groesse: f.size,
        typ: f.type || f.name.split(".").pop() || "",
        phase: "queued" as Phase,
        progress: 0,
      })),
    ]);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) dateienHinzufuegen(e.dataTransfer.files);
  }

  function entfernen(id: string) {
    controllers.current.get(id)?.abort();
    setDateien((prev) => prev.filter((d) => d.id !== id));
  }

  function abbrechen(id: string) {
    controllers.current.get(id)?.abort();
  }

  async function hochladen() {
    const offen = dateien.filter((d) => d.phase === "queued");
    if (offen.length === 0) return;
    try {
      const inputs: UploadInput[] = [];
      for (const d of offen) {
        const invoiceId = crypto.randomUUID();
        setDateien((prev) =>
          prev.map((x) => (x.id === d.id ? { ...x, phase: "uploading", progress: 0 } : x)),
        );
        const controller = new AbortController();
        controllers.current.set(d.id, controller);
        let result;
        try {
          result = await uploadToStorage(d.file, {
            signal: controller.signal,
            bucket: BUCKETS.incoming,
            path: buildStoragePath({ scopeId: "upload", recordId: invoiceId, filename: d.name }),
            mime: mimeFuer(d.file),
            onProgress: (percent) =>
              setDateien((prev) =>
                prev.map((x) => (x.id === d.id ? { ...x, progress: percent } : x)),
              ),
          });
        } catch (e) {
          setDateien((prev) =>
            prev.map((x) => (x.id === d.id ? { ...x, phase: "queued", progress: 0 } : x)),
          );
          throw e;
        } finally {
          controllers.current.delete(d.id);
        }
        inputs.push({
          invoiceId,
          filename: d.name,
          mime: result.mime,
          size: result.sizeBytes,
          storageBucket: result.bucket,
          storagePath: result.path,
          checksumSha256: result.checksumSha256,
        });
      }
      await createUpload.mutateAsync({ files: inputs, forTransactionId: fuerTransaktion });
      setDateien((prev) =>
        prev.map((d) => (d.phase === "uploading" ? { ...d, phase: "done" } : d)),
      );
      toast.success(t("upload.toast.saved", { count: offen.length }));
    } catch (e) {
      toast.error(t("upload.toast.failed", { error: fehlerText(e) }));
    }
  }

  const offen = dateien.filter((d) => d.phase === "queued").length;
  const fertig = dateien.some((d) => d.phase === "done");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/eingangsrechnungen"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("upload.back")}
      </Link>

      <div className="mt-2">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("upload.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("upload.subtitle")}</p>
      </div>

      {/* Drag & Drop-Zone */}
      <div
        data-tour="incoming-upload-dropzone"
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
            {dragOver ? t("upload.dropRelease") : t("upload.dropHint")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("upload.fileTypes")}</p>
        </div>
        <Button variant="outline" className="mt-1" onClick={() => inputRef.current?.click()}>
          {t("upload.chooseFiles")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) dateienHinzufuegen(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Datei-Liste */}
      {dateien.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              {t("upload.selectedCount", { count: dateien.length })}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("upload.removeAll")}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("upload.removeAllTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("upload.removeAllDesc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("upload.removeAllCancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => setDateien([])}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("upload.removeAllConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <ul className="divide-y divide-border">
            {dateien.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  {d.phase === "done" ? (
                    <FileCheck2 className="size-4 text-brand" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatGroesse(d.groesse)}
                    {d.phase === "done" && (
                      <span className="ml-1 text-brand-dark">{t("upload.savedTag")}</span>
                    )}
                    {d.phase === "uploading" && (
                      <span className="ml-1 tabular-nums">{d.progress}%</span>
                    )}
                  </div>
                  {d.phase === "uploading" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${d.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                {d.phase === "uploading" && (
                  <button
                    type="button"
                    onClick={() => abbrechen(d.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("upload.cancelFile")}
                  </button>
                )}
                {d.phase === "queued" && (
                  <button
                    type="button"
                    onClick={() => entfernen(d.id)}
                    aria-label={t("upload.removeFile")}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Aktionen */}
      <div
        data-tour="incoming-upload-actions"
        className="mt-6 flex flex-wrap items-center justify-end gap-3"
      >
        <Button variant="outline" onClick={() => navigate({ to: "/eingangsrechnungen" })}>
          {fertig ? t("upload.toOverview") : t("upload.cancel")}
        </Button>
        <Button
          className="gap-2"
          onClick={hochladen}
          disabled={offen === 0 || createUpload.isPending}
        >
          {createUpload.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("upload.uploading")}
            </>
          ) : (
            <>
              <UploadCloud className="size-4" />{" "}
              {offen > 0 ? t("upload.uploadN", { count: offen }) : t("upload.uploadGeneric")}
            </>
          )}
        </Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{t("upload.footer")}</p>
    </div>
  );
}
