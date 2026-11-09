import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import {
  listSharePointSites,
  listSharePointFolders,
  type SharePointSite,
} from "@/lib/graph/drive-folders.server";
import { searchSharePoint, type SharePointSearchHit } from "@/lib/graph/search-sharepoint.server";
import type { FolderOption } from "@/lib/inbox/folder-option";
import { errorText } from "@/lib/data/format";

async function callProvider<T>(fn: () => Promise<T>, code: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new AppError(errorText(e), 502, code);
  }
}

export const getSharePointSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SharePointSite[]> =>
    callProvider(listSharePointSites, "GRAPH_API_ERROR"),
  );

export const getSharePointFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((siteId: string) => siteId)
  .handler(async ({ data: siteId }): Promise<FolderOption[]> =>
    callProvider(() => listSharePointFolders(siteId), "GRAPH_API_ERROR"),
  );

export const searchSharePointDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((queryText: string) => queryText)
  .handler(async ({ data: queryText }): Promise<SharePointSearchHit[]> =>
    callProvider(() => searchSharePoint(queryText), "GRAPH_API_ERROR"),
  );
