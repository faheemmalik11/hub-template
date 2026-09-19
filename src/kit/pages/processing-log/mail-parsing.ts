/** A mail sender, split into the two things an RFC-5322 From header actually holds. */
export type ParsedSender = {
  /** Display name, unquoted. Null when the header carried only an address. */
  name: string | null;
  /** Mail address, without angle brackets. Null when the value is not an address at all. */
  address: string | null;
  /** The header exactly as stored, for the title attribute and the detail view. */
  raw: string;
};

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

export type ReasonVerdict = "needs_review" | "accepted" | null;

export type ParsedReason = {
  verdict: ReasonVerdict;
  /** The individual findings, in source order, verbatim and without their trailing full stop. */
  causes: string[];
  /** The reason exactly as stored. */
  raw: string;
};

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
