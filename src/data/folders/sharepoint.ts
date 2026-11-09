import { useQuery } from "@tanstack/react-query";

import {
  getSharePointFolders,
  getSharePointSites,
  searchSharePointDocuments,
} from "@/lib/api/sharepoint.functions";

const SHAREPOINT_STALE = 5 * 60_000;

export function useSharePointSites(enabled = true) {
  return useQuery({
    queryKey: ["sharepoint_sites"],
    staleTime: SHAREPOINT_STALE,
    enabled,
    queryFn: () => getSharePointSites(),
  });
}

export function useSharePointFolders(siteId: string | null) {
  return useQuery({
    queryKey: ["sharepoint_folders", siteId],
    staleTime: SHAREPOINT_STALE,
    enabled: !!siteId,
    queryFn: () => getSharePointFolders({ data: siteId as string }),
  });
}

export function useSharePointSearch(queryText: string) {
  const trimmed = queryText.trim();
  return useQuery({
    queryKey: ["sharepoint_search", trimmed],
    enabled: trimmed.length > 0,
    queryFn: () => searchSharePointDocuments({ data: trimmed }),
  });
}
