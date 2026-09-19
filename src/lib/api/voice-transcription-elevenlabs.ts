// ElevenLabs Scribe speech-to-text provider for voice-transcription.functions.ts. Ported from
// immonetz's voice-transcription-elevenlabs.ts, which chose ElevenLabs over an OpenAI
// gpt-4o-mini-transcribe alternative after real-recording testing there showed it was
// consistently more accurate — same choice made here directly, no OpenAI STT path was ever built
// in this project.
//
// Verified directly against ElevenLabs' current API reference rather than assumed from training
// data (see immonetz's own port for the detailed verification trail):
// - Endpoint POST https://api.elevenlabs.io/v1/speech-to-text, model_id "scribe_v2".
// - Auth is the `xi-api-key` header, not an `Authorization: Bearer` header.
// - Errors come back as `{ detail: { status, message } }`.
// - Domain-vocabulary biasing uses `keyterms`, a structured list of up to 1000 terms (<=50 chars,
//   <=5 words each) sent as repeated `keyterms` multipart fields — a dedicated bias mechanism.
// - `tag_audio_events` (non-speech event tagging, e.g. "(music)") is on by default and was found
//   live (in immonetz) to misfire on silent/fake audio, tagging it as a non-speech event instead
//   of returning empty text — explicitly disabled here for the same reason from the start, plus
//   the same isNonSpeechEventTag() defensive backstop in case it still happens.
import { AppError } from "./errors";
import type { Grounding } from "./invoice-nl-grounding";
import type { VoiceRecordingMime } from "./voice-transcription-shared";

const ELEVENLABS_TRANSCRIPTION_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_MODEL = "scribe_v2";

// Server-enforced limits (ElevenLabs API reference): max 1000 keyterms, each <=50 chars and <=5
// words after normalisation; `<`, `>`, `{`, `}`, `[`, `]`, `\` are rejected outright. Filtered
// defensively so an oddly-named company/category/supplier can't 400 the whole request — this
// check is NOT optional/cosmetic: the API rejects the ENTIRE keyterms list (400, the whole
// transcription request fails) if even ONE term violates a limit, so a single long property name
// breaks voice search completely, not just that one term. Confirmed live: two this Hub property
// names ("Ludwigshafen, Edigheimer Str. 92a+b / Kurt-Schumacher-Str. 96-100",
// "Neustadt a.d. Weinstraße, Wittelsbacher Str. 61") exceed 5 words and 400'd every single
// request until the word-count check below was added — the character-length/disallowed-char
// checks alone weren't enough, they didn't previously check word count at all despite this
// comment already (wrongly) claiming they did.
const MAX_KEYTERMS = 1000;
const MAX_KEYTERM_CHARS = 50;
const MAX_KEYTERM_WORDS = 5;
const DISALLOWED_KEYTERM_CHARS = /[<>{}[\]\\]/;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isValidKeyterm(term: string): boolean {
  return (
    term.length > 0 &&
    term.length <= MAX_KEYTERM_CHARS &&
    term.trim().split(/\s+/).length <= MAX_KEYTERM_WORDS &&
    !DISALLOWED_KEYTERM_CHARS.test(term)
  );
}

// Codes and names as separate terms (not "CODE (Name)" prose) since each keyterm is matched
// independently, not read as prose. Categories are included here too (unlike the post-
// transcription entity-resolution pass, which deliberately excludes them — see
// voice-entity-resolution.ts) since keyterm biasing at transcription time is a much lower-risk
// mechanism than that pass's free-text rewriting: it only nudges word-level recognition
// probabilities, it can't rewrite a correctly-heard word into an unrelated category name the way
// the resolution pass was found to.
function buildKeyterms(grounding: Grounding): string[] {
  const terms = [
    ...grounding.companyCodes,
    ...grounding.companyNames,
    ...grounding.propertyCodes,
    ...grounding.propertyNames,
    ...grounding.categoryNames,
  ].filter(isValidKeyterm);
  return Array.from(new Set(terms)).slice(0, MAX_KEYTERMS);
}

// A transcript that is ENTIRELY one bracketed/parenthesized tag (e.g. "[music]", "(laughter)") is
// a non-speech audio event annotation, not a real spoken query.
const NON_SPEECH_EVENT_TAG = /^[[(].+[\])]$/;
function isNonSpeechEventTag(text: string): boolean {
  return NON_SPEECH_EVENT_TAG.test(text);
}

export async function transcribeWithElevenLabs(
  bytes: Buffer<ArrayBuffer>,
  mimeType: VoiceRecordingMime,
  extension: string,
  grounding: Grounding,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new AppError("ELEVENLABS_API_KEY is not configured.", 500, "NOT_CONFIGURED");
  }
  const model = process.env.ELEVENLABS_TRANSCRIPTION_MODEL || DEFAULT_MODEL;
  const keyterms = buildKeyterms(grounding);

  const form = new FormData();
  form.append("model_id", model);
  form.append("tag_audio_events", "false");
  for (const term of keyterms) form.append("keyterms", term);
  form.append("file", new Blob([bytes], { type: mimeType }), `recording.${extension}`);

  let response: Response;
  try {
    response = await fetch(ELEVENLABS_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
  } catch (e) {
    throw new AppError(
      `ElevenLabs transcription request failed: ${errorMessage(e)}`,
      502,
      "ELEVENLABS_ERROR",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detailMessage: string | undefined;
    try {
      const parsed = JSON.parse(body) as { detail?: { status?: string; message?: string } };
      detailMessage = parsed.detail?.message;
    } catch {
      // body wasn't JSON — fall through to raw text below
    }
    throw new AppError(
      `ElevenLabs transcription API returned ${response.status}: ${detailMessage ?? body.slice(0, 500)}`,
      502,
      "ELEVENLABS_ERROR",
    );
  }

  const payload = (await response.json()) as { text?: string };
  const text = (payload.text ?? "").trim();
  if (!text || isNonSpeechEventTag(text)) {
    throw new AppError(
      "ElevenLabs transcription returned no text — no speech detected?",
      502,
      "ELEVENLABS_ERROR",
    );
  }
  return text;
}
