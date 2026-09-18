import type { ComponentType } from "react";

/**
 * Shared prop types for the portable supplier-page components.
 *
 * Nothing in here imports a query, a route or a domain type. That is the point. Each sibling hub
 * maps its own supplier records onto these shapes and supplies its own link component, so the
 * components below can move between repositories untouched.
 */

/** The minimum a supplier has to expose to be rendered and linked to. */
export interface SupplierRef {
  id: string;
  name: string;
}

/**
 * One duplicate group offered for merging: the records involved, and why they were matched
 * ("Matched by VAT ID …"). The reason arrives already worded and translated. Deciding what counts
 * as a match, and what to call it, stays with the host repository's view/query.
 */
export interface MergeSuggestion {
  /** Stable key for the row. */
  id: string;
  suppliers: SupplierRef[];
  reason: string;
}

/**
 * How a supplier name becomes a link.
 *
 * A component rather than an href string: each hub routes differently (TanStack Router here,
 * plain react-router elsewhere), and only the host knows how to build a real `<a href>` that its
 * router will intercept. Whatever it returns MUST be an anchor, so Ctrl/Cmd-click and middle-click
 * keep opening a new tab by themselves.
 */
export type SupplierLinkComponent = ComponentType<{
  supplierId: string;
  name: string;
  className?: string;
}>;
