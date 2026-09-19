// "This invoice came out of a multi-receipt scan" — shown on a CHILD invoice's detail page.
//
// WHY: a scan with several receipts on it is split into one invoice per receipt, and the original PDF
// stays attached to a container row (status='split'). That container is deliberately kept for the
// audit trail (GoBD) but is hidden from the invoice lists, because it is not an invoice — it has no
// issuer, amount or date, and it used to show up as a phantom extra entry (pipeline migration 0020).
//
// Hiding it would otherwise make the full original unreachable in the UI, so this note is how you get
// back to it: it names the pages this invoice was carved from and opens the complete scan on demand.
// DocumentPreview is reused as-is with the CONTAINER's id — it reads invoice_files directly, so it
// works even though the container is filtered out of the lists.
//
// A mail carrying several attachments is now split the same way — one invoice per attachment, all
// under one container — but THERE THE CONTAINER HOLDS NO FILE. The pipeline attaches the original to
// a container only when the item was a single document ("a scan container holds the scan; a mail
// container holds nothing, its children do"). There is no original scan to open, so this note says
// what really happened rather than offering a button that opens an empty preview.
//
// That missing file is the signal, NOT the page range: an attachment that is itself a multi-invoice
// scan gets carved up as well, so it carries a page range while its container is still empty.
import { Layers, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DocumentPreview } from "@/components/belege/document-preview";
import { useBelegDatei } from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";

export function SplitOriginNote({
  sourceDocumentId,
  pageRange,
}: {
  sourceDocumentId: string | null;
  pageRange: string | null;
}) {
  const { t } = useTranslation();
  // Same read the preview does, so on a scan it is served from cache rather than fetched twice.
  const container = useBelegDatei(sourceDocumentId ?? "");

  if (!sourceDocumentId) return null;
  // Wait for the answer instead of guessing — the wording would otherwise flip under the reader.
  if (container.isLoading) return null;

  // A failed read is not evidence of a mail, so keep the scan note and its way back to the original.
  const fromMail = !container.data && !container.isError;
  const Icon = fromMail ? Paperclip : Layers;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {fromMail
          ? t("splitOrigin.mailAttachment")
          : pageRange
            ? t("splitOrigin.textWithPages", { pages: pageRange })
            : t("splitOrigin.text")}
      </p>
      {!fromMail && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {t("splitOrigin.showOriginal")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{t("splitOrigin.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <DocumentPreview belegId={sourceDocumentId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
