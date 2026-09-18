/**
 * The addressable sections of the Postfach & Ablage settings screen, as URL hashes.
 *
 * Shared so the two ends of the link cannot drift apart: `components/home/missing-folder-banner.tsx`
 * builds `/postfach#<section>` links from these, and `routes/postfach/index.tsx` matches the live
 * hash against them to scroll that section into view and ring it. A string literal on either side
 * would fail silently — the link would simply land at the top of the page, which is the bug this
 * replaced.
 */
export const POSTFACH_SECTIONS = {
  /** Mailbox: source labels, destination label, return label. */
  mail: "mail",
  /** Filing (Dropbox): source folders, destination folder, return folder. */
  filing: "filing",
} as const;

export type PostfachSection = (typeof POSTFACH_SECTIONS)[keyof typeof POSTFACH_SECTIONS];
