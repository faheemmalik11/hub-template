/**
 * Presentation helpers for the Protokoll screen's two worst columns.
 *
 * Both fix findings from docs/audit/protokoll/processing-log/ISSUES.md, and both are deliberately
 * pure functions with no i18n inside them: what they produce is STRUCTURE, not translated text.
 *
 * That distinction matters here. `processing_log.reason` and `.sender` are values the ingestion
 * pipeline wrote, and the audit is explicit that they are "correctly not run through i18n". So
 * nothing below rewrites a stored string. What it does instead is take the structure that is already
 * in those strings — a sender header is a name and an address; a reason is a verdict plus a list of
 * findings — and hand the component the parts, so it can render a sender as a sender and a reason as
 * a list of causes rather than printing either as one truncated blob.
 */

/** A mail sender, split into the two things an RFC-5322 From header actually holds. */
export type ParsedSender = {
  /** Display name, unquoted. Null when the header carried only an address. */
  name: string | null;
  /** Mail address, without angle brackets. Null when the value is not an address at all. */
  address: string | null;
  /** The header exactly as stored, for the title attribute and the detail view. */
  raw: string;
};

/**
 * Splits a From header into name and address.
 *
 * Issue #6: the column printed the raw header, so a cell could read
 * `"Linda Spiegelberg | Immobilienverwaltung Walther GmbH & Co. KG" <lsp@immo-walther.de>` next to a
 * bare `buchhaltung@netz-immo.de`. Quoting and angle brackets were never stripped and the two shapes
 * never lined up.
 *
 * Not every value is a mail address: this log also carries `scan_folder` for documents picked up from
 * a watched directory. Those come back as a name with no address, which is the honest reading.
 */
export function parseSender(raw: string | null | undefined): ParsedSender {
  const value = (raw ?? "").trim();
  if (!value) return { name: null, address: null, raw: "" };

  // `Name <addr>` or `"Name" <addr>`. The name half is greedy-free so a `>` inside a display name
  // cannot swallow the address.
  const withAngle = value.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (withAngle) {
    const name = unquote(withAngle[1]);
    return { name: name || null, address: withAngle[2].trim() || null, raw: value };
  }

  // A bare address.
  if (/^[^\s"<>]+@[^\s"<>]+$/.test(value)) return { name: null, address: value, raw: value };

  // Anything else — `scan_folder`, a system label — is a name with no address.
  return { name: unquote(value) || null, address: null, raw: value };
}

function unquote(s: string): string {
  const t = s.trim();
  return t.startsWith('"') && t.endsWith('"') && t.length > 1 ? t.slice(1, -1).trim() : t;
}

/** How a parsed sender should read on one line, when only one line is available. */
export function senderOneLine(s: ParsedSender): string {
  if (s.name && s.address) return `${s.name} · ${s.address}`;
  return s.address ?? s.name ?? "—";
}

/**
 * The pipeline's overall verdict on a mail, lifted out of the reason string.
 *
 * These are the only two phrases the parser treats as chrome rather than content: they are lead-ins
 * that apply to every finding after them, not findings themselves, and printing them inline is what
 * made the cell "lead with an English phrase". As a tag they read as what they are — and the findings
 * they introduce stay verbatim.
 */
export type ReasonVerdict = "needs_review" | "accepted" | null;

export type ParsedReason = {
  verdict: ReasonVerdict;
  /** The individual findings, in source order, verbatim and without their trailing full stop. */
  causes: string[];
  /** The reason exactly as stored. */
  raw: string;
};

/**
 * Splits a reason into its verdict and its individual causes.
 *
 * Issue #5: five semicolon-separated findings were chained into one `truncate`d cell whose only full
 * copy lived in a `title` attribute. Live example, one cell:
 *
 *   "Needs review: relevance verdict: discard; Bruttobetrag fehlt; Rechnungsnummer oder Datum fehlt
 *    (§14 UStG, kein Kleinbetrag); Keine IBAN vorhanden, aber Überweisung erforderlich; Kein
 *    Empfängername (nicht Kleinbetrag)."
 *
 * The findings are `;`-separated, but a verdict can also start a new sentence mid-string — duplicate
 * detections read "möglicher Doppel-Beleg: … same invoice number 212 733 461 846. Needs review: no
 * company could be resolved…". So a full stop before a verdict is promoted to a separator first,
 * otherwise the duplicate finding and everything after it collapse into one giant cause.
 */
export function parseReason(raw: string | null | undefined): ParsedReason {
  const value = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return { verdict: null, causes: [], raw: "" };

  const promoted = value.replace(/\.\s+(?=(?:Needs review|Accepted automatically):)/g, "; ");
  let verdict: ReasonVerdict = null;
  const causes: string[] = [];

  for (const part of promoted.split(";")) {
    let segment = part.trim();
    if (!segment) continue;

    const lead = segment.match(/^(Needs review|Accepted automatically):\s*/);
    if (lead) {
      // Last one wins only if nothing has claimed it yet — a mail is either accepted or under
      // review, and the first verdict in the string is the one the pipeline reached first.
      verdict ??= lead[1] === "Needs review" ? "needs_review" : "accepted";
      segment = segment.slice(lead[0].length).trim();
      if (!segment) continue;
    }

    // Trailing full stop on the last finding only — dropping it everywhere keeps the list even.
    causes.push(segment.replace(/\.$/, "").trim());
  }

  return { verdict, causes, raw: value };
}
