import type { ComponentType, ReactNode } from "react";

/**
 * Router primitives `DocumentSourcesPage` needs: a Link, and a way to open/close a source's
 * settings sheet by driving the URL hash (so a link elsewhere in the host app can deep-link
 * straight to one source), plus the `fokus` search param that rings one field inside it once
 * open. No default: an unconditional import of a TanStack-backed implementation would break the
 * build for any Hub without `@tanstack/react-router` installed, even one that never renders it —
 * same reasoning as `ChecklistLinkComponent` in `../../components/checklist/types`. TanStack Hubs
 * pass `useTanstackDocumentSourcesRouter` from `@/kit/pages/document-sources/tanstack-router`
 * explicitly; other routers implement this interface on their own primitives.
 */
export interface DocumentSourcesRouter {
  Link: ComponentType<{ to: string; className?: string; children?: ReactNode }>;
  /** Current location hash. May or may not carry a leading '#' — the page normalizes either. */
  useHash(): string;
  /** The 'fokus' search param, if present. */
  useFokusParam(): string | undefined;
  /** Opens one source's settings sheet (sets the hash to its id). */
  openSource(sourceId: string): void;
  /** Closes the settings sheet (clears the hash). */
  closeSource(): void;
}
