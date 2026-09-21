import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Moved to /manual-bookings when this template anglicised its URLs.
 *
 * The old path stays as a redirect rather than being deleted, so a client merging this keeps every
 * bookmark and shared link working. `beforeLoad` throws before the component renders, so nothing of
 * the old page is mounted on the way through.
 */
export const Route = createFileRoute("/manuelle-buchungen/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/manual-bookings", search, replace: true });
  },
});
