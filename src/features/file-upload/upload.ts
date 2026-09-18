import * as tus from "tus-js-client";

import { supabase } from "@/integrations/supabase/client";
import { sha256Hex } from "./checksum";
import { sanitizeFilename, UPLOAD_LIMIT_BYTES, type UploadBucket } from "./config";

const CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10_000, 20_000];

export interface UploadResult {
  bucket: UploadBucket;
  path: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  checksumSha256: string | null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "UploadError";
  }
}
function resumableEndpoint(): string {
  const url = new URL(import.meta.env.VITE_SUPABASE_URL as string);
  const ref = url.hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

export async function uploadToStorage(
  file: File,
  opts: {
    bucket: UploadBucket;
    path: string;
    mime?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<UploadResult> {
  if (file.size > UPLOAD_LIMIT_BYTES) {
    throw new UploadError("file exceeds the upload limit");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new UploadError("not signed in");

  const mime = opts.mime || file.type || "application/octet-stream";
  const checksum = await sha256Hex(file);

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: RETRY_DELAYS,
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: mime,
        cacheControl: "3600",
      },
      onError: (error) => reject(new UploadError(error.message, error)),
      onProgress: (sent, total) => {
        if (total > 0) opts.onProgress?.(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });

    if (opts.signal) {
      if (opts.signal.aborted) {
        void upload.abort(true);
        reject(new UploadError("upload cancelled"));
        return;
      }
      opts.signal.addEventListener(
        "abort",
        () => {
          void upload.abort(true);
          reject(new UploadError("upload cancelled"));
        },
        { once: true },
      );
    }

    upload.start();
  });

  return {
    bucket: opts.bucket,
    path: opts.path,
    filename: sanitizeFilename(file.name),
    mime,
    sizeBytes: file.size,
    checksumSha256: checksum,
  };
}
