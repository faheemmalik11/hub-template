import type { FolderOption } from "@/lib/inbox/folder-option";
import { getGraphAccessToken, graphGet } from "./sharepoint-client.server";

export interface SharePointSite {
  id: string;
  name: string;
  url: string;
}

interface GraphSite {
  id: string;
  displayName?: string;
  name?: string;
  webUrl?: string;
}
interface GraphSitesPage {
  value: GraphSite[];
  "@odata.nextLink"?: string;
}
interface GraphDriveItem {
  id: string;
  name: string;
  folder?: { childCount?: number };
}
interface GraphDriveItemsPage {
  value: GraphDriveItem[];
  "@odata.nextLink"?: string;
}

export async function listSharePointSites(): Promise<SharePointSite[]> {
  const token = await getGraphAccessToken();
  const out: SharePointSite[] = [];

  let url = "https://graph.microsoft.com/v1.0/sites?search=*&$top=100";
  for (;;) {
    const page = (await graphGet(url, token)) as GraphSitesPage;
    for (const site of page.value) {
      if (site.webUrl?.includes("/personal/")) continue;
      out.push({
        id: site.id,
        name: site.displayName || site.name || site.webUrl || site.id,
        url: site.webUrl ?? "",
      });
    }
    if (!page["@odata.nextLink"]) break;
    url = page["@odata.nextLink"];
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

interface GraphDrivesPage {
  value: { id: string; name?: string }[];
}

async function listDrives(siteId: string, token: string) {
  const page = (await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name`,
    token,
  )) as GraphDrivesPage;
  return page.value ?? [];
}

export async function listSharePointFolders(siteId: string): Promise<FolderOption[]> {
  const site = siteId.trim();
  if (!site) throw new Error("SITE_NOT_CHOSEN");
  const token = await getGraphAccessToken();
  const drives = await listDrives(site, token);

  const out: FolderOption[] = [];
  for (const drive of drives) {
    const rootId = `${drive.id}!root`;
    out.push({ id: rootId, name: drive.name || "Dokumente", parentId: null });

    const base = `https://graph.microsoft.com/v1.0/drives/${drive.id}`;
    async function walk(url: string, parentId: string): Promise<void> {
      const page = (await graphGet(url, token)) as GraphDriveItemsPage;
      const recurseInto: GraphDriveItem[] = [];
      for (const item of page.value) {
        if (!item.folder) continue;
        out.push({ id: `${drive.id}!${item.id}`, name: item.name, parentId });
        if ((item.folder.childCount ?? 0) > 0) recurseInto.push(item);
      }
      await Promise.all(
        recurseInto.map((f) =>
          walk(`${base}/items/${f.id}/children?$top=200`, `${drive.id}!${f.id}`),
        ),
      );
      if (page["@odata.nextLink"]) await walk(page["@odata.nextLink"], parentId);
    }
    await walk(`${base}/root/children?$top=200`, rootId);
  }
  return out;
}
