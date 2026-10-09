// Turns whatever went wrong in the DATEV send into `[CODE] detail`, the one shape the whole feature
// stores and reads.
//
// WHY A CODE IN THE TEXT. The failure is persisted (datev_handover_batches.error_message) and also
// travels to the browser as an Error message, and the screen has to show it in whichever language
// is selected. Persisted text stays German by rule, so what is stored is language-neutral: a code
// the screen translates, then the technical detail for whoever has to dig. Rows written before this
// carry no code and are shown as they were.
//
// The codes are translated under `datevUebergabe.fehler.<CODE>` in the locale files; an unknown
// code falls back to SEND_FAILED's text, so adding one here without a translation degrades rather
// than breaks.

import { GraphAuthError } from "@/lib/graph/auth.server";
import { GraphSendError } from "@/lib/graph/send-mail.server";

export type SendErrorCode =
  | "NO_MAILBOX"
  | "NO_ROUTE"
  | "CREDENTIALS"
  | "MAIL_AUTH"
  | "NO_SEND_PERMISSION"
  | "MAILBOX_NOT_FOUND"
  | "TOO_LARGE"
  | "THROTTLED"
  | "NETWORK"
  | "RECORD_FAILED"
  | "SEND_FAILED";

export function sendErrorText(code: SendErrorCode, detail: string): string {
  return detail ? `[${code}] ${detail}` : `[${code}]`;
}

function detailOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Which code a failure from the credentials, the token request or Graph's sendMail belongs to. */
export function classifySendError(e: unknown): SendErrorCode {
  if (e instanceof GraphSendError) {
    if (e.status === 401 || e.status === 403) return "NO_SEND_PERMISSION";
    if (e.status === 404) return "MAILBOX_NOT_FOUND";
    if (e.status === 413) return "TOO_LARGE";
    if (e.status === 429 || e.status === 503 || e.status === 504) return "THROTTLED";
    return "SEND_FAILED";
  }
  if (e instanceof GraphAuthError) return "MAIL_AUTH";
  const message = detailOf(e);
  // channelCredential's own German messages: not stored, or stored but cannot be opened.
  if (/nicht hinterlegt|nicht entschlüsseln|noch nicht eingerichtet/.test(message)) {
    return "CREDENTIALS";
  }
  if (e instanceof TypeError) return "NETWORK";
  return "SEND_FAILED";
}

/** `[CODE] detail` for a failure of the send itself. */
export function describeSendFailure(e: unknown): string {
  return sendErrorText(classifySendError(e), detailOf(e));
}
