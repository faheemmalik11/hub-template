// Post-transcription correction pass for voice-transcription.functions.ts. Ported from immonetz's
// voice-entity-resolution.ts, including a real bug found and fixed live there — see below.
//
// Transcription-time biasing (ElevenLabs' `keyterms` param) reduces mishearings but doesn't
// eliminate them, so this runs AFTER transcribeWithElevenLabs() returns its raw text and BEFORE
// it reaches the user: one gpt-4o-mini call (temperature 0, strict JSON schema
// `{ correctedText }`) given the tenant's company/property/supplier vocabulary, instructed to fix
// ONLY phonetic mishearings of those exact values and leave everything else untouched.
//
// Cost categories are DELIBERATELY EXCLUDED from this pass, even though they're used for
// transcription-time keyterm biasing (voice-transcription-elevenlabs.ts). Immonetz live-tested
// this exact pass against real recordings ("How much overall VAT I have submitted this year?",
// "Did we spend anything on repair?", "...on scaffolding..."): company/property/supplier
// resolution was reliable across every test, but category resolution kept confusing a real,
// correctly-heard word that merely RELATES to a category's meaning (VAT, repair, scaffolding)
// with an actual mishearing of that category's German name, rewriting it to e.g.
// "Umsatzsteuerzahlung" or "Reparatur / Instandhaltung" — wrong, and actively harmful, since it
// would feed a hard-coded, possibly wrong category into extractIntent()
// (invoice-nl-retrieval.functions.ts) before that call's own full-question-context category
// matching (already more reliable, and defaults to null when unsure) even gets to run. Tightening
// the instructions and setting temperature 0 both helped but did NOT make the confusion go away —
// it still flipped on repeated identical runs even at temperature 0. Categories are simply too
// semantically rich (real financial vocabulary, not arbitrary codes) for a token-level "is this a
// mishearing" pass to safely judge; company/property/supplier values are unambiguous short codes
// or proper nouns with no natural competing meaning, which is why those stayed reliable.
//
// Deliberately fail-open: this is a quality improvement on top of an already-usable transcript,
// not a required step. Any error here (missing API key, request failure, bad response) falls back
// to the original, uncorrected text rather than failing the whole voice search over a best-effort
// correction pass.
import { callOpenAiJsonSchema } from "./invoice-nl-retrieval.functions";
import type { Grounding } from "./invoice-nl-grounding";
import { tenantCredentialOrNull } from "@/lib/postfach/channel-credentials.server";

const DEFAULT_MODEL = "gpt-4o-mini";

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    correctedText: { type: "string" },
  },
  required: ["correctedText"],
  additionalProperties: false,
} as const;

function buildInstructions(grounding: Grounding): string {
  return `You correct a speech-to-text transcript for a German property-management accounting search app. The transcript may contain a mis-HEARD company code, property code, or supplier name — the speech recognizer picked a wrong-but-similar-SOUNDING word for what was actually said.

Below are the ONLY valid values for each category. Replace a word or short phrase in the transcript with the EXACT valid value ONLY when it is a phonetic mishearing of that exact value — e.g. "imco" sounds like and is almost certainly a mishearing of a company code like "IMKO". Otherwise leave the transcript exactly as it was transcribed, word for word.

- Company codes/names: ${grounding.companyList}
- Property codes/names: ${grounding.propertyList}
- Supplier names: ${grounding.supplierList}

CRITICAL — do NOT replace a word just because it describes a similar CONCEPT to one of the values above; only replace it if it sounds like a MISHEARING of that value's actual pronunciation. A real, correctly-heard word is NOT a mishearing just because it relates to one of these entities' business, and must be left alone.

ALSO CRITICAL — if the transcript already contains an EXACT match to one of the values above, leave that exact spot alone. Do NOT "improve" or normalize something that is already correct — never swap a code for its full name, a full name for its code, or one valid value for another. There is nothing to fix there.

Do not change anything else either: do not paraphrase, translate, reorder, add, or remove words that aren't a mishearing of one of the values above. When in doubt, leave the word as transcribed — a missed correction is far less harmful than a wrong one. If nothing in the transcript is a mishearing, return it completely unchanged.`;
}

export async function resolveTranscriptEntities(
  text: string,
  grounding: Grounding,
): Promise<string> {
  try {
    const apiKey = await tenantCredentialOrNull("OPENAI_API_KEY");
    if (!apiKey) return text;
    if (
      grounding.companyCodes.length === 0 &&
      grounding.propertyCodes.length === 0 &&
      grounding.supplierNames.length === 0
    ) {
      return text;
    }

    const model = process.env.OPENAI_NL_SEARCH_VOICE_RESOLUTION_MODEL || DEFAULT_MODEL;
    const raw = await callOpenAiJsonSchema(
      apiKey,
      model,
      buildInstructions(grounding),
      text,
      "transcript_correction",
      RESULT_SCHEMA,
      0,
    );
    const parsed = raw as { correctedText?: unknown };
    const corrected = typeof parsed.correctedText === "string" ? parsed.correctedText.trim() : "";
    return corrected || text;
  } catch {
    return text;
  }
}
