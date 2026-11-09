import { useCallback, useEffect, useRef, useState } from "react";

import {
  VOICE_RECORDING_MIME,
  type VoiceRecordingMime,
} from "@/lib/api/voice-transcription-shared";

const VOLUME_LEVEL_OF_LOUD_SPEECH = 60;

export type VoiceRecorderPhase = "idle" | "requesting" | "recording" | "processing";

export interface RecordedAudio {
  mimeType: VoiceRecordingMime;
  audioBase64: string;
}

interface UseVoiceRecorderOptions {
  maxDurationMs: number;
  onRecorded: (audio: RecordedAudio) => void;
  onError: () => void;
}

function firstMimeTypeThisBrowserCanRecord(): VoiceRecordingMime | null {
  for (const candidate of VOICE_RECORDING_MIME) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function blobToBase64WithoutDataUrlPrefix(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder({ maxDurationMs, onRecorded, onError }: UseVoiceRecorderOptions) {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
  const orbRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeFrameRef = useRef<number | null>(null);
  const onRecordedRef = useRef(onRecorded);
  const onErrorRef = useRef(onError);
  onRecordedRef.current = onRecorded;
  onErrorRef.current = onError;
  const dismissedBeforeHandoverRef = useRef(false);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const releaseMicrophoneAndTimers = useCallback(() => {
    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    if (volumeFrameRef.current) {
      cancelAnimationFrame(volumeFrameRef.current);
      volumeFrameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => releaseMicrophoneAndTimers, [releaseMicrophoneAndTimers]);

  const driveOrbFromMicrophoneVolume = useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioContextCtor();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const frequencies = new Uint8Array(analyser.frequencyBinCount);

    const paintNextFrame = () => {
      analyser.getByteFrequencyData(frequencies);
      let sum = 0;
      for (let i = 0; i < frequencies.length; i++) sum += frequencies[i];
      const level = Math.min(1, sum / frequencies.length / VOLUME_LEVEL_OF_LOUD_SPEECH);
      const orb = orbRef.current;
      if (orb) {
        orb.style.transform = `scale(${1 + level * 0.22})`;
        orb.style.boxShadow =
          `0 0 ${16 + level * 55}px ${4 + level * 18}px color-mix(in oklch, var(--brand) ${28 + level * 55}%, transparent), ` +
          `0 0 ${4 + level * 12}px ${1 + level * 4}px color-mix(in oklch, var(--brand) ${50 + level * 40}%, transparent)`;
      }
      volumeFrameRef.current = requestAnimationFrame(paintNextFrame);
    };
    paintNextFrame();
  }, []);

  const stop = useCallback(() => {
    if (maxDurationTimeoutRef.current) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    recorderRef.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    dismissedBeforeHandoverRef.current = true;
    recorderRef.current = null;
    releaseMicrophoneAndTimers();
    setPhase("idle");
  }, [releaseMicrophoneAndTimers]);

  const start = useCallback(async () => {
    dismissedBeforeHandoverRef.current = false;
    const mimeType = firstMimeTypeThisBrowserCanRecord();
    if (!mimeType) {
      setPhase("idle");
      onErrorRef.current();
      return;
    }

    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("idle");
      onErrorRef.current();
      return;
    }
    if (dismissedBeforeHandoverRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    driveOrbFromMicrophoneVolume(stream);

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      releaseMicrophoneAndTimers();
      if (dismissedBeforeHandoverRef.current) return;
      setPhase("processing");
      const blob = new Blob(chunksRef.current, { type: mimeType });
      try {
        const audioBase64 = await blobToBase64WithoutDataUrlPrefix(blob);
        onRecordedRef.current({ mimeType, audioBase64 });
      } catch {
        onErrorRef.current();
      } finally {
        setPhase("idle");
      }
    };

    recorder.start();
    setPhase("recording");
    maxDurationTimeoutRef.current = window.setTimeout(stop, maxDurationMs);
  }, [maxDurationMs, driveOrbFromMicrophoneVolume, stop, releaseMicrophoneAndTimers]);

  return { supported, phase, orbRef, start, stop, cancel };
}
