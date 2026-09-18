import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  ABGLEICH_META,
  type AbgleichStatus,
  MATCH_STATUS_META,
  RICHTUNG_META,
  TRANSACTION_TYPE_META,
  TXN_MATCHING_STATUS_META,
  TXN_QUELLE_META,
} from "@/lib/data/format";

export function MatchStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = status ? MATCH_STATUS_META[status] : undefined;
  const label = status ? t(`bank.matchStatus.${status}`, { defaultValue: status }) : "—";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function RichtungBadge({
  richtung,
  className,
}: {
  richtung: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = richtung ? RICHTUNG_META[richtung] : undefined;
  const label = richtung ? t(`bank.richtung.${richtung}`, { defaultValue: richtung }) : "—";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

// Movement type (transaction_type). A null value means the movement predates the classifier and
// the next sync will fill it, so it shows as "Nicht klassifiziert" rather than an empty cell.
// An empty cell would read as "no type applies" instead of "not looked at yet".
export function TransactionTypeBadge({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const key = type ?? "unbekannt";
  const meta = TRANSACTION_TYPE_META[key];
  const label = t(`bank.transactionType.${key}`, { defaultValue: key });
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function QuelleBadge({
  source,
  hasDocument,
  documentTitle,
  className,
}: {
  source: string | null | undefined;
  /**
   * A document of the transaction's own hangs off this row (invoice_files.transaction_id): a Pleo
   * card receipt, not an invoice matched to it. Shown as a paperclip INSIDE this chip rather than
   * as a chip of its own -- where the row came from and whether it brought its receipt are one
   * fact about provenance, and two adjacent chips made the column read like a list of unrelated
   * states.
   */
  hasDocument?: boolean;
  documentTitle?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = source ? TXN_QUELLE_META[source] : undefined;
  const label = source ? t(`bank.quelle.${source}`, { defaultValue: source }) : "—";
  return (
    <Badge
      variant="outline"
      title={hasDocument ? documentTitle : undefined}
      className={cn(
        "gap-1 border-transparent font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {hasDocument && <Paperclip className="size-3" />}
      {label}
    </Badge>
  );
}

export function TxnMatchingBadge({
  status,
  hasSuggested = false,
  className,
}: {
  status: string | null | undefined;
  // A transaction carrying an open match suggestion is still matching_status='offen' -- the
  // suggestion lives in invoice_transaction_matches, not on the transaction row. Showing plain
  // "Offen" hid the one state that actually needs a person to look at it.
  hasSuggested?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // Only an OPEN transaction can read as "suggested": once it is zugeordnet or ignoriert the
  // decision has been made, and a leftover candidate must not re-open it visually.
  const effective = hasSuggested && (!status || status === "offen") ? "vorschlag" : status;
  const meta = effective ? TXN_MATCHING_STATUS_META[effective] : undefined;
  const label = effective ? t(`bank.txnMatching.${effective}`, { defaultValue: effective }) : "—";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function AbgleichBadge({
  status,
  className,
}: {
  status: AbgleichStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = ABGLEICH_META[status];
  // variant="outline", like every other meta-coloured badge here. The default variant carries
  // `hover:bg-primary/80`, and tailwind-merge does not drop it against `meta.cls` -- a hover key
  // never conflicts with a plain `bg-`. So hovering flipped the pill to solid primary while the
  // label kept its own dark colour, and the text became unreadable.
  return (
    <Badge variant="outline" className={cn("font-medium", meta.cls, className)}>
      {t(`bank.abgleich.${status}`)}
    </Badge>
  );
}

// Small colored dot + text for a connection's sync state.
export function SyncStatusPill({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const dots: Record<string, string> = {
    active: "bg-emerald-500",
    pending: "bg-amber-400",
    error: "bg-red-500",
    expired: "bg-muted-foreground/40",
  };
  const dot = (status && dots[status]) || "bg-muted-foreground/40";
  const label = status ? t(`bank.syncStatus.${status}`, { defaultValue: status }) : "—";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}
    >
      <span className={cn("inline-block size-2 rounded-full", dot)} />
      {label}
    </span>
  );
}
