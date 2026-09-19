// Sends a raw RFC 2822 message via Microsoft Graph (DATEV handover, Briefing Screen 9).
//
// Replaces the previous Gmail transport (src/lib/google/), which could never have worked here:
// it authenticated a Google service account with domain-wide delegation over the sender's
// domain, and the client's own domain may be a Microsoft 365 tenant (check its MX record),
// not a Google Workspace one. See docs/DATEV_HANDOVER.md.
//
// Graph's sendMail accepts two body shapes. This uses the MIME one - Content-Type: text/plain
// with a base64 RFC 2822 message as the body - rather than the JSON `message` object, so the
// hand-rolled builder in src/lib/datev/mime-message.server.ts keeps owning the format. That
// builder carries DATEV-specific decisions (filename transliteration and header-injection
// sanitizing, 76-char base64 line wrapping, the e-invoice XML wrapper) that would have to be
// re-derived against Graph's attachment schema for no gain.
//
// App-only permission required: Mail.Send (application, admin-consented) on the same app
// registration the folder picker already uses. Application permissions grant send rights across
// the whole tenant, so scope it in the Azure portal with an application access policy limited to
// the DATEV sender mailbox.
//
// SIZE LIMIT: Graph caps a MIME sendMail request at 4MB, well under DATEV's own 20MB per-email
// limit - see MAX_EMAIL_BYTES in src/lib/api/datev-handover.functions.ts, which is budgeted
// against this ceiling, not DATEV's. Anything larger needs the createUploadSession draft flow,
// which is incompatible with sending pre-built MIME and is not implemented.
//
// .server.ts suffix: Vite excludes this from the client bundle, so the client secret can never
// end up in a browser response even by accident.

import { getGraphAccessToken } from "./auth.server";

// `mimeBase64` is a standard-base64 RFC 2822 message, as returned by buildRawEmail().
export async function sendGraphMimeMessage(senderEmail: string, mimeBase64: string): Promise<void> {
  const accessToken = await getGraphAccessToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body: mimeBase64,
    },
  );
  // Graph answers a successful sendMail with 202 Accepted and an empty body.
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph sendMail failed (${res.status}): ${body.slice(0, 500)}`);
  }
}
