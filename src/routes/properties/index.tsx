import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CompanyAssignmentField } from "@/components/properties/company-assignment-field";
import { PropertiesList, validatePropertiesSearch } from "@/features/properties";
import type { PropertiesConfig, PropertiesSearch } from "@/features/properties";
import { useSetPropertyCompanies } from "@/data";
import { useAuth } from "@/lib/auth";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/properties/")({
  // `?neu=<code>` deep-links here from elsewhere (e.g. an invoice whose extracted property isn't in
  // the master data) to open the create dialog pre-filled with that code.
  validateSearch: (search: Record<string, unknown>): PropertiesSearch =>
    validatePropertiesSearch(search),
  head: () => ({ meta: [{ title: pageTitle("Objekte") }] }),
  component: PropertiesPage,
});

/**
 * The this client wiring for the shared Objekte list.
 *
 * Everything the screen itself does lives in `features/properties/`, which is byte-identical across
 * the Hubs. This file is only the route: the search param, the document title, the navigation
 * targets, and the one field this Hub collects that the shared form does not.
 */
function PropertiesPage() {
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
      openProperty: (code) => navigate({ to: "/properties/$code", params: { code } }),
      openList: () => navigate({ to: "/properties" }),
      openDocument: (id) => navigate({ to: "/incoming-invoices/$nr", params: { nr: id } }),
      openNew: (code) => navigate({ to: "/properties", search: { new: code } }),
      discardNewParam: () => navigate({ to: "/properties", search: {}, replace: true }),
      openCompany: (id) => navigate({ to: "/companies/$id", params: { id } }),
      // Archiving is supported; the review date and the ownership type are not columns here, and
      // filing_folder is a Dropbox path for the pipeline rather than a link anybody opens. See
      // the capability table in features/properties/PORTING.md.
      masterDataCheck: false,
      archiving: true,
      ownership: false,
      driveFolder: false,
      createField: {
        node: <CompanyAssignmentField values={companyIds} onValuesChange={setCompanyIds} />,
        incomplete: companyIds.length === 0,
        save: async (propertyId) => {
          await setCompanies.mutateAsync({
            propertyId: propertyId,
            companyIds,
            actor: user?.email ?? null,
          });
        },
        reset: () => setCompanyIds([]),
      },
    }),
    [navigate, companyIds, setCompanies, user?.email],
  );

  return <PropertiesList config={config} search={search} />;
}
