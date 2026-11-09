import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import { useTranslation } from "@/lib/i18n";
import { useCreateUploadDocuments } from "@/data";
import { transcribeUploadedAudio } from "@/lib/api/audio-transcription.functions";
import { uploadToStorage } from "@/features/file-upload/upload";
import { BUCKETS, buildStoragePath } from "@/features/file-upload/config";
import {
  MAX_DICTATION_TRANSCRIPT_CHARS,
  VOICE_DICTATION_MAX_RECORDING_MS,
} from "@/lib/api/voice-dictation-shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVoiceRecorder, type RecordedAudio } from "./use-voice-recorder";
import { VoiceOrb } from "./voice-orb";
import { errorText } from "@/lib/data/format";

const RECORDING_EXTENSION: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4" };

type Step = "record" | "review" | "error";

function recordingFilename(mimeType: string, recordedAt: Date): string {
  const stamp = recordedAt.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const extension = RECORDING_EXTENSION[mimeType] ?? "webm";
  return `dictation-${stamp}.${extension}`;
}

function useTranscribeDictatedDocument() {
  return useMutation({
    mutationFn: (args: {
      mimeType: string;
      filename: string;
      audioBase64: string;
    }): Promise<{ text: string }> => transcribeUploadedAudio({ data: args }),
  });
}

export function DictateDocumentButton({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("record");
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState<(RecordedAudio & { filename: string }) | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const transcribe = useTranscribeDictatedDocument();
  const createUpload = useCreateUploadDocuments();

  function fail(message: string | null) {
    setErrorMessage(message);
    setStep("error");
  }

  async function handleRecorded(audio: RecordedAudio) {
    const filename = recordingFilename(audio.mimeType, new Date());
    setRecording({ ...audio, filename });
    try {
      const result = await transcribe.mutateAsync({
        mimeType: audio.mimeType,
        filename,
        audioBase64: audio.audioBase64,
      });
      const text = result.text.trim();
      if (!text) {
        fail(null);
        return;
      }
      setTranscript(text);
      setStep("review");
    } catch {
      fail(null);
    }
  }

  const recorder = useVoiceRecorder({
    maxDurationMs: VOICE_DICTATION_MAX_RECORDING_MS,
    onRecorded: (audio) => void handleRecorded(audio),
    onError: () => fail(null),
  });

  async function saveAsDocument() {
    const text = transcript.trim();
    if (!text) return;
    setSaving(true);
    try {
      const invoiceId = crypto.randomUUID();
      const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
      const filename = `dictation-${stamp}.txt`;
      const file = new File([text], filename, { type: "text/plain" });
      const result = await uploadToStorage(file, {
        bucket: BUCKETS.incoming,
        path: buildStoragePath({ scopeId: "upload", recordId: invoiceId, filename }),
        mime: "text/plain",
      });
      await createUpload.mutateAsync({
        files: [
          {
            invoiceId,
            filename,
            mime: result.mime,
            size: result.sizeBytes,
            storageBucket: result.bucket,
            storagePath: result.path,
            checksumSha256: result.checksumSha256,
          },
        ],
      });
      toast.success(t("documents.upload.dictate.toastSaved"));
      setOpen(false);
      onCreated?.();
    } catch (e) {
      fail(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function startRecording() {
    setTranscript("");
    setRecording(null);
    setErrorMessage(null);
    setStep("record");
    void recorder.start();
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      recorder.cancel();
      setOpen(false);
      return;
    }
    setOpen(true);
    startRecording();
  }

  if (!recorder.supported) return null;

  const busy = recorder.phase === "processing" || transcribe.isPending;
  const recordingLabel = transcribe.isPending
    ? t("documents.upload.dictate.transcribing")
    : recorder.phase === "recording"
      ? t("documents.upload.dictate.recording")
      : t("documents.upload.dictate.preparing");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 sm:w-auto"
        onClick={() => handleOpenChange(true)}
      >
        <Mic className="size-4" /> {t("documents.upload.dictate.button")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("documents.upload.dictate.modalTitle")}</DialogTitle>
            <DialogDescription>
              {step === "review"
                ? t("documents.upload.dictate.reviewHint")
                : t("documents.upload.dictate.recordHint")}
            </DialogDescription>
          </DialogHeader>

          {step === "record" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <VoiceOrb orbRef={recorder.orbRef} busy={busy} />
              <p className="text-sm text-muted-foreground">{recordingLabel}</p>
              {recorder.phase === "recording" && (
                <Button type="button" variant="outline" className="gap-2" onClick={recorder.stop}>
                  <Square className="size-4 text-destructive" fill="currentColor" />
                  {t("documents.upload.dictate.stop")}
                </Button>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <Textarea
                autoFocus
                rows={7}
                maxLength={MAX_DICTATION_TRANSCRIPT_CHARS}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={t("documents.upload.dictate.transcriptPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("documents.upload.dictate.transcriptNote")}
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="py-4">
              <p className="text-sm text-destructive">
                {errorMessage
                  ? t("documents.upload.dictate.saveError", { error: errorMessage })
                  : t("documents.upload.dictate.error")}
              </p>
            </div>
          )}

          <DialogFooter>
            {step !== "record" && (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={saving}
                onClick={startRecording}
              >
                <Mic className="size-4" /> {t("documents.upload.dictate.again")}
              </Button>
            )}
            {step === "review" && (
              <Button
                type="button"
                disabled={!transcript.trim() || saving}
                onClick={() => void saveAsDocument()}
              >
                {saving ? t("documents.upload.dictate.saving") : t("documents.upload.dictate.save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
