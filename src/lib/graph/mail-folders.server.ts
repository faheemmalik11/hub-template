// Lists the accounting@staey.de mailbox's real folders so the Postfach screen's mailbox picker
// can offer them (Briefing Screen 1: "Source and Destination Folder"). Read-only — this never
// creates, renames or moves anything.
//
// App-only auth and the credential env hint both live in auth.server.ts, shared with the DATEV
// handover send (send-mail.server.ts).

import type { FolderOption } from "@/lib/postfach/folder-option";
import { channelMailbox } from "@/lib/postfach/channel-credentials.server";
import { getGraphAccessToken } from "./auth.server";

async function graphGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph API request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

interface GraphMailFolder {
  id: string;
  displayName: string;
  childFolderCount: number;
  // Set for Outlook's own built-in folders (inbox, sentitems, deleteditems, junkemail, drafts,
  // archive, ...), null/absent for anything a person created. Listed like any other folder: the
  // inbox is the folder a mailbox is most often read from, and a person can only pick what is shown.
  wellKnownName?: string | null;
}
interface GraphMailFoldersPage {
  value: GraphMailFolder[];
  "@odata.nextLink"?: string;
}

// mailFolders has no arbitrary-depth $expand in v1.0, so real nesting (subfolders under Inbox,
// e.g. a "zu bezahlen" folder) is built by walking childFolders explicitly, one level per call,
// following @odata.nextLink for mailboxes with more folders than fit one page. Sibling subtrees
// are fetched concurrently (Promise.all), not one after another, so the wall-clock cost is
// roughly the tree's DEPTH in round trips rather than its total NODE count.
export async function listGraphMailFolders(): Promise<FolderOption[]> {
  const token = await getGraphAccessToken();
  // The address the pipeline actually reads, from the mailbox source's settings.
  const mailbox = await channelMailbox();
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders`;

  const out: FolderOption[] = [];
  async function walk(url: string, parentId: string | null): Promise<void> {
    const page = (await graphGet(url, token)) as GraphMailFoldersPage;
    const recurseInto: GraphMailFolder[] = [];
    for (const f of page.value) {
      out.push({ id: f.id, name: f.displayName, parentId });
      if (f.childFolderCount > 0) recurseInto.push(f);
    }
    await Promise.all(recurseInto.map((f) => walk(`${base}/${f.id}/childFolders?$top=100`, f.id)));
    if (page["@odata.nextLink"]) await walk(page["@odata.nextLink"], parentId);
  }
  await walk(`${base}?$top=100`, null);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
