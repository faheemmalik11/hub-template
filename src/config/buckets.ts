/**
 * Every storage bucket this app writes to or reads from, spelled once.
 *
 * A bucket name typed at a call site is the same bug as a table name typed at a call site: it
 * fails in production rather than at compile time, and renaming one means finding all of them.
 */
export const BUCKET = {
  /** What arrives: uploads land beside what the pipeline files, not in a bucket of their own. */
  documents: "documents",
  /** What this business sends out. */
  outgoingInvoices: "outgoing-invoice-files",
  /** A person's own picture. */
  profilePictures: "profile-pictures",
} as const;

export type BucketName = (typeof BUCKET)[keyof typeof BUCKET];
