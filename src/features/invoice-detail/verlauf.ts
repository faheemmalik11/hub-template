/**
 * Pure helpers for reading the approval history (invoice_history rows) back into the reader's
 * language. Shared by the workflow-history timeline and the workflow bar's query marker.
 *
 * Portable: nothing in here is repo-specific — the repo differences these helpers depend on
 * (action ids, legacy vocabularies, action→status map) all come in from ./config.
 */
import {
  approvalActionLabelDe,
  workflowLabelDe,
  WORKFLOW_REIHENFOLGE,
  type ApprovalActionId,
} from "@/lib/data/format";
import type { BelegVerlauf } from "@/lib/data/types";

import { AKTION_ZIELSTATUS, APPROVAL_VERLAUF_TYPES, LEGACY_ACTION_IDS } from "./config";

// `t` is passed in so this stays a plain helper (no hook) while still translating.
export function verlaufTypLabel(typ: string, t: (key: string) => string): string {
  const known = [
    "notiz",
    "statuswechsel",
    "aenderung",
    "zuweisung",
    "zuordnung",
    "loeschung",
    "regel",
    "nicht_relevant",
    "archiviert",
    ...APPROVAL_VERLAUF_TYPES,
  ];
  return known.includes(typ) ? t(`belege.detail.verlaufTyp.${typ}`) : typ;
}

/** The action a legacy row recorded, read back out of its German audit sentence. */
function legacyAktionAusText(text: string): ApprovalActionId | null {
  for (const id of LEGACY_ACTION_IDS) {
    const de = approvalActionLabelDe(id);
    if (!de || de === id) continue;
    if (text === de || text.startsWith(`${de}: `)) return id;
  }
  return null;
}

/** The target of a legacy "Manuell korrigiert: X → Y" row, as a status code. */
function legacyKorrekturZiel(text: string): string | null {
  const treffer = /^Manuell korrigiert:\s*.+?\s*→\s*(.+)$/.exec(text.trim());
  if (!treffer) return null;
  return WORKFLOW_REIHENFOLGE.find((s) => workflowLabelDe(s) === treffer[1].trim()) ?? null;
}

/**
 * The person's own words on this entry, or null.
 *
 * Only the comment — the label around it now lives in the heading (verlaufTitel), so repeating it
 * here would put the row back to saying the same thing twice. A comment is never translated; it is
 * what somebody typed.
 */
export function verlaufKommentar(v: BelegVerlauf): string | null {
  const gespeichert = v.data?.kommentar;
  if (typeof gespeichert === "string" && gespeichert.trim() !== "") return gespeichert.trim();
  // `grund` as well as `kommentar`. The workflow actions write the reason under `kommentar`, the
  // unlink path writes it under `grund`, and reading only the first meant an unlink recorded its
  // reason and then showed nothing: the text was in the row all along, just under the other key.
  const grund = (v.data as { grund?: unknown } | null)?.grund;
  if (typeof grund === "string" && grund.trim() !== "") return grund.trim();
  // Legacy: "<German action label>: <comment>". Without the prefix there is no comment, just the
  // label, which the heading already shows.
  const text = v.text?.trim();
  if (!text) return null;
  const id = legacyAktionAusText(text);
  if (!id) return null;
  const de = approvalActionLabelDe(id);
  return text.length > de.length + 2 ? text.slice(de.length + 2) : null;
}

/**
 * The status an entry moved the invoice INTO, or null for an entry that moved nothing.
 *
 * Corrections and approval actions record it differently (`korrektur_nach` vs `nach`) because they
 * are written by different code paths; every reader wants the same answer, so it is resolved once
 * here. Null for anything written before these fields existed, and for entries like a note or an
 * assignment that genuinely do not move the invoice.
 */
export function verlaufZielStatus(v: BelegVerlauf): string | null {
  const d = v.data as { korrektur_nach?: unknown; nach?: unknown } | null;
  const roh = d?.korrektur_nach ?? d?.nach;
  if (typeof roh === "string" && roh.trim() !== "") return roh;
  // An older row, with nothing stored but the German audit sentence. Recover the action from it
  // and look up where that action lands. Approximate for one case only -- `approve` is mapped to
  // the assistant step, which is where it lands in every chain that has one -- and only ever used
  // for rows old enough to have no stored target at all.
  const aus = v.text ? legacyAktionAusText(v.text.trim()) : null;
  return aus ? (AKTION_ZIELSTATUS[aus] ?? null) : legacyKorrekturZiel(v.text ?? "");
}

/**
 * ONE LINE PER ENTRY: what the invoice became, and — in brackets — how, when it was not a plain
 * step along the chain.
 *
 * Every row used to print two: the event TYPE ("Checked & approved") above the action label
 * ("Send for review"). The pair said the same thing twice in different vocabularies, and neither
 * half named the state the invoice ended up in, so five rows of a real history read as three
 * repetitions of "Checked & approved". The state is the only part worth logging; the mechanism is
 * a qualifier on it, not a heading of its own.
 */
export function verlaufBasis(
  v: BelegVerlauf,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const ziel = verlaufZielStatus(v);
  return ziel
    ? t(`belege.detail.historie.${ziel}`, {
        defaultValue: t(`belege.workflow.${ziel}`, { defaultValue: ziel }),
      })
    : verlaufTypLabel(v.type, t);
}

/** How the invoice got there, when it was not a plain step along the chain. Null when it was. */
export function verlaufZusatz(
  v: BelegVerlauf,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (v.type === "korrektur") return t("belege.detail.historie.korrigiert");
  // Its own name, not "manually corrected". The status did move, but nobody set it: a
  // payment came off and the status followed. Without this the chip fell through to the
  // generic reason chip and read simply "Grund", which named no action at all.
  if (v.type === "zuordnung_getrennt") return t("belege.detail.historie.zuordnungGetrennt");
  if (v.type === "zuordnung_bestaetigt") return t("belege.detail.historie.zuordnungBestaetigt");
  if (v.type === "rueckfrage") return t("belege.detail.historie.rueckfrageZusatz");
  // WHICH of the three payment routes reached 'bezahlt'. The timeline titles every row by the
  // state it reached, so a manual mark, a confirmed bank match and a BANKSapi transfer all read
  // as a bare "Bezahlt" -- three quite different assertions about where the money went, told
  // apart nowhere on the page. The manner was already in the row's German audit sentence, which
  // this timeline never prints; the trigger now stores it as data.paid_source so it can be said
  // in the reader's own language.
  if (v.type === "bezahlt") {
    const quelle = (v.data as { paid_source?: unknown } | null)?.paid_source;
    if (typeof quelle === "string" && quelle.trim() !== "") {
      return t(`belege.detail.historie.bezahltVia.${quelle}`, {
        defaultValue: t("belege.detail.historie.bezahltVia.manual"),
      });
    }
  }
  return null;
}

export function verlaufZeilen(
  v: BelegVerlauf,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  const lines = v.data?.lines;
  if (Array.isArray(lines)) {
    const strings = lines.filter((l): l is string => typeof l === "string" && l.trim() !== "");
    if (strings.length > 0) return strings;
  }
  // EVENTS FIRST. The status-move branch below returns early, so an unlink -- which
  // carries both a target status and an event -- never reached this and rendered either
  // the bare reason or, with no reason, nothing at all. Naming the action is the point.
  // A machine-written row, rendered from what it stored rather than from the German sentence it
  // also stored. The trigger keeps writing that sentence unchanged (an audit trail should not
  // start rewording itself), so this is a display layer: `data.event` when the row has one, the
  // stored text when it does not, which is every row written before migration 20260911220000.
  const event = (v.data as { event?: unknown } | null)?.event;
  if (typeof event === "string" && event !== "") {
    const d = v.data as Record<string, unknown>;
    const zahl = (x: unknown) =>
      typeof x === "number" ? x.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : String(x);
    if (event === "paid_from_match") {
      return [
        d.skonto != null
          ? t("belege.detail.historie.event.paidFromMatchSkonto", { skonto: zahl(d.skonto) })
          : t("belege.detail.historie.event.paidFromMatch"),
      ];
    }
    if (event === "match_confirmed") return [t("belege.detail.historie.event.matchConfirmed")];
    if (event === "match_rejected") {
      const grund = verlaufKommentar(v);
      return [
        grund
          ? t("belege.detail.historie.event.matchRejectedGrund", { grund })
          : t("belege.detail.historie.event.matchRejected"),
      ];
    }
    if (event === "match_unlinked") {
      const grund = verlaufKommentar(v);
      return [
        grund
          ? t("belege.detail.historie.event.matchUnlinkedGrund", { grund })
          : t("belege.detail.historie.event.matchUnlinked"),
      ];
    }
    if (event === "remainder_reopened") {
      return [t("belege.detail.historie.event.remainderReopened")];
    }
    if (event === "remainder_written_off") {
      const grund = verlaufKommentar(v);
      return [
        grund
          ? t("belege.detail.historie.event.remainderWrittenOffGrund", { grund })
          : t("belege.detail.historie.event.remainderWrittenOff"),
      ];
    }
    if (event === "payment_withdrawn") {
      return [
        t("belege.detail.historie.event.paymentWithdrawn", {
          matched: zahl(d.matched),
          gross: zahl(d.gross),
        }),
      ];
    }
  }

  // An approval entry: the heading carries the label, so the only thing left to show is what the
  // person wrote. Entries this page does not model (a note, an assignment) keep their stored text.
  if (
    verlaufZielStatus(v) !== null ||
    v.type === "korrektur" ||
    v.type === "zuordnung_getrennt" ||
    v.type === "zuordnung_bestaetigt" ||
    v.type === "rueckfrage"
  ) {
    const kommentar = verlaufKommentar(v);
    return kommentar ? [kommentar] : [];
  }
  return v.text && v.text.trim() !== "" ? [v.text] : [];
}
