/**
 * What this Hub's own code can do with a channel's provider, as opposed to what the ingestion
 * pipeline (the separate book-keeping repo) can do with it. `channels.provider` is free text with
 * no enforced vocabulary, so a value this Hub has never heard of must still be treated as the
 * common case rather than as a crash: Microsoft Graph, which almost every channel uses.
 */

const PROVIDERS_WITHOUT_FOLDER_BROWSING = new Set(["imap"]);

/**
 * Whether this Hub can list a mailbox channel's folders live, for the given `channels.provider`.
 *
 * `null`, `undefined`, an empty string and `"graph"` all mean Microsoft Graph, the provider every
 * existing client's mailbox channel already uses, and must keep returning `true`. `false` is
 * reserved for a provider this Hub has no live folder listing for, such as a plain IMAP mailbox.
 */
export function providerSupportsFolderBrowsing(provider: string | null | undefined): boolean {
  if (!provider) return true;
  return !PROVIDERS_WITHOUT_FOLDER_BROWSING.has(provider);
}
