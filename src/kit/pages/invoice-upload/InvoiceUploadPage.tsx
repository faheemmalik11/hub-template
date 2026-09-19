import { useRef, useState } from "react";
import { ArrowLeft, FileCheck2, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
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
import { readableErrorMessage } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import type { InvoiceUploadAdapter, InvoiceUploadInput } from "../../adapters/invoice-upload";
import { englishInvoiceUploadLabels, type InvoiceUploadLabels } from "./labels";

type Phase = "queued" | "uploading" | "done";

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  phase: Phase;
  progress: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newId(): string {
  return `f-${Math.random().toString(36).slice(2, 9)}`;
}

function isAccepted(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

export interface InvoiceUploadPageProps {
  adapter: InvoiceUploadAdapter;
  labels?: InvoiceUploadLabels;
}

export function InvoiceUploadPage({
  adapter,
  labels = englishInvoiceUploadLabels,
}: InvoiceUploadPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());

  function addFiles(list: FileList | File[]) {
    const array = Array.from(list);
    const tooBig = array.filter((f) => f.size > adapter.maxFileSizeBytes);
    const accepted = array.filter(
      (f) => isAccepted(f.name, adapter.acceptedExtensions) && f.size <= adapter.maxFileSizeBytes,
    );
    const rejected = array.length - accepted.length;
    if (tooBig.length > 0)
      toast.error(labels.toastTooBig(tooBig.length, formatSize(adapter.maxFileSizeBytes)));
    else if (rejected > 0) toast.error(labels.toastIgnored(rejected));
    if (accepted.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...accepted.map((f) => ({
        id: newId(),
        file: f,
        name: f.name,
        size: f.size,
        phase: "queued" as Phase,
        progress: 0,
      })),
    ]);
  }

  function removeFile(id: string) {
    controllers.current.get(id)?.abort();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function cancelFile(id: string) {
    controllers.current.get(id)?.abort();
  }

  async function upload() {
    const queued = files.filter((f) => f.phase === "queued");
    if (queued.length === 0) return;
    setUploading(true);
    try {
      const inputs: InvoiceUploadInput[] = [];
      for (const f of queued) {
        const invoiceId = crypto.randomUUID();
        setFiles((prev) =>
          prev.map((x) => (x.id === f.id ? { ...x, phase: "uploading", progress: 0 } : x)),
        );
        const controller = new AbortController();
        controllers.current.set(f.id, controller);
        let result;
        try {
          result = await adapter.uploadFile(f.file, {
            signal: controller.signal,
            onProgress: (percent) =>
              setFiles((prev) =>
                prev.map((x) => (x.id === f.id ? { ...x, progress: percent } : x)),
              ),
          });
        } catch (error) {
          setFiles((prev) =>
            prev.map((x) => (x.id === f.id ? { ...x, phase: "queued", progress: 0 } : x)),
          );
          throw error;
        } finally {
          controllers.current.delete(f.id);
        }
        inputs.push({
          invoiceId,
          filename: f.name,
          mime: result.mime,
          size: result.sizeBytes,
          storageBucket: result.storageBucket,
          storagePath: result.storagePath,
          checksumSha256: result.checksumSha256,
        });
      }
      await adapter.createInvoices(inputs);
      setFiles((prev) => prev.map((f) => (f.phase === "uploading" ? { ...f, phase: "done" } : f)));
      toast.success(labels.toastSaved(queued.length));
    } catch (error) {
      toast.error(labels.toastFailed(readableErrorMessage(error, "")));
    } finally {
      setUploading(false);
    }
  }

  const queuedCount = files.filter((f) => f.phase === "queued").length;
  const hasDone = files.some((f) => f.phase === "done");

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={adapter.openInvoiceList}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {labels.back}
      </button>

      <div className="mt-2">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
        }}
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
            {dragOver ? labels.dropRelease : labels.dropHint}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{labels.fileTypes}</p>
        </div>
        <Button variant="outline" className="mt-1" onClick={() => inputRef.current?.click()}>
          {labels.chooseFiles}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={adapter.acceptedExtensions.join(",")}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              {labels.selectedCount(files.length)}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {labels.removeAll}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{labels.removeAllTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{labels.removeAllDescription}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{labels.removeAllCancel}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => setFiles([])}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {labels.removeAllConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  {f.phase === "done" ? (
                    <FileCheck2 className="size-4 text-brand" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatSize(f.size)}
                    {f.phase === "done" && (
                      <span className="ml-1 text-brand-dark">{labels.savedTag}</span>
                    )}
                    {f.phase === "uploading" && (
                      <span className="ml-1 tabular-nums">{f.progress}%</span>
                    )}
                  </div>
                  {f.phase === "uploading" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                {f.phase === "uploading" && (
                  <button
                    type="button"
                    onClick={() => cancelFile(f.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {labels.cancelFile}
                  </button>
                )}
                {f.phase === "queued" && (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    aria-label={labels.removeFile}
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

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" onClick={adapter.openInvoiceList}>
          {hasDone ? labels.toOverview : labels.cancel}
        </Button>
        <Button className="gap-2" onClick={upload} disabled={queuedCount === 0 || uploading}>
          {uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {labels.uploading}
            </>
          ) : (
            <>
              <UploadCloud className="size-4" />{" "}
              {queuedCount > 0 ? labels.uploadCount(queuedCount) : labels.uploadGeneric}
            </>
          )}
        </Button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{labels.footer}</p>
    </div>
  );
}
