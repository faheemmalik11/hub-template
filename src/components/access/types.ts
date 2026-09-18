/**
 * PORTABLE ACCESS-CONTROL UI — shared types.
 *
 * These components render a permission model; they do not know where it comes from. Everything
 * arrives as props, so a different project supplies its own hooks, its own table names and its own
 * catalogue without touching this folder. Nothing here imports a query hook, a route or a
 * project-specific permission key.
 *
 * Three pieces, in `src/components/access/`:
 *   permission-checklist.tsx   what ONE subject (a person) may do
 *   permission-matrix.tsx      what each ROLE grants by default
 *   types.ts                   this file
 */

/** One grantable thing, as the catalogue describes it. */
export interface AccessPermission {
  key: string;
  /** Groups rows under a heading. Free text — the host maps it to a label. */
  category: string;
  label: string;
  description?: string | null;
}

/** A role, as a column in the matrix. */
export interface AccessRole {
  id: string;
  label: string;
}

/** Called when a box is ticked or cleared. Rejections should surface as a toast by the host. */
export type AccessToggle = (key: string, next: boolean) => void;
