// Hand-rolled RFC 2822 multipart/mixed message builder for the DATEV handover (Briefing Screen
// 9), consumed by src/lib/graph/send-mail.server.ts. No MIME library exists in this repo and this
// is a small, bounded amount of format — not worth adding a dependency for.

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function encodeHeaderText(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64Encode(new TextEncoder().encode(value))}?=`;
}

// Filenames come straight from user-uploaded invoice_files.filename with no prior sanitization.
// They're interpolated unescaped into quoted header values below — a CR/LF, quote, or backslash
// in one could break MIME header syntax or inject extra header/body content into the email sent
// to the tax advisor's DATEV mailbox. Beyond that, non-ASCII characters in a bare quoted
// filename="..." parameter aren't valid RFC 2045 header text either (that needs RFC 2231
// extended-parameter syntax, which not every mail parser implements) — DATEV Upload Mail is an
// older, narrowly-scoped ingestion pipeline with no documented stance on this, so rather than bet
// on it tolerating raw UTF-8 or implementing RFC 2231, transliterate the common German
// characters and drop anything else non-ASCII outright. Plain ASCII is the one encoding every
// mail parser is guaranteed to read back correctly.
function sanitizeFilename(name: string): string {
  const transliterated = name
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue");
  const cleaned = transliterated
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n"\\\x00-\x1f]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim();
  return cleaned === "" ? "attachment" : cleaned;
}

function base64Lines(bytes: Uint8Array): string[] {
  const b64 = base64Encode(bytes);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines;
}

// Returns the standard-base64 raw message Graph's sendMail expects as its text/plain body.
// Standard base64, NOT base64url: the Gmail transport this replaced needed base64url for its
// `raw` JSON field, Graph does not, and feeding it -/_ would corrupt the message.
export function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  attachments: EmailAttachment[];
}): string {
  const boundary = `datev-${crypto.randomUUID()}`;
  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderText(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...base64Lines(new TextEncoder().encode(opts.bodyText)),
    "",
  ];

  for (const att of opts.attachments) {
    const filename = sanitizeFilename(att.filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      ...base64Lines(att.bytes),
      "",
    );
  }
  lines.push(`--${boundary}--`);

  return base64Encode(new TextEncoder().encode(lines.join("\r\n")));
}
