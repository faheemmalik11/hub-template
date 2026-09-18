import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { DatevHandoverPage, type DatevHandoverConfig } from "@/features/datev-handover";
import { pageTitle } from "@/lib/brand";

/**
 * Stäy's shell around the shared DATEV-Übergabe feature.
 *
 * Everything on screen lives in `src/features/datev-handover/`, which is copied between the Hubs as
 * a unit (see its PORTING.md). This file is only what is genuinely Stäy's: the route path, the
 * document title, this Hub's invoice-detail navigation, and which directions actually send here.
 *
 * No `validateSearch`: the screen was three tabs and kept the active one in `?tab=`. It is one page
 * now, so there is no tab to round-trip.
 */
export const Route = createFileRoute("/datev-uebergabe/")({
  head: () => ({ meta: [{ title: pageTitle("DATEV-Übergabe") }] }),
  component: DatevUebergabeRoute,
});

function DatevUebergabeRoute() {
  const navigate = useNavigate();

  const config = useMemo<DatevHandoverConfig>(
    () => ({
      // Only `incoming` sends here. `outgoing` is listed in the send drawer against real invoices
      // and blocks per invoice on its own file, exactly as incoming does; it becomes sendable once
      // this Hub has the outgoing handover columns and stored files for those invoices.
      aktiveRichtungen: ["incoming"],
      onOpenBeleg: (id) => void navigate({ to: "/eingangsrechnungen/$nr", params: { nr: id } }),
      documentTitle: pageTitle("DATEV-Übergabe"),
    }),
    [navigate],
  );

  return <DatevHandoverPage config={config} />;
}
