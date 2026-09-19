// Lists the this clientBelege Dropbox app folder's real folders so the Postfach screen's filing picker
// can offer them (Briefing Screen 1: "Source and Destination Folder"). Read-only.
//
// The DROPBOX_APP_KEY / APP_SECRET / REFRESH_TOKEN the admin panel stored on the scan-folder source,
// the same ones the pipeline reads, and never a copy in .env (lib/postfach/channel-credentials).
// The DROPBOX_ACCESS_TOKEN escape hatch from .env is gone with it.
//
// Dropbox is an "app folder" permission app, so `path: ""` already means the this clientBelege root —
// there is no separate configured root to fetch, unlike Drive's Shared Drives.
//
// .server.ts suffix: Vite excludes this from the client bundle.

import type { FolderOption } from "@/lib/postfach/folder-option";
import { channelCredential } from "@/lib/postfach/channel-credentials.server";

async function getDropboxAccessToken(): Promise<string> {
  const [appKey, appSecret, refreshToken] = await Promise.all([
    channelCredential("scan_folder", "DROPBOX_APP_KEY"),
    channelCredential("scan_folder", "DROPBOX_APP_SECRET"),
    channelCredential("scan_folder", "DROPBOX_REFRESH_TOKEN"),
  ]);

  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${appKey}:${appSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Dropbox token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Dropbox token exchange succeeded but returned no access_token.");
  }
  return data.access_token;
}

async function dropboxPost(url: string, token: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dropbox API request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

interface DropboxEntry {
  ".tag": "folder" | "file" | "deleted";
  name: string;
  path_display: string;
  path_lower: string;
}
interface DropboxListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

// No parent-id field in Dropbox's own API — real nesting is derived from each folder's own path
// (Dropbox paths are always full paths from the app root, so the parent is just "everything
// before the last /").
function parentPathOf(path: string): string | null {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? null : path.slice(0, idx);
}

export async function listDropboxFolders(): Promise<FolderOption[]> {
  const token = await getDropboxAccessToken();

  const folders: DropboxEntry[] = [];
  let page = (await dropboxPost("https://api.dropboxapi.com/2/files/list_folder", token, {
    path: "",
    recursive: true,
    include_deleted: false,
  })) as DropboxListFolderResult;
  folders.push(...page.entries.filter((e) => e[".tag"] === "folder"));
  while (page.has_more) {
    page = (await dropboxPost("https://api.dropboxapi.com/2/files/list_folder/continue", token, {
      cursor: page.cursor,
    })) as DropboxListFolderResult;
    folders.push(...page.entries.filter((e) => e[".tag"] === "folder"));
  }

  return (
    folders
      // The id is `path_lower`, the same form the admin panel writes into channel_folders
      // (admin-ui source-folders.ts). Dropbox paths are case-insensitive, so /Test and /test are one
      // folder, but a picker compares ids exactly: with path_display here, a folder bound in the
      // panel showed up in the Hub as "Unknown entry /test" beside a second, unticked "Test".
      .map((f) => ({ id: f.path_lower, name: f.name, parentId: parentPathOf(f.path_lower) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}
