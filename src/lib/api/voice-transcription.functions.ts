// Server function backing voice input for the incoming-invoices AI search
// (docs/NATURAL_LANGUAGE_SEARCH.md) — transcribes browser-recorded audio via ElevenLabs Scribe
// and returns plain text. That text lands in the SAME aiQuery state the typed search box already
// uses (see voice-search-button.tsx / eingangsrechnungen/index.tsx) — no new search logic here,
// voice is purely an alternate way to fill one text field, not a second pipeline. No language
// forced on the request: auto-detect handles this app's German/English mix the same way a typed
// query already does. Ported from immonetz.
//
// After transcription, resolveTranscriptEntities() (voice-entity-resolution.ts) runs one more
// pass over the raw text — transcription-time biasing (ElevenLabs' `keyterms` param) reduces
// mishearings but doesn't eliminate them, so this explicitly re-checks the result against the
// same vocabulary (plus suppliers, which keyterms biasing doesn't need) and fixes any that
// slipped through (e.g. "imco" -> "IMKO").
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadGrounding } from "./invoice-nl-grounding";
import { resolveTranscriptEntities } from "./voice-entity-resolution";
import { transcribeWithElevenLabs } from "./voice-transcription-elevenlabs";
import {
  VOICE_RECORDING_MIME,
  VOICE_RECORDING_EXTENSION,
  MAX_VOICE_UPLOAD_BASE64_CHARS,
} from "./voice-transcription-shared";

const InputSchema = z.object({
  mimeType: z.enum(VOICE_RECORDING_MIME),
  // Raw base64, no "data:...;base64," prefix — stripped client-side.
  audioBase64: z.string().min(1).max(MAX_VOICE_UPLOAD_BASE64_CHARS),
});

export const transcribeVoiceQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grounding = await loadGrounding(context.supabase as any);
    const bytes = Buffer.from(data.audioBase64, "base64");
    const extension = VOICE_RECORDING_EXTENSION[data.mimeType];

    const rawText = await transcribeWithElevenLabs(bytes, data.mimeType, extension, grounding);
    const text = await resolveTranscriptEntities(rawText, grounding);
    return { text };
  });
