import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { DatevHandoverPage, type DatevHandoverConfig } from "@/features/datev-handover";
import { pageTitle } from "@/config/brand";

/**
 * this client's shell around the shared DATEV-Übergabe feature.
 *
 * Everything on screen lives in `src/features/datev-handover/`, which is copied between the Hubs as
 * a unit (see its PORTING.md). This file is only what is genuinely this client's: the route path, the
 * document title, this Hub's invoice-detail navigation, and which directions actually send here.
 *
 * No `validateSearch`: the screen was three tabs and kept the active one in `?tab=`. It is one page
 * now, so there is no tab to round-trip.
 */
export const Route = createFileRoute("/datev-handover/")({
  head: () => ({ meta: [{ title: pageTitle("DATEV-Übergabe") }] }),
  component: DatevHandoverRoute,
});

function DatevHandoverRoute() {
  const navigate = useNavigate();

  const config = useMemo<DatevHandoverConfig>(
    () => ({
      // Only `incoming` sends here. `outgoing` is listed in the send drawer against real invoices
      // and blocks per invoice on its own file, exactly as incoming does; it becomes sendable once
      // this Hub has the outgoing handover columns and stored files for those invoices.
      activeDirections: ["incoming"],
      onOpenDocument: (id) => void navigate({ to: "/incoming-invoices/$nr", params: { nr: id } }),
      documentTitle: pageTitle("DATEV-Übergabe"),
    }),
    [navigate],
  );

  return <DatevHandoverPage config={config} />;
}
