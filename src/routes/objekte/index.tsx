import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CompanyAssignmentField } from "@/components/objekte/company-assignment-field";
import { ObjekteListe, validatePropertiesSearch } from "@/features/properties";
import type { PropertiesConfig, PropertiesSearch } from "@/features/properties";
import { useSetPropertyCompanies } from "@/lib/data/queries";
import { useAuth } from "@/lib/auth";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/objekte/")({
  // `?neu=<code>` deep-links here from elsewhere (e.g. an invoice whose extracted property isn't in
  // the master data) to open the create dialog pre-filled with that code.
  validateSearch: (search: Record<string, unknown>): PropertiesSearch =>
    validatePropertiesSearch(search),
  head: () => ({ meta: [{ title: pageTitle("Objekte") }] }),
  component: ObjektePage,
});

/**
 * The this client wiring for the shared Objekte list.
 *
 * Everything the screen itself does lives in `features/properties/`, which is byte-identical across
 * the Hubs. This file is only the route: the search param, the document title, the navigation
 * targets, and the one field this Hub collects that the shared form does not.
 */
function ObjektePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = useAuth();
  const setCompanies = useSetPropertyCompanies();

  // Every property here belongs to at least one company, and that is enforced at creation rather
  // than left to a follow-up edit: a property with no company is a state this Hub treats as
  // invalid, so allowing it to exist even briefly would be a regression.
  const [companyIds, setCompanyIds] = useState<string[]>([]);

  const config = useMemo<PropertiesConfig>(
    () => ({
      oeffneObjekt: (code) => navigate({ to: "/objekte/$code", params: { code } }),
      oeffneListe: () => navigate({ to: "/objekte" }),
      oeffneBeleg: (id) => navigate({ to: "/eingangsrechnungen/$nr", params: { nr: id } }),
      oeffneNeu: (code) => navigate({ to: "/objekte", search: { neu: code } }),
      verwerfeNeuParam: () => navigate({ to: "/objekte", search: {}, replace: true }),
      oeffneGesellschaft: (id) => navigate({ to: "/gesellschaften/$id", params: { id } }),
      // Archiving is supported; the review date and the ownership type are not columns here, and
      // filing_folder is a Dropbox path for the pipeline rather than a link anybody opens. See
      // the capability table in features/properties/PORTING.md.
      stammdatenPruefung: false,
      archivierung: true,
      eigentum: false,
      driveOrdner: false,
      anlegenFeld: {
        node: <CompanyAssignmentField values={companyIds} onValuesChange={setCompanyIds} />,
        unvollstaendig: companyIds.length === 0,
        speichern: async (objektId) => {
          await setCompanies.mutateAsync({
            propertyId: objektId,
            companyIds,
            actor: user?.email ?? null,
          });
        },
        zuruecksetzen: () => setCompanyIds([]),
      },
    }),
    [navigate, companyIds, setCompanies, user?.email],
  );

  return <ObjekteListe config={config} search={search} />;
}
