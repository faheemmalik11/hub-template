// Lists a plain IMAP mailbox's real folders so the Postfach screen's mailbox picker can offer
// them, the same way src/lib/graph/mail-folders.server.ts does for Microsoft Graph.
//
// The credential (IMAP_HOST, IMAP_USERNAME, IMAP_PASSWORD) is read through channelCredential, the
// same store and the same decryption the pipeline itself uses — never a second copy in .env. See
// src/lib/inbox/channel-credentials.server.ts for why that file, not this one, is the place that
// reasoning lives.
//
// .server.ts suffix: Vite excludes this from the client bundle, the same as dropbox/folders.server.ts.

import { ImapFlow } from "imapflow";

import type { FolderOption } from "@/lib/inbox/folder-option";
import { channelCredential } from "./channel-credentials.server";

/** IMAP has no parent-id concept of its own: a folder's path, split on its own delimiter, is one. */
function parentPathOf(path: string, delimiter: string): string | null {
  if (!delimiter) return null;
  const at = path.lastIndexOf(delimiter);
  return at === -1 ? null : path.slice(0, at);
}

export async function listImapMailFolders(): Promise<FolderOption[]> {
  const [host, username, password] = await Promise.all([
    channelCredential("mailbox", "IMAP_HOST"),
    channelCredential("mailbox", "IMAP_USERNAME"),
    channelCredential("mailbox", "IMAP_PASSWORD"),
  ]);

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user: username, pass: password },
    logger: false,
    // A picker is waiting on this: fail fast rather than let one slow or unreachable mail server
    // hang the request. Generous enough for a normal TLS handshake and login.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await client.connect();
  try {
    const list = await client.list();
    return list
      .map((folder) => ({
        id: folder.path,
        name: folder.name,
        parentId: parentPathOf(folder.path, folder.delimiter),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.logout().catch(() => client.close());
  }
}
