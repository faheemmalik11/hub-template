export const AUDIO_UPLOAD_EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

export const MAX_AUDIO_UPLOAD_BASE64_CHARS = 40 * 1024 * 1024;

export const VOICE_DICTATION_MAX_RECORDING_MS = 120_000;

export const MAX_DICTATION_TRANSCRIPT_CHARS = 5_000;
