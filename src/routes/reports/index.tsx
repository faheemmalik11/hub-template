import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { NoAccess } from "@/components/layout/no-access";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import {
  CostAnalysis,
  validateCostAnalysisSearch,
  type CostAnalysisConfig,
  type CostAnalysisSearch,
} from "@/features/cost-analysis";

/**
 * this Hub's Cost Analysis.
 *
 * The screen itself lives in `features/cost-analysis/`, byte-identical with the other Hubs. What
 * belongs to THIS repository is here: the page title and the routes a receipt opens into. See that
 * folder's `adapter.ts` for how the port works.
 *
 * No `companyGroups`: the saved IMKO/IMGM view is an Immonetz grouping and neither code exists
 * here, so the option is simply absent rather than present and matching nothing.
 */
export const Route = createFileRoute("/reports/")({
  head: () => ({ meta: [{ title: pageTitle("Kostenanalyse") }] }),
  validateSearch: (input: Record<string, unknown>): CostAnalysisSearch =>
    validateCostAnalysisSearch(input),
  component: ReportsGuard,
});

// A7: "Only management sees the evaluation/BWA, the assistant does not see it at all." The nav
// link is already hidden from the assistant role (app-shell.tsx), but that's UX-only. This
// route-level guard is what actually stops an assistant who navigates here directly by URL, the
// same pattern TeamGuard (/team) uses.
function ReportsGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageReports)) return <NoAccess variant="manager" />;
  return <ReportsPage />;
}

function ReportsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  // `replace` on every change: adjusting a filter is refining one view, not navigating, and pushing
  // each keystroke would bury the previous page under a dozen history entries. Defaults are dropped
  // rather than written out, so a bare /auswertungen stays the unfiltered view.
  const onSearchChange = (patch: Partial<CostAnalysisSearch>) =>
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        // "alle" is NOT dropped: since the default period became the last 30 days, an absent
        // zeitraum means 30 days, so dropping an explicit "all time" would silently narrow the
        // view the user just widened. Only genuinely empty values go.
        for (const [k, v] of Object.entries(next)) {
          if (v === "" || v === undefined || (v === "alle" && k !== "zeitraum")) delete next[k];
        }
        return next;
      },
      replace: true,
    });

  const config: CostAnalysisConfig = {
    // The `fokus` argument is dropped here on purpose. Immonetz's invoice route declares a `fokus`
    // search param and its detail page scrolls to the named field; that has not been ported yet, so
    // passing it would be an undeclared search param. The receipt still opens, just at the top.
    onOpenDocument: (id) => navigate({ to: "/incoming-invoices/$nr", params: { nr: id } }),
    onOpenManualBooking: () => navigate({ to: "/manual-bookings" }),
  };

  return <CostAnalysis config={config} search={search} onSearchChange={onSearchChange} />;
}
