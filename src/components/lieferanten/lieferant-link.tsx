import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { SupplierLinkComponent } from "@/components/suppliers/types";

/**
 * This hub's binding of a supplier id to its detail route.
 *
 * This is the whole repository-specific part of "supplier names are clickable": the portable
 * components take a `SupplierLinkComponent`, and a sibling hub swaps in its own one-liner here.
 *
 * A router `Link`, not an onClick handler, so the browser's own rules apply. A plain click
 * navigates in place, Ctrl/Cmd-click and middle-click open a new tab, which is what lets you put
 * two candidates side by side before merging them.
 */
export const LieferantLink: SupplierLinkComponent = ({ supplierId, name, className }) => (
  <Link
    to="/lieferanten/$id"
    params={{ id: supplierId }}
    className={cn("text-foreground hover:text-brand-dark", className)}
    // The suggestion row itself is not clickable, but the panel sits inside pages where rows are;
    // keeping the click on the anchor alone is one less thing to get wrong when porting.
    onClick={(e) => e.stopPropagation()}
  >
    {name}
  </Link>
);
