import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import { Avatar } from "../../ui/avatar";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { ProfileAdapter, ProfileUser } from "../../adapters/profile";
import type { ProfileLabels } from "./labels";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The round picture, with the name, email and role beside it.
 *
 * The chosen file is shown straight away from a local preview url, so the circle changes the
 * moment you pick a file instead of after the upload and the refetch behind it.
 */
export function ProfilePictureCard({
  user,
  adapter,
  labels,
}: {
  user: ProfileUser;
  adapter: ProfileAdapter;
  labels: ProfileLabels;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pictureLabels = labels.picture;
  const maxSize = formatSize(adapter.maxPictureSizeBytes);

  async function pickFile(file: File) {
    if (!adapter.acceptedPictureTypes.includes(file.type)) {
      toast.error(pictureLabels.wrongType);
      return;
    }
    if (file.size > adapter.maxPictureSizeBytes) {
      toast.error(pictureLabels.tooBig(maxSize));
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsSaving(true);
    try {
      // The stored url replaces the local one, so the circle keeps the new picture after upload.
      const storedUrl = await adapter.uploadPicture({ file });
      setPreviewUrl(storedUrl);
      toast.success(pictureLabels.saved);
    } catch (error) {
      setPreviewUrl(null);
      toast.error(pictureLabels.failed(readableErrorMessage(error, "")));
    } finally {
      URL.revokeObjectURL(localUrl);
      setIsSaving(false);
    }
  }

  async function removePicture() {
    setIsSaving(true);
    try {
      await adapter.removePicture();
      setPreviewUrl(null);
      toast.success(pictureLabels.removed);
    } catch (error) {
      toast.error(pictureLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  const shownPicture = previewUrl ?? user.pictureUrl;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-start">
        <div className="relative">
          <Avatar name={user.name} email={user.email} imageUrl={shownPicture} size="xl" />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={isSaving}
            aria-label={shownPicture ? pictureLabels.replace : pictureLabels.choose}
            className="absolute -bottom-1 -right-1 grid size-8 cursor-pointer place-items-center rounded-full border border-border bg-background text-muted-foreground shadow transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="text-lg font-semibold text-foreground">{user.name ?? user.email}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{user.email}</div>
          <Badge variant="secondary" className="mt-2">
            {labels.access.roleLabelText(user.roleName)}
          </Badge>

          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={isSaving}
            >
              {isSaving
                ? pictureLabels.uploading
                : shownPicture
                  ? pictureLabels.replace
                  : pictureLabels.choose}
            </Button>

            {shownPicture && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={isSaving}>
                    <Trash2 className="size-4" /> {pictureLabels.remove}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{pictureLabels.removeTitle}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {pictureLabels.removeDescription}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{pictureLabels.cancel}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={removePicture}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {pictureLabels.confirmRemove}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">{pictureLabels.hint(maxSize)}</p>
        </div>

        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={adapter.acceptedPictureTypes.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void pickFile(file);
          }}
        />
      </CardContent>
    </Card>
  );
}
