import { Link } from "@tanstack/react-router";

import type { ChecklistLinkComponent } from "./types";

/**
 * `LinkComponent` for the checklist parts, backed by TanStack Router's `Link`. Import and pass
 * this explicitly on a TanStack Router Hub (`LinkComponent={TanStackChecklistLink}`) — it is not
 * a default, since an unconditional import of it would break the build on Hubs without
 * `@tanstack/react-router` installed at all.
 */
export const TanStackChecklistLink: ChecklistLinkComponent = ({
  to,
  search,
  hash,
  className,
  "aria-label": ariaLabel,
  children,
}) => (
  <Link to={to} search={search} hash={hash} className={className} aria-label={ariaLabel}>
    {children}
  </Link>
);
