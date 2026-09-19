import { createFileRoute } from "@tanstack/react-router";

import { BelegDetailPage } from "@/features/invoice-detail/InvoiceDetailPage";
import { pageTitle } from "@/config/brand";
import { pickListSearch } from "@/lib/belege-list-search";
import { tabSearch } from "@/lib/use-tab-param";

/**
 * Thin shell only. The page itself lives in src/features/invoice-detail/, which is the portable
 * folder shared across the hubs — see its PORTING.md. This file is what binds it into THIS
 * repo's routing, and is deliberately the only place the route path is spelled out besides the
 * page's own getRouteApi call.
 */
export const Route = createFileRoute("/eingangsrechnungen/$nr")({
  // `tab` is this page's own state; everything else is the list's filter/sort/page state, handed
  // over by whichever link opened this invoice. TanStack Router drops search params a route does
  // not declare, so without pickListSearch here they would never reach the page's back link,
  // which would then always land on an unfiltered list.
  validateSearch: (input: Record<string, unknown>) => ({
    ...tabSearch(input),
    ...pickListSearch(input),
  }),
  head: () => ({ meta: [{ title: pageTitle("Beleg") }] }),
  component: BelegDetailPage,
});
