// Voice input for the AI search on the incoming-invoices toolbar. Redesigned 2026-08-11 (ported
// from immonetz the same day) from an inline state-changing button to a mic icon (sits inside the
// search input's right edge) that opens a modal: recording starts immediately on open, a glowing
// orb reacts in real time to actual mic volume (Web Audio API AnalyserNode) rather than just
// pulsing generically, and the user explicitly stops it. Records via MediaRecorder, sends the
// audio to transcribeVoiceQuery (voice-transcription.functions.ts), and hands the transcribed
// text back to the caller — it does NOT auto-submit the search; the caller drops the text into
// the same aiQuery state the typed search box already uses, so the user can see/edit it before
// pressing Enter, same as anything typed: a misheard word on a financial question should never
// silently run as a real query.
//
// Browser support: navigator.mediaDevices/MediaRecorder don't exist during SSR, so support is
// detected client-side only (useEffect), never assumed at render time. Codec: MediaRecorder in
// Chrome/Edge/Firefox defaults to webm; Safari has no webm recording support at all and needs
// mp4 instead — VOICE_RECORDING_MIME lists both, tried in that order via isTypeSupported().
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { useTranscribeVoiceQuery } from "@/data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  VOICE_RECORDING_MIME,
  type VoiceRecordingMime,
} from "@/lib/api/voice-transcription-shared";

const MAX_RECORDING_MS = 30_000;
// Raw byte-frequency-domain average (0-255) that counts as "speaking loudly" for the glow's
// upper bound — tuned empirically against a normal laptop mic at conversational volume, not a
// documented Web Audio constant. Silence/background noise typically sits under 10.
const LOUD_VOLUME_CEILING = 60;

type Phase = "requesting" | "recording" | "transcribing" | "error";

function pickSupportedMimeType(): VoiceRecordingMime | null {
  for (const candidate of VOICE_RECORDING_MIME) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strips the "data:audio/webm;base64," prefix FileReader adds — the server only wants
      // the raw base64 payload.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function VoiceSearchButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const { t } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("requesting");
  const orbRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const transcribe = useTranscribeVoiceQuery();

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  // Tears down everything mic/audio-related: recorder, tracks, AnalyserNode's AudioContext, the
  // volume animation loop, the max-duration timeout. Called on a normal stop-and-transcribe, on
  // an error, and when the dialog is dismissed mid-recording (X / Escape / overlay click) — none
  // of those should leave the mic hot or an animation frame looping in the background.
  function teardownAudio() {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }

  useEffect(() => teardownAudio, []);

  // Drives the glowing orb from the mic's REAL volume, not a generic pulse — a separate
  // AnalyserNode tapping the same MediaStream MediaRecorder is already recording, read every
  // animation frame and written straight to the orb's inline style (not React state) so 60fps
  // volume updates never trigger a re-render.
  function startVolumeMeter(stream: MediaStream) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextCtor();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const level = Math.min(1, avg / LOUD_VOLUME_CEILING);
      const orb = orbRef.current;
      if (orb) {
        orb.style.transform = `scale(${1 + level * 0.22})`;
        orb.style.boxShadow =
          `0 0 ${16 + level * 55}px ${4 + level * 18}px color-mix(in oklch, var(--brand) ${28 + level * 55}%, transparent), ` +
          `0 0 ${4 + level * 12}px ${1 + level * 4}px color-mix(in oklch, var(--brand) ${50 + level * 40}%, transparent)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  const stopRecording = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setPhase("error");
      return;
    }

    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("error");
      return;
    }
    streamRef.current = stream;
    startVolumeMeter(stream);

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      teardownAudio();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setPhase("transcribing");
      try {
        const audioBase64 = await blobToBase64(blob);
        const result = await transcribe.mutateAsync({ mimeType, audioBase64 });
        onTranscribed(result.text);
        setOpen(false);
      } catch {
        setPhase("error");
      }
    };

    recorder.start();
    setPhase("recording");
    timeoutRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
  };

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Dismissed via X / Escape / overlay click, not the normal stop-and-transcribe path (that
      // one closes itself only after a successful transcription, above). Whatever state we were
      // in — still requesting permission, mid-recording — tear down without submitting anything.
      recorderRef.current = null;
      teardownAudio();
      setOpen(false);
      return;
    }
    setOpen(true);
    void startRecording();
  }

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={t("belege.list.nlSearch.voiceStart")}
        title={t("belege.list.nlSearch.voiceStart")}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Mic className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("belege.list.nlSearch.voiceModalTitle")}</DialogTitle>
            {phase === "recording" && (
              <DialogDescription>{t("belege.list.nlSearch.voiceModalHint")}</DialogDescription>
            )}
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-6">
            {phase === "error" ? (
              <p className="text-sm text-destructive">{t("belege.list.nlSearch.voiceError")}</p>
            ) : (
              <>
                <div
                  ref={orbRef}
                  className="grid size-24 shrink-0 place-items-center rounded-full bg-brand-wash text-brand-dark transition-[box-shadow,transform] duration-100 ease-out"
                  style={{
                    boxShadow: "0 0 16px 4px color-mix(in oklch, var(--brand) 28%, transparent)",
                  }}
                >
                  {phase === "transcribing" ? (
                    <Loader2 className="size-8 animate-spin" />
                  ) : (
                    <Mic className="size-8" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {phase === "transcribing"
                    ? t("belege.list.nlSearch.voiceTranscribing")
                    : phase === "requesting"
                      ? t("belege.list.nlSearch.voiceStart")
                      : t("belege.list.nlSearch.voiceRecording")}
                </p>
              </>
            )}

            {phase === "recording" && (
              <Button type="button" variant="outline" className="gap-2" onClick={stopRecording}>
                <Square className="size-4 text-destructive" fill="currentColor" />
                {t("belege.list.nlSearch.voiceStop")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
