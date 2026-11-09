import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadGrounding } from "./invoice-nl-grounding";
import { transcribeWithElevenLabs } from "./voice-transcription-elevenlabs";
import type { VoiceRecordingMime } from "./voice-transcription-shared";
import { AUDIO_UPLOAD_EXTENSION, MAX_AUDIO_UPLOAD_BASE64_CHARS } from "./voice-dictation-shared";

const InputSchema = z.object({
  mimeType: z.string().min(1).max(100),
  filename: z.string().min(1).max(255),
  audioBase64: z.string().min(1).max(MAX_AUDIO_UPLOAD_BASE64_CHARS),
});

function extensionFor(mimeType: string, filename: string): string {
  const fromMime = AUDIO_UPLOAD_EXTENSION[mimeType.toLowerCase()];
  if (fromMime) return fromMime;
  const fromName = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return fromName ?? "mp3";
}

export const transcribeUploadedAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grounding = await loadGrounding(context.supabase as any);
    const bytes = Buffer.from(data.audioBase64, "base64");
    const extension = extensionFor(data.mimeType, data.filename);

    return {
      text: await transcribeWithElevenLabs(
        bytes,
        data.mimeType as VoiceRecordingMime,
        extension,
        grounding,
      ),
    };
  });
