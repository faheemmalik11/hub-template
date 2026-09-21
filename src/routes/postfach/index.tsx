import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Moved to /inbox when this template anglicised its URLs.
 *
 * The old path stays as a redirect rather than being deleted, so a client merging this keeps every
 * bookmark and shared link working. `beforeLoad` throws before the component renders, so nothing of
 * the old page is mounted on the way through.
 */
export const Route = createFileRoute("/postfach/")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/inbox", search, replace: true });
  },
});
