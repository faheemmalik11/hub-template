import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChannelBadge } from "@/components/documents/badges";
import type { DocumentIntakeLogEntry } from "@/data/documents/intake-log";
import { formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export function DocumentIntakeLogDetailSheet({
  entry,
  onClose,
}: {
  entry: DocumentIntakeLogEntry;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {t("documentIntakeLog.detail.title", { defaultValue: "Document" })}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <Field
            label={t("documentIntakeLog.col.received", { defaultValue: "Received" })}
            value={formatDateTime(entry.receivedAt)}
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t("documentIntakeLog.col.channel", { defaultValue: "Source" })}
            </p>
            <ChannelBadge channel={entry.channel} />
          </div>
          <Field
            label={t("documentIntakeLog.col.sender", { defaultValue: "Sender" })}
            value={entry.sender ?? ""}
          />
          <Field
            label={t("documentIntakeLog.col.subject", { defaultValue: "Subject" })}
            value={entry.subject ?? ""}
          />
          <Field
            label={t("documentIntakeLog.col.company", { defaultValue: "Company" })}
            value={entry.companyCode ?? ""}
          />
          <Field
            label={t("documentIntakeLog.col.outcome", { defaultValue: "What happened" })}
            value={t(`documentIntakeLog.outcome.${entry.outcome}`, { defaultValue: entry.outcome })}
          />
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/incoming-invoices/$nr" params={{ nr: entry.id }}>
              {t("documentIntakeLog.detail.open", { defaultValue: "Open document" })}
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
