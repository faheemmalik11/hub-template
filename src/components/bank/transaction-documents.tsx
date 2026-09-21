// The documents that belong to a bank transaction itself, rather than to an invoice.
//
// A Pleo card purchase has no invoice record: the photographed receipt IS the document, and
// migration 0074 hangs it off the transaction. The sync has been storing those files since
// 2026-08 -- 1.975 transactions carry one -- and no screen has ever shown one, so a transaction
// with its receipt looked exactly like a transaction without. That is what made the bank screens
// a dead end for the client.
//
// SHOWN IN PLACE, the way the invoice detail shows an invoice: the same PdfPane renderer, and the
// same three actions under it (new tab, enlarge, download) in the same order. Sending a reviewer
// to a browser tab to answer "is there a receipt, and is it the right one?" costs them the
// transaction they were reading.
//
// The one thing this adds over the invoice preview is a strip: a Pleo entry can carry several
// receipts (a split bill, a photo plus the emailed PDF), where an invoice has exactly one original.
import { useEffect, useState } from "react";
import { Download, ExternalLink, FileWarning, Maximize2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PdfPane } from "@/components/documents/pdf-pane";
import { useTransactionDocuments } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// A4's ratio, matching the invoice preview: the pane is exactly as tall as a page rendered to its
// width, so no band of the renderer's own background shows under the document.
const PANE_H = "aspect-[1/1.414] max-h-[70vh]";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TransactionDocuments({
  transactionId,
  className,
}: {
  transactionId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useTransactionDocuments(transactionId);
  const files = data ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  // Reset when the transaction changes, so navigating between two of them cannot leave the
  // previous transaction's receipt selected on a list that no longer contains it.
  useEffect(() => {
    setActiveId(null);
  }, [transactionId]);

  const active = files.find((d) => d.id === activeId) ?? files[0] ?? null;

  const [frameLoaded, setFrameLoaded] = useState(false);
  useEffect(() => {
    setFrameLoaded(false);
  }, [active?.previewUrl]);

  if (isLoading) {
    return <Skeleton className={cn(PANE_H, "w-full rounded-lg", className)} />;
  }

  // A failed lookup says nothing rather than claiming there is no receipt. The difference matters:
  // "no document" is a fact somebody acts on -- they go and chase it -- and a network error that
  // renders as that fact sends them chasing a document that is already here.
  if (isError) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("bank.detail.belege.fehler")}
      </p>
    );
  }

  if (!active) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        <FileWarning className="size-6" />
        <p className="mt-2">{t("bank.detail.belege.keine")}</p>
      </div>
    );
  }

  const isPdf = (active.mime ?? "") === "application/pdf";
  const isImage = (active.mime ?? "").startsWith("image/");
  const name = active.filename ?? t("bank.detail.belege.datei");

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
        {isPdf ? (
          <div className={cn("relative w-full", PANE_H)}>
            {!frameLoaded && (
              <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" />
            )}
            <PdfPane
              url={active.previewUrl}
              onReady={() => setFrameLoaded(true)}
              className="h-full w-full"
            />
          </div>
        ) : isImage ? (
          <img src={active.previewUrl} alt={name} className="w-full" />
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
            <FileWarning className="size-6" />
            <p className="mt-2">
              {t("bank.detail.belege.nichtDarstellbar", { type: active.mime })}
            </p>
          </div>
        )}
      </div>

      {/* Only with something to switch BETWEEN. One receipt is the common case and a strip of one
          thumbnail is a control that does nothing. */}
      {files.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {files.map((d) => {
            const selected = d.id === active.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveId(d.id)}
                aria-current={selected}
                title={d.filename ?? undefined}
                className={cn(
                  "h-14 w-14 overflow-hidden rounded-md border transition-colors",
                  selected ? "border-brand ring-1 ring-brand" : "border-border hover:border-brand",
                )}
              >
                {(d.mime ?? "").startsWith("image/") ? (
                  <img
                    src={d.previewUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    PDF
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The same three actions the invoice preview offers, in the same order and the same place,
          because this is the same job on a different record: open in a tab, enlarge, download. A
          reader who learned them on an invoice should not have to learn them again here. */}
      <div className="flex items-center gap-2">
        {/* Says WHERE the document came from: "a receipt exists" and "an employee photographed one
            in Pleo" are different degrees of evidence to whoever signs this off. */}
        <span
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground"
          title={name}
        >
          <Paperclip className="size-3.5 shrink-0" />
          <span className="truncate">
            {active.source
              ? t("bank.detail.belege.quelle", { source: active.source })
              : t("bank.detail.belege.vorhanden")}
            {active.sizeBytes ? ` · ${formatBytes(active.sizeBytes)}` : ""}
            {files.length > 1
              ? ` · ${t("bank.detail.belege.anzahl", { count: files.length })}`
              : ""}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                aria-label={t("bank.detail.belege.neuerTab")}
              >
                <a href={active.previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("bank.detail.belege.neuerTab")}</TooltipContent>
          </Tooltip>
          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    aria-label={t("bank.detail.belege.vergroessern")}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("bank.detail.belege.vergroessern")}</TooltipContent>
            </Tooltip>
            <DialogContent className="max-w-[95vw] sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle className="font-semibold tracking-tight">{name}</DialogTitle>
              </DialogHeader>
              {isImage ? (
                <div className="max-h-[80vh] overflow-auto rounded-lg border border-border bg-muted/40 p-4">
                  <img src={active.previewUrl} alt={name} className="mx-auto w-full" />
                </div>
              ) : (
                <iframe
                  src={`${active.previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                  title={name}
                  className="h-[80vh] w-full rounded-lg border border-border"
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* The signed download URL carries Content-Disposition server-side, so no `download`
          attribute: it is cross-origin and the browser would ignore it anyway. */}
      <Button asChild variant="outline" size="sm" className="w-full gap-2">
        <a href={active.downloadUrl}>
          <Download className="size-4" /> {t("bank.detail.belege.herunterladen")}
        </a>
      </Button>
    </div>
  );
}
