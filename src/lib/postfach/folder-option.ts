// Shared shape both Postfach folder pickers (mailbox/Graph, filing/Dropbox) fetch and render —
// see src/lib/graph/mail-folders.server.ts and src/lib/dropbox/folders.server.ts.

export interface FolderOption {
  id: string;
  name: string;
  // The provider's own parent reference, or null for a top-level folder. Real nesting for both
  // providers (Graph mailFolder.parentFolderId; Dropbox folders derived from their own path) —
  // unlike Gmail labels, which have no hierarchy API and are never used here.
  parentId: string | null;
}
