import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSharePointSites,
  useSharePointFolders,
  useSharePointSearch,
} from "@/data/folders/sharepoint";
import { useTranslation } from "@/lib/i18n";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export function SharePointSearchPanel() {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const query = useDebouncedValue(queryInput, 300);

  const sitesQ = useSharePointSites();
  const foldersQ = useSharePointFolders(siteId);
  const searchQ = useSharePointSearch(query);

  const sites = sitesQ.data ?? [];
  const folders = foldersQ.data ?? [];
  const hits = searchQ.data ?? [];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t("sources.sharepoint.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("sources.sharepoint.site")}</label>
            {sitesQ.isLoading ? (
              <Skeleton className="h-9 w-56" />
            ) : (
              <Select value={siteId ?? undefined} onValueChange={setSiteId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t("sources.sharepoint.sitePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="relative min-w-[16rem] flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("sources.sharepoint.search")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={t("sources.sharepoint.searchPlaceholder")}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        {siteId && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t("sources.sharepoint.folders")}</p>
            {foldersQ.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : foldersQ.isError ? (
              <p className="text-xs text-destructive">{t("sources.sharepoint.foldersFailed")}</p>
            ) : folders.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("sources.sharepoint.foldersEmpty")}
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                {folders.map((folder) => (
                  <li key={folder.id} className="truncate">
                    {folder.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {query.length > 0 && (
          <div className="space-y-1.5">
            {searchQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : searchQ.isError ? (
              <p className="text-xs text-destructive">{t("sources.sharepoint.searchFailed")}</p>
            ) : hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("sources.sharepoint.noResults")}</p>
            ) : (
              <ul className="space-y-1">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-auto gap-1.5 px-2 py-1.5"
                    >
                      <a href={hit.webUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5 shrink-0" />
                        <span className="truncate">{hit.name}</span>
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
