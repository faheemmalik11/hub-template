// Shared between voice-transcription.functions.ts and voice-search-button.tsx so the client and
// the transcription call agree on what's acceptable. Ported from immonetz.
//
// Only the two formats MediaRecorder can actually produce across the browsers this app needs to
// support: audio/webm (Chrome/Edge/Firefox default) and audio/mp4 (Safari, which does not
// support webm recording). No client-side transcoding — ElevenLabs' transcription endpoint
// accepts both directly, it just needs the file extension to match what was actually recorded.
export const VOICE_RECORDING_MIME = ["audio/webm", "audio/mp4"] as const;
export type VoiceRecordingMime = (typeof VOICE_RECORDING_MIME)[number];

export const VOICE_RECORDING_EXTENSION: Record<VoiceRecordingMime, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
};

// Matches the client's own MAX_RECORDING_MS cap (voice-search-button.tsx) — ~30s of audio at a
// modest bitrate, base64-inflated (~4/3). Generous ceiling against anything larger reaching here.
export const MAX_VOICE_UPLOAD_BASE64_CHARS = 8 * 1024 * 1024;
