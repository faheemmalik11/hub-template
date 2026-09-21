// Server functions backing the Postfach folder pickers (Briefing Screen 1). Requires a logged-in
// Hub user (requireSupabaseAuth) — the underlying app credentials can read the whole mailbox/app
// folder, so this must not be callable by an anonymous request even though the data itself
// (folder names) is not especially sensitive.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import { listGraphMailFolders } from "@/lib/graph/mail-folders.server";
import { listDropboxFolders } from "@/lib/dropbox/folders.server";
import type { FolderOption } from "@/lib/inbox/folder-option";
import { errorText } from "@/lib/data/format";

// Wraps a provider-side failure (missing env var, expired token, a scope not authorized) into an
// AppError, so the picker in the UI can show one clear German message instead of leaking a raw
// fetch/token error to the screen.
async function callProvider<T>(fn: () => Promise<T>, code: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new AppError(errorText(e), 502, code);
  }
}

export const getMailboxFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<FolderOption[]> =>
    callProvider(listGraphMailFolders, "GRAPH_API_ERROR"),
  );

export const getFilingFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<FolderOption[]> =>
    callProvider(listDropboxFolders, "DROPBOX_API_ERROR"),
  );
