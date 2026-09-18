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
  AMPEL_META,
  AMPEL_STYLES,
  ampelFromValue,
  BELEGART_META,
  belegartKey,
  istUeberfaellig,
  konfidenzAmpel,
  STATUS_META,
  WORKFLOW_META,
} from "@/lib/data/format";
import type { BelegSteuer } from "@/lib/data/types";

export function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const meta = status ? STATUS_META[status] : undefined;
  const label = status ? t(`belege.status.${status}`, { defaultValue: status }) : "—";
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
export function AmpelBadge({
  ampel,
  score,
  showScore = false,
  className,
}: {
  ampel: string | null | undefined;
  score?: number | null;
  // Show the numeric confidence inline (e.g. "· 96 %"). Off in the list (keeps the queue
  // clean); on for the detail screen where the exact value matters.
  showScore?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!ampel) return null;
  const key = ampelFromValue(ampel);
  const label = t(`belege.ampel.${key}`, { defaultValue: ampel });
  const pct = showScore && score != null ? Math.round(score * 100) : null;
  const title = pct == null ? label : `${label} (${pct} %)`;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", AMPEL_META[key].cls, className)}
      title={title}
    >
      <span className={cn("inline-block size-2 shrink-0 rounded-full", AMPEL_STYLES[key])} />
      {label}
      {pct != null && <span className="tabular-nums opacity-70">· {pct} %</span>}
    </Badge>
  );
}

// AI confidence on its own: how sure the extraction is, nothing else. Colored purely by the
// confidence band (green / amber / red), never by the checks, so it reads independently of review.
export function KonfidenzPill({
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
  const band = konfidenzAmpel(score);
  const pct = score != null ? Math.round(score * 100) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        AMPEL_META[band].cls,
        className,
      )}
    >
      <span className={cn("inline-block size-2 shrink-0 rounded-full", AMPEL_STYLES[band])} />
      {pct == null
        ? t("belege.konfidenz.keine")
        : mitLabel
          ? t("belege.detail.konfidenz.prozent", { prozent: pct })
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
  const meta = (status && WORKFLOW_META[status]) || WORKFLOW_META.eingegangen;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        meta.cls,
        className,
      )}
    >
      {t(`belege.workflow.${status}`, { defaultValue: status ?? "—" })}
    </span>
  );
}

const KANAL_ICONS: Record<string, typeof AtSign> = {
  email: AtSign,
  upload: Upload,
  scan: FileScan,
  erechnung: FileText,
  drive: HardDrive,
};

export function KanalBadge({
  kanal,
  className,
}: {
  kanal: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = (kanal && KANAL_ICONS[kanal]) || AtSign;
  const label = kanal ? t(`belege.kanal.${kanal}`, { defaultValue: kanal }) : "—";
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
export function UstBadge({
  ustSatz,
  steuer,
  className,
}: {
  ustSatz: number | null | undefined;
  // The per-rate breakdown (invoices.tax). A German invoice routinely carries more than one rate
  // (a hotel bill is 7 % on the room and 19 % on breakfast and parking), but `vat_rate` is a single
  // column and holds only one of them. Showing that one rate alone stated something the document
  // does not say: a 169,18 € Motel One bill read as "USt 19 %" while its actual VAT was 11,23 €,
  // which is 7,1 % blended. When the breakdown says more than one rate applies, say so instead of
  // picking one. Optional so call sites without the breakdown keep the old single-rate behaviour.
  steuer?: BelegSteuer[] | null;
  className?: string;
}) {
  const { t } = useTranslation();
  // THREE CASES, not two. "0 %" was shown both for a document that states 0 % VAT and for one where
  // no rate was recognized at all, and it left the reader to work out what 0 % is supposed to mean.
  // A stated zero is an exempt supply (or a small-business supplier); an unknown one is a gap.
  const satz = ustSatz ?? null;
  const relevant = (satz ?? 0) > 0;

  // Only rates that actually carry net amounts count as "applied". A 0 % line alongside a 19 % one
  // is normal on an invoice with an exempt position and is not a mixed-rate case worth flagging.
  const saetze = [
    ...new Set(
      (steuer ?? [])
        .filter((s) => (s?.netto ?? 0) !== 0 && (s?.satz ?? 0) > 0)
        .map((s) => s.satz as number),
    ),
  ].sort((a, b) => a - b);
  const gemischt = saetze.length > 1;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
        relevant || gemischt ? "bg-brand-wash text-brand-dark" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        gemischt
          ? t("belege.badge.ustGemischtTitle", { saetze: saetze.join(" %, ") })
          : relevant
            ? t("belege.badge.ustRelevantTitle")
            : satz === 0
              ? t("belege.badge.ustFreiTitle")
              : t("belege.badge.ustUnbekanntTitle")
      }
    >
      {gemischt
        ? t("belege.badge.ustGemischt")
        : relevant
          ? `${t("belege.badge.ustAbbr")} ${satz} %`
          : satz === 0
            ? t("belege.badge.ustFrei")
            : t("belege.badge.ustUnbekannt")}
    </span>
  );
}

// Payment state derived from bezahlt_am: paid → green "Bezahlt", otherwise "Offen".
export function ZahlungBadge({
  bezahltAm,
  className,
}: {
  bezahltAm: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const bezahlt = !!bezahltAm;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        bezahlt ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
        className,
      )}
      title={bezahlt ? t("belege.badge.bezahltTitle") : t("belege.badge.offenTitle")}
    >
      {bezahlt ? t("belege.badge.bezahlt") : t("belege.badge.offen")}
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
  // confirming one candidate does not withdraw its siblings -- they stay 'kandidat'. With
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
      title={t(`belege.badge.bankMatch${key}Title`)}
    >
      <Landmark className="size-3" />
      {t(`belege.badge.bankMatch${key}`)}
    </span>
  );
}

// DATEV handover state derived from datev_handed_over_at: handed over → green "Übergeben",
// otherwise "Offen". Two-state (always visible either way), unlike DatevBereitBadge above which
// is shown only when true — this is for a dedicated yes/no list column, not a positive-only chip.
export function DatevUebergabeBadge({
  handedOverAt,
  className,
}: {
  handedOverAt: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const uebergeben = !!handedOverAt;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        uebergeben ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground",
        className,
      )}
      title={
        uebergeben ? t("belege.badge.datevUebergebenTitle") : t("belege.badge.datevOffenTitle")
      }
    >
      {uebergeben ? t("belege.badge.datevUebergeben") : t("belege.badge.datevOffen")}
    </span>
  );
}

// Outgoing-invoice status (Briefing Screen 15) — renders voucher_status ('draft'/'open'/
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
  const overdue = istUeberfaellig(status, dueDate, today);
  const key =
    status === "paidoff"
      ? "bezahlt"
      : status === "voided"
        ? "storniert"
        : status === "draft"
          ? "entwurf"
          : overdue
            ? "ueberfaellig"
            : "offen";
  const cls: Record<string, string> = {
    bezahlt: "bg-emerald-100 text-emerald-800",
    storniert: "bg-muted text-muted-foreground line-through",
    ueberfaellig: "bg-destructive/10 text-destructive",
    entwurf: "bg-amber-100 text-amber-800",
    offen: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        cls[key],
        className,
      )}
    >
      {t(`ausgangsrechnungen.status.${key}`)}
    </span>
  );
}

export function GesellschaftChip({
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
        title={t("belege.badge.gesellschaftOhneTitle")}
      >
        {t("belege.badge.gesellschaftOhne")}
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
export function BelegartBadge({
  belegart,
  className,
}: {
  belegart: string | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const key = belegartKey(belegart);
  const meta = key ? BELEGART_META[key] : undefined;
  // Falls back to the stored value made readable ("kein_beleg" -> "Kein beleg") rather than
  // printing it raw, so an unknown type from the pipeline still reads as a word.
  const label = key
    ? t(`belege.belegart.${key}`, {
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
export function LastschriftBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
      title={t("belege.badge.lastschriftTitle")}
    >
      <Landmark className="size-3.5 shrink-0" />
      {t("belege.badge.lastschrift")}
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
  erstmalig = false,
  className,
}: {
  oldIban: string;
  newIban: string;
  /**
   * True when no IBAN was on file before, i.e. this is the first capture rather than a change.
   * Renders as a quiet, neutral note instead of the amber warning: a first capture is a normal
   * event, and firing the bank-swap warning for it is what teaches people to ignore the warning.
   */
  erstmalig?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (erstmalig) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
        title={t("belege.badge.ibanErfasstTitle", { neu: newIban })}
      >
        <Info className="size-3.5 shrink-0" />
        {t("belege.badge.ibanErfasst")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
      title={t("belege.badge.ibanGeaendertTitle", { alt: oldIban, neu: newIban })}
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      {t("belege.badge.ibanGeaendert")}
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
      title={t("belege.badge.unusualAmountTitle")}
    >
      {/* Info: the briefing calls this non-blocking, and nothing has to be done about it. The
          warning triangle claimed otherwise, which is the confusion Saskia reported. */}
      <Info className="size-3.5 shrink-0" />
      {t("belege.badge.unusualAmount")}
    </span>
  );
}

// Briefing Screen 6: "whether a receipt is already DATEV-ready should be visible on the receipt".
// Positive-only, like LastschriftBadge — the absence of the badge already reads as "not yet".
export function DatevBereitBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800",
        className,
      )}
      title={t("belege.badge.datevBereitTitle")}
    >
      <Check className="size-3.5 shrink-0" />
      {t("belege.badge.datevBereit")}
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
export function KonfidenzDot({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  const ampel = konfidenzAmpel(score);
  const label = t(`belege.konfidenz.${ampel}`);
  const wert = score == null ? label : `${Math.round(score * 100)} %`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10",
            AMPEL_STYLES[ampel],
            className,
          )}
          aria-label={`${t("belege.konfidenz.feldTitel")}: ${wert}`}
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">
        <div className="font-medium">
          {t("belege.konfidenz.feldTitel")}: {wert}
        </div>
        <div className="mt-1 opacity-80">{label}</div>
        {/* The whole scale, not just this dot's band. The colours are only readable as a scale,
            and a reader who has to hover three dots to infer it has been given a puzzle. */}
        <ul className="mt-2 space-y-1">
          {(["gruen", "gelb", "rot"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("inline-block size-2 shrink-0 rounded-full", AMPEL_STYLES[k])} />
              <span>{t(`belege.konfidenz.skala.${k}`)}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
