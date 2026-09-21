import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Bank connections moved into Bankkonten.
 *
 * The two screens were describing the same thing from opposite ends: this one listed the accesses
 * and could only preview the account names underneath, that one listed the accounts and said
 * nothing about where they came from. Every connection is now a group header on the accounts
 * table, with its status, its mode, its last sync and the accounts it delivers in one place, and
 * the sync controls sit beside the sync state instead of on a separate page.
 *
 * The route stays as a redirect rather than being deleted. It was in the nav for months, so it is
 * in bookmarks and in links people have sent each other, and a 404 would read as the feature having
 * been removed. `beforeLoad` throws before the component renders, so nothing of the old page is
 * mounted on the way through.
 */
export const Route = createFileRoute("/bank-connections/")({
  beforeLoad: () => {
    throw redirect({ to: "/bank-accounts", replace: true });
  },
});
