/**
 * What this Hub's own code can do with a channel's provider, as opposed to what the ingestion
 * pipeline (the separate book-keeping repo) can do with it. `channels.provider` has no database
 * constraint, but the pipeline's own config only ever accepts "graph", "gmail" or "imap" for a
 * mailbox channel. This Hub has a live folder-listing client for Graph and for plain IMAP
 * (src/lib/graph/mail-folders.server.ts, src/lib/inbox/imap-folders.server.ts) via
 * getMailboxFolders, which picks between them by this same provider value. Gmail is the one
 * provider left with no live client, so a value this Hub has never heard of must still be treated
 * as the common case rather than as a crash: Microsoft Graph, which almost every channel uses.
 */

const PROVIDERS_WITHOUT_FOLDER_BROWSING = new Set(["gmail"]);

/**
 * Whether this Hub can list a mailbox channel's folders live, for the given `channels.provider`.
 *
 * `null`, `undefined`, an empty string and `"graph"` all mean Microsoft Graph, the provider every
 * existing client's mailbox channel already uses, and must keep returning `true`. `"imap"` also
 * returns `true` now that getMailboxFolders can connect to a plain IMAP mailbox directly. `false`
 * is reserved for a provider this Hub still has no live folder listing for, such as Gmail.
 */
export function providerSupportsFolderBrowsing(provider: string | null | undefined): boolean {
  if (!provider) return true;
  return !PROVIDERS_WITHOUT_FOLDER_BROWSING.has(provider);
}
