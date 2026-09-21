import { Download, ExternalLink, FileWarning, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n";
import {
  hexToUint8Array,
  resolveMime,
  useDocumentFile,
  useFilenameSettings,
  useInvoiceFileUrl,
} from "@/data";
import { buildSuggestedFilename } from "@/lib/filename";
import { cn } from "@/lib/utils";
import { PdfPane } from "@/components/documents/pdf-pane";
import type { Document } from "@/lib/data/types";

// A page-shaped placeholder, shown from the moment the detail screen opens until the document is
// actually on screen. Deliberately the SAME element for both waits, fetching the signed URL and
// then the document itself, because to the person looking they are one wait — a plain grey box
// that changed into a different plain grey box read as the screen being stuck.
function DocumentSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-5", className)}
      aria-hidden
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2 w-1/4" />
        </div>
        <Skeleton className="size-10 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2 w-2/5" />
        <Skeleton className="h-2 w-1/3" />
      </div>
      <div className="mt-6 space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-11/12" />
        <Skeleton className="h-2 w-4/5" />
      </div>
      <div className="mt-auto space-y-2 border-t border-border pt-3">
        <div className="flex justify-between gap-6">
          <Skeleton className="h-2 w-1/4" />
          <Skeleton className="h-2 w-16" />
        </div>
        <div className="flex justify-between gap-6">
          <Skeleton className="h-2 w-1/5" />
          <Skeleton className="h-2 w-16" />
        </div>
        <div className="flex justify-between gap-6">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

// Shows an invoice's original file. Supabase Storage (docs/FILE_STORAGE.md) is the only place new
// files are written — when the row has a storage_bucket/storage_path, this fetches short-lived
// signed URLs server-side (src/lib/api/invoice-files.functions.ts). The bytea/hex Blob path only
// still serves rows ingested before that cutover, which have no Storage copy.
// `beleg` is optional so the preview keeps working anywhere only a belegId is available; when
// passed, the download name follows the admin-configured uniform filename convention
// (docs/FILENAME_CONVENTION.md) instead of the raw uploaded/original filename.
export function DocumentPreview({ documentId, doc }: { documentId: string; doc?: Document }) {
  const { t } = useTranslation();
  const { data: file, isLoading, isError, error } = useDocumentFile(documentId);
  const filenameSettingsQ = useFilenameSettings();

  const originalFilename = file?.filename ?? `beleg-${documentId}`;
  const extension = originalFilename.includes(".") ? originalFilename.split(".").pop()! : "pdf";
  const suggestedFilename =
    doc && filenameSettingsQ.data
      ? buildSuggestedFilename(doc, filenameSettingsQ.data, extension)
      : null;

  const usingStorage = !!file?.storage_bucket && !!file?.storage_path;
  const signedQ = useInvoiceFileUrl(documentId, {
    downloadFilename: suggestedFilename ?? undefined,
    enabled: !file || usingStorage,
  });

  // Bytea fallback — only reached for pre-cutover rows that never got a Storage copy.
  const blob = useMemo(() => {
    if (usingStorage || !file?.content) return null;
    try {
      const bytes = hexToUint8Array(file.content);
      return new Blob([bytes.buffer as ArrayBuffer], { type: resolveMime(file) });
    } catch {
      return null;
    }
  }, [usingStorage, file]);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setBlobUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setBlobUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const previewUrl = usingStorage ? (signedQ.data?.previewUrl ?? null) : blobUrl;
  // The browser's own PDF chrome, turned off through the standard open-parameters fragment:
  //   navpanes=0  the thumbnail rail, which eats a third of a pane that is already the narrower half
  //   toolbar=0   download / print / rotate, all of which this card offers in its own footer
  //   view=FitH   fit the page WIDTH, so an A4 lands readable
  const pdfViewerUrl = previewUrl ? `${previewUrl}#toolbar=0&navpanes=0&view=FitH` : null;

  // ONE height for the pane, shared by the skeleton, the in-frame placeholder and the frame itself.
  // They were three separate values, so the card was 480px while loading and something else after:
  // the page visibly jumped, and on a slow signed-URL fetch the jump came late enough to move
  // whatever the reader had already started reading.
  //
  // A4's ratio, not a fixed height. The frame renders the PDF at #view=FitH, so the page is as tall
  // as the pane is wide times 1.414, and any pane taller than that left a band of the browser PDF
  // viewer's own near-black background under the page -- black that is in no document and that no
  // stylesheet here can reach, because it is painted inside the iframe. Matching the ratio means an
  // A4 page fills the pane exactly. Still capped against the viewport so a wide column cannot push
  // the document past the fold.
  const PANE_H = "aspect-[1/1.414] max-h-[78vh]";
  const downloadUrl = usingStorage ? (signedQ.data?.downloadUrl ?? null) : blobUrl;

  // Loading the signed URL is only half the wait -- the PDF itself still has to load inside the
  // iframe once src is set, which previously showed an empty box with no feedback at all. Reset on
  // every previewUrl change so switching between invoices doesn't show the PREVIOUS document's
  // frame as already-loaded.
  const [frameLoaded, setFrameLoaded] = useState(false);
  useEffect(() => {
    setFrameLoaded(false);
  }, [previewUrl]);

  if (isLoading || (usingStorage && signedQ.isLoading)) {
    return <DocumentSkeleton className={cn(PANE_H, "w-full")} />;
  }

  if (isError || (usingStorage && signedQ.isError)) {
    const err = error ?? signedQ.error;
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-10 text-center text-sm text-muted-foreground">
        <FileWarning className="size-6 text-destructive" />
        <p className="mt-2">{t("documents.detail.preview.loadError")}</p>
        <p className="text-xs">{err instanceof Error ? err.message : ""}</p>
      </div>
    );
  }

  if (!file || !previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        <FileWarning className="size-6" />
        <p className="mt-2">{t("documents.detail.preview.none")}</p>
      </div>
    );
  }

  const mime = resolveMime(file);
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  const filename = suggestedFilename ?? originalFilename;
  // The Storage download URL already carries Content-Disposition: attachment with the right
  // filename baked in server-side (getInvoiceFileUrl) — the `download` attribute only works for
  // same-origin URLs (blob: is same-origin, the Storage URL is cross-origin and would ignore it),
  // so it's only needed for the bytea-fallback blob URL.
  const downloadAttr = usingStorage ? undefined : filename;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        {isPdf ? (
          // Viewport-relative, not a fixed 480px: an A4 page renders ~537px tall in this pane,
          // so a fixed height guaranteed the source was scrolled inside a pane inside a page.
          // Capped so it still fits beside the fields on a laptop.
          <div className={cn("relative w-full", PANE_H)}>
            {!frameLoaded && (
              <DocumentSkeleton className="absolute inset-0 z-10 h-full w-full rounded-none border-0" />
            )}
            {/* Our own renderer rather than the browser viewer in an iframe: everything inside
                a frame, including its scrollbar, is beyond our stylesheets, and this was the one
                scroll container in the app that could not wear the global slim scrollbar. */}
            <PdfPane
              url={previewUrl}
              onReady={() => setFrameLoaded(true)}
              className="h-full w-full"
            />
          </div>
        ) : isImage ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group relative block w-full"
                aria-label={t("documents.detail.preview.enlargeAria")}
              >
                <img src={previewUrl} alt={filename} className="w-full" />
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition-all group-hover:bg-foreground/10 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-1.5 text-sm font-medium text-foreground shadow">
                    <Maximize2 className="size-4" /> {t("documents.detail.preview.enlarge")}
                  </span>
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="font-semibold tracking-tight">{filename}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[75vh] overflow-auto rounded-lg border border-border bg-muted/40 p-4">
                <img src={previewUrl} alt={filename} className="mx-auto w-full" />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
            <FileWarning className="size-6" />
            <p className="mt-2">
              {t("documents.detail.preview.unavailable", {
                type: mime || t("documents.detail.preview.thisFileType"),
              })}
            </p>
            <p className="text-xs">{t("documents.detail.preview.pleaseDownload")}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={filename}>
          {filename}
          {file.size_bytes ? ` · ${(file.size_bytes / 1024).toFixed(0)} KB` : ""}
        </span>
        {isPdf && (
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label={t("documents.detail.preview.newTab")}
                >
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("documents.detail.preview.newTab")}</TooltipContent>
            </Tooltip>
            <Dialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0"
                      aria-label={t("documents.detail.preview.zoom")}
                    >
                      <Maximize2 className="size-3.5" />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("documents.detail.preview.zoom")}</TooltipContent>
              </Tooltip>
              <DialogContent className="max-w-[95vw] sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle className="font-semibold tracking-tight">{filename}</DialogTitle>
                </DialogHeader>
                <iframe
                  src={pdfViewerUrl ?? undefined}
                  title={filename}
                  className="h-[80vh] w-full rounded-lg border border-border"
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Button asChild variant="outline" size="sm" className="w-full gap-2">
        <a href={downloadUrl ?? previewUrl} download={downloadAttr}>
          <Download className="size-4" /> {t("documents.detail.preview.download")}
        </a>
      </Button>
    </div>
  );
}
