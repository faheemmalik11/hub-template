import {
  AtSign,
  Check,
  FileScan,
  FileText,
  HardDrive,
  Info,
  Landmark,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  TRAFFICLIGHT_META,
  TRAFFICLIGHT_STYLES,
  trafficLightFromValue,
  DOCUMENTTYPE_META,
  documentTypeKey,
  isOverdue,
  confidenceTrafficLight,
  STATUS_META,
  WORKFLOW_META,
} from "@/lib/data/format";
import type { DocumentTax } from "@/lib/data/types";

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = status ? STATUS_META[status] : undefined;
  const label = status ? t(`documents.status.${status}`, { defaultValue: status }) : "—";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground border-transparent",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

// Recognition traffic light (DB column belege.traffic_light, from the pipeline A2/A6): a labeled pill
// with a solid dot — green = auto-accepted, yellow = confirm, red = review. Distinct from the
// per-field confidence dot (KonfidenzDot); this is the server-computed, check-capped verdict.
// Renders nothing when no value is set (older rows not yet scored), so it never shows an empty pill.
export function TrafficLightBadge({
  trafficLight,
  score,
  showScore = false,
  className,
}: {
  trafficLight: string | null | undefined;
  score?: number | null;
  // Show the numeric confidence inline (e.g. "· 96 %"). Off in the list (keeps the queue
  // clean); on for the detail screen where the exact value matters.
  showScore?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!trafficLight) return null;
  const key = trafficLightFromValue(trafficLight);
  const label = t(`documents.ampel.${key}`, { defaultValue: trafficLight });
  const pct = showScore && score != null ? Math.round(score * 100) : null;
  const title = pct == null ? label : `${label} (${pct} %)`;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", TRAFFICLIGHT_META[key].cls, className)}
      title={title}
    >
      <span className={cn("inline-block size-2 shrink-0 rounded-full", TRAFFICLIGHT_STYLES[key])} />
      {label}
      {pct != null && <span className="tabular-nums opacity-70">· {pct} %</span>}
    </Badge>
  );
}

// AI confidence on its own: how sure the extraction is, nothing else. Colored purely by the
// confidence band (green / amber / red), never by the checks, so it reads independently of review.
export function ConfidencePill({
  score,
  mitLabel = false,
  className,
}: {
  score: number | null | undefined;
  /**
   * Name the number instead of showing a bare percentage.
   *
   * In the invoice list the column header says what the figure is, so the pill only has to carry
   * the value. Standing on its own -- the detail header -- it has no header above it, and "96 %"
   * next to a due date is a percentage of nothing in particular.
   */
  mitLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const band = confidenceTrafficLight(score);
  const pct = score != null ? Math.round(score * 100) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        TRAFFICLIGHT_META[band].cls,
        className,
      )}
    >
      <span
        className={cn("inline-block size-2 shrink-0 rounded-full", TRAFFICLIGHT_STYLES[band])}
      />
      {pct == null
        ? t("documents.konfidenz.keine")
        : mitLabel
          ? t("documents.detail.konfidenz.prozent", { percent: pct })
          : `${pct} %`}
    </span>
  );
}

export function WorkflowBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = (status && WORKFLOW_META[status]) || WORKFLOW_META.received;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        meta.cls,
        className,
      )}
    >
      {t(`documents.workflow.${status}`, { defaultValue: status ?? "—" })}
    </span>
  );
}

const CHANNEL_ICONS = new Map<string, typeof AtSign>([
  ["email", AtSign],
  ["upload", Upload],
  ["scan", FileScan],
  ["erechnung", FileText],
  ["drive", HardDrive],
]);

export function ChannelBadge({
  channel,
  className,
}: {
  channel: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = (channel && CHANNEL_ICONS.get(channel)) || AtSign;
  const label = channel ? t(`documents.kanal.${channel}`, { defaultValue: channel }) : "—";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

// ust_satz > 0 → "USt 19 %" (Teal), sonst "0 %" (neutral, ohne Vorsteuer).
export function VatBadge({
  vatRate,
  tax,
  className,
}: {
  vatRate: number | null | undefined;
  // The per-rate breakdown (invoices.tax). A German invoice routinely carries more than one rate
  // (a hotel bill is 7 % on the room and 19 % on breakfast and parking), but `vat_rate` is a single
  // column and holds only one of them. Showing that one rate alone stated something the document
  // does not say: a 169,18 € Motel One bill read as "USt 19 %" while its actual VAT was 11,23 €,
  // which is 7,1 % blended. When the breakdown says more than one rate applies, say so instead of
  // picking one. Optional so call sites without the breakdown keep the old single-rate behaviour.
  tax?: DocumentTax[] | null;
  className?: string;
}) {
  const { t } = useTranslation();
  // THREE CASES, not two. "0 %" was shown both for a document that states 0 % VAT and for one where
  // no rate was recognized at all, and it left the reader to work out what 0 % is supposed to mean.
  // A stated zero is an exempt supply (or a small-business supplier); an unknown one is a gap.
  const rate = vatRate ?? null;
  const relevant = (rate ?? 0) > 0;

  // Only rates that actually carry net amounts count as "applied". A 0 % line alongside a 19 % one
  // is normal on an invoice with an exempt position and is not a mixed-rate case worth flagging.
  const rates = [
    ...new Set(
      (tax ?? [])
        .filter((s) => (s?.net ?? 0) !== 0 && (s?.rate ?? 0) > 0)
        .map((s) => s.rate as number),
    ),
  ].sort((a, b) => a - b);
  const mixed = rates.length > 1;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        relevant || mixed ? "bg-brand-wash text-brand-dark" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        mixed
          ? t("documents.badge.ustGemischtTitle", { rates: rates.join(" %, ") })
          : relevant
            ? t("documents.badge.ustRelevantTitle")
            : rate === 0
              ? t("documents.badge.ustFreiTitle")
              : t("documents.badge.ustUnbekanntTitle")
      }
    >
      {mixed
        ? t("documents.badge.ustGemischt")
        : relevant
          ? `${t("documents.badge.ustAbbr")} ${rate} %`
          : rate === 0
            ? t("documents.badge.ustFrei")
            : t("documents.badge.ustUnbekannt")}
    </span>
  );
}

// Payment state derived from bezahlt_am: paid → green "Bezahlt", otherwise "Offen".
export function PaymentBadge({
  paidAm,
  className,
}: {
  paidAm: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const paid = !!paidAm;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        paid ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
        className,
      )}
      title={paid ? t("documents.badge.bezahltTitle") : t("documents.badge.offenTitle")}
    >
      {paid ? t("documents.badge.bezahlt") : t("documents.badge.offen")}
    </span>
  );
}

// Bank-reconciliation state for the combined "Zahlung & Bank-Abgleich" column: whether a bank
// transaction has been matched to this invoice, and whether that match is still open.
//
// Renders all THREE states including "not matched", rather than disappearing when there is no
// match. It sits under the payment badge as the second line of one cell, so a blank line would
// read as "unknown" instead of "no bank transaction is linked yet" -- which is a real, actionable
// state, not an absence. 'auto' counts as SUGGESTED, not confirmed: the matcher writes it without
// asking, so a human still has to look.
export function BankMatchBadge({
  hasConfirmed,
  hasSuggested,
  showWhenEmpty = false,
  className,
}: {
  hasConfirmed: boolean;
  hasSuggested: boolean;
  showWhenEmpty?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // CONFIRMED wins over suggested, not the other way round. invoice_transaction_matches is m:n, and
  // confirming one candidate does not withdraw its siblings -- they stay 'candidate'. With
  // suggested-first, a fully reconciled invoice kept rendering amber "Zuordnung offen" forever,
  // and the same row was returned by both the "Zuordnung offen" and "Zugeordnet" filters.
  if (!hasConfirmed && !hasSuggested && !showWhenEmpty) return null;
  const key = hasConfirmed ? "Zugeordnet" : hasSuggested ? "Vorschlag" : "Offen";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        hasSuggested
          ? "bg-amber-100 text-amber-800"
          : hasConfirmed
            ? "bg-emerald-100 text-emerald-800"
            : "bg-muted text-muted-foreground",
        className,
      )}
      title={t(`documents.badge.bankMatch${key}Title`)}
    >
      <Landmark className="size-3" />
      {t(`documents.badge.bankMatch${key}`)}
    </span>
  );
}

// DATEV handover state derived from handed_over_at: handed over → green "Übergeben",
// otherwise "Offen". Two-state (always visible either way), unlike DatevBereitBadge above which
// is shown only when true — this is for a dedicated yes/no list column, not a positive-only chip.
export function DatevHandoverBadge({
  handedOverAt,
  className,
}: {
  handedOverAt: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const handOver = !!handedOverAt;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        handOver ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        handOver ? t("documents.badge.datevUebergebenTitle") : t("documents.badge.datevOffenTitle")
      }
    >
      {handOver ? t("documents.badge.datevUebergeben") : t("documents.badge.datevOffen")}
    </span>
  );
}

// Outgoing-invoice status (Briefing Screen 15) — renders status ('draft'/'open'/
// 'paidoff'/'voided', set via migration 0085's set_uploaded_outgoing_invoice_status RPC or its
// auto-match trigger). "Überfällig" isn't a stored status; it's derived here from status='open'
// + a past due date, same rule the server function's sync uses to decide whether to even look
// up a dunning at all.
export function OutgoingStatusBadge({
  status,
  dueDate,
  className,
}: {
  status: string | null | undefined;
  dueDate: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const overdue = isOverdue(status, dueDate, today);
  const key =
    status === "paidoff"
      ? "paid"
      : status === "voided"
        ? "voided"
        : status === "draft"
          ? "draft"
          : overdue
            ? "overdue"
            : "open";
  const cls: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    voided: "bg-muted text-muted-foreground line-through",
    overdue: "bg-destructive/10 text-destructive",
    draft: "bg-amber-100 text-amber-800",
    open: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        cls[key],
        className,
      )}
    >
      {t(`outgoingInvoices.status.${key}`)}
    </span>
  );
}

export function CompanyChip({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!code) {
    return (
      <span
        className={cn(
          // Amber, not grey. An invoice cannot move on without a company, so this is a gap to
          // close rather than a value like any other, and in grey it read as one more code among
          // the rest while being the most common thing on the screen.
          "inline-flex items-center whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
          className,
        )}
        title={t("documents.badge.gesellschaftOhneTitle")}
      >
        {t("documents.badge.gesellschaftOhne")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-brand-wash px-2 py-0.5 font-mono text-xs font-medium text-brand-dark",
        className,
      )}
    >
      {code}
    </span>
  );
}

// Document type. Non-invoice types (Mahnung/Angebot/Kontoauszug) are colored so they
// stand out from real payable invoices in the queue.
export function DocumentTypeBadge({
  documentType,
  className,
}: {
  documentType: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const key = documentTypeKey(documentType);
  const meta = key ? DOCUMENTTYPE_META.get(key) : undefined;
  // Falls back to the stored value made readable ("kein_beleg" -> "Kein beleg") rather than
  // printing it raw, so an unknown type from the pipeline still reads as a word.
  const label = key
    ? t(`documents.belegart.${key}`, {
        defaultValue: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      })
    : "—";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        meta?.cls ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

// Direct-debit warning: the invoice is auto-collected, so a bank transfer would pay it
// twice. Money-safety flag — deliberately loud.
export function DirectDebitBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
      title={t("documents.badge.lastschriftTitle")}
    >
      <Landmark className="size-3.5 shrink-0" />
      {t("documents.badge.lastschrift")}
    </span>
  );
}

// Briefing Screen 12 warning: "when an invoice contains a different IBAN, show the previous and
// new IBAN side by side for human review. Do not block the process automatically." — non-blocking,
// deliberately loud, same shape as LastschriftBadge. `oldIban`/`newIban` render side by side in the
// tooltip; callers pass the already-formatted (formatIBAN) strings.
export function IbanChangedBadge({
  oldIban,
  newIban,
  initial = false,
  className,
}: {
  oldIban: string;
  newIban: string;
  /**
   * True when no IBAN was on file before, i.e. this is the first capture rather than a change.
   * Renders as a quiet, neutral note instead of the amber warning: a first capture is a normal
   * event, and firing the bank-swap warning for it is what teaches people to ignore the warning.
   */
  initial?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (initial) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
        title={t("documents.badge.ibanErfasstTitle", { new: newIban })}
      >
        <Info className="size-3.5 shrink-0" />
        {t("documents.badge.ibanErfasst")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
      title={t("documents.badge.ibanGeaendertTitle", { alt: oldIban, new: newIban })}
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      {t("documents.badge.ibanGeaendert")}
    </span>
  );
}

// Briefing Screen 12 warning: "warn about an unusual amount only when the supplier normally has
// stable invoice amounts" — see detectUnusualAmounts() in src/lib/data/format.ts for the gating
// logic. Non-blocking, same shape as LastschriftBadge/IbanChangedBadge.
export function UnusualAmountBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
      title={t("documents.badge.unusualAmountTitle")}
    >
      {/* Info: the briefing calls this non-blocking, and nothing has to be done about it. The
          warning triangle claimed otherwise, which is the confusion Saskia reported. */}
      <Info className="size-3.5 shrink-0" />
      {t("documents.badge.unusualAmount")}
    </span>
  );
}

// Briefing Screen 6: "whether a receipt is already DATEV-ready should be visible on the receipt".
// Positive-only, like LastschriftBadge — the absence of the badge already reads as "not yet".
export function DatevReadyBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800",
        className,
      )}
      title={t("documents.badge.datevBereitTitle")}
    >
      <Check className="size-3.5 shrink-0" />
      {t("documents.badge.datevBereit")}
    </span>
  );
}

// Konfidenz-Ampel je Feld (aus extracted.konfidenz).
/**
 * How sure the AI is about THIS ONE field.
 *
 * A 8px dot with nothing but a native `title` was a mark most readers never worked out: it says
 * nothing about what it measures, and the colours only mean something to somebody who already
 * knows the bands. It now carries a real tooltip that names the axis, gives the number, and prints
 * the whole scale, so one hover explains every dot on the screen rather than just this one.
 */
export function ConfidenceDot({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const trafficLight = confidenceTrafficLight(score);
  const label = t(`documents.konfidenz.${trafficLight}`);
  const value = score == null ? label : `${Math.round(score * 100)} %`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
            TRAFFICLIGHT_STYLES[trafficLight],
            className,
          )}
          aria-label={`${t("documents.konfidenz.feldTitel")}: ${value}`}
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">
        <div className="font-medium">
          {t("documents.konfidenz.feldTitel")}: {value}
        </div>
        <div className="mt-1 opacity-80">{label}</div>
        {/* The whole scale, not just this dot's band. The colours are only readable as a scale,
            and a reader who has to hover three dots to infer it has been given a puzzle. */}
        <ul className="mt-2 space-y-1">
          {(["green", "yellow", "red"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span
                className={cn("inline-block size-2 shrink-0 rounded-full", TRAFFICLIGHT_STYLES[k])}
              />
              <span>{t(`documents.konfidenz.skala.${k}`)}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
