/**
 * Every screen this Hub has: where it lives, what it is called, and which feature key decides
 * whether it exists for this client.
 *
 * ONE DECLARATION. The sidebar reads this, the breadcrumb reads this, and the single route guard
 * reads this to turn a path into a feature key. A page added without an entry here is a page with
 * no menu item and no guard, which is the failure the old arrangement made easy.
 *
 * Paths are English, like every other identifier here. Each German path this template used to
 * carry is still served, as a redirect route under its old name, so a client merging this keeps
 * their bookmarks.
 */
import { PERMISSIONS } from "@/config/permissions";

export type RouteEntry = {
  /** The URL. */
  path: string;
  /** The i18n key for its name, so the label is never typed at a call site. */
  labelKey: string;
  /** The catalogue key: a role may hold it, and a client may switch it off. */
  key: string;
  /** Which menu group it belongs under. */
  module: string;
};

export const ROUTES: RouteEntry[] = [
  {
    path: "/",
    labelKey: "nav.uebersicht",
    key: PERMISSIONS.pageOverview,
    module: PERMISSIONS.moduleOverview,
  },
  {
    path: "/profile",
    labelKey: "nav.meinProfil",
    key: PERMISSIONS.pageProfile,
    module: PERMISSIONS.moduleOverview,
  },

  {
    path: "/incoming-invoices",
    labelKey: "nav.eingangsrechnungen",
    key: PERMISSIONS.pageIncomingInvoices,
    module: PERMISSIONS.moduleInvoices,
  },
  {
    path: "/outgoing-invoices",
    labelKey: "nav.ausgangsrechnungen",
    key: PERMISSIONS.pageOutgoingInvoices,
    module: PERMISSIONS.moduleInvoices,
  },
  {
    path: "/manual-bookings",
    labelKey: "nav.manuelleBuchungen",
    key: PERMISSIONS.pageManualBookings,
    module: PERMISSIONS.moduleInvoices,
  },
  {
    path: "/file-naming",
    labelKey: "nav.dateibenennung",
    key: PERMISSIONS.pageFileNaming,
    module: PERMISSIONS.moduleInvoices,
  },
  {
    path: "/inbox",
    labelKey: "nav.postfach",
    key: PERMISSIONS.pageDocumentSources,
    module: PERMISSIONS.moduleInvoices,
  },

  {
    path: "/open-items",
    labelKey: "nav.offenePosten",
    key: PERMISSIONS.pageOpenItems,
    module: PERMISSIONS.modulePayments,
  },
  {
    path: "/bank-transactions",
    labelKey: "nav.banktransaktionen",
    key: PERMISSIONS.pageBankTransactions,
    module: PERMISSIONS.modulePayments,
  },
  {
    path: "/bank-accounts",
    labelKey: "nav.bankkonten",
    key: PERMISSIONS.pageBankAccounts,
    module: PERMISSIONS.modulePayments,
  },
  {
    path: "/opos-whitelist",
    labelKey: "nav.oposWhitelist",
    key: PERMISSIONS.pageOpenItemWhitelist,
    module: PERMISSIONS.modulePayments,
  },
  {
    path: "/bank-settings",
    labelKey: "nav.bankEinstellungen",
    key: PERMISSIONS.pageBankSettings,
    module: PERMISSIONS.modulePayments,
  },

  {
    path: "/suppliers",
    labelKey: "nav.lieferanten",
    key: PERMISSIONS.pageSuppliers,
    module: PERMISSIONS.moduleMasterData,
  },
  {
    path: "/customers",
    labelKey: "nav.kunden",
    key: PERMISSIONS.pageCustomers,
    module: PERMISSIONS.moduleMasterData,
  },
  {
    path: "/companies",
    labelKey: "nav.gesellschaften",
    key: PERMISSIONS.pageCompanies,
    module: PERMISSIONS.moduleMasterData,
  },
  {
    path: "/properties",
    labelKey: "nav.objekte",
    key: PERMISSIONS.pageProperties,
    module: PERMISSIONS.moduleMasterData,
  },
  {
    path: "/categories",
    labelKey: "nav.kategorien",
    key: PERMISSIONS.pageCategories,
    module: PERMISSIONS.moduleMasterData,
  },

  {
    path: "/assignment-rules",
    labelKey: "nav.zuordnungsregeln",
    key: PERMISSIONS.pageAssignmentRules,
    module: PERMISSIONS.moduleRules,
  },
  {
    path: "/approval-rules",
    labelKey: "nav.freigabeRegeln",
    key: PERMISSIONS.pageApprovalRules,
    module: PERMISSIONS.moduleRules,
  },
  {
    path: "/exclusion-rules",
    labelKey: "nav.ausschlussregeln",
    key: PERMISSIONS.pageExclusionRules,
    module: PERMISSIONS.moduleRules,
  },

  {
    path: "/vat-rules",
    labelKey: "nav.ustRegeln",
    key: PERMISSIONS.pageVatRules,
    module: PERMISSIONS.moduleTaxes,
  },
  {
    path: "/vat-reserve",
    labelKey: "nav.steuerruecklage",
    key: PERMISSIONS.pageTaxReserve,
    module: PERMISSIONS.moduleTaxes,
  },
  {
    path: "/datev-handover",
    labelKey: "nav.datevUebergabe",
    key: PERMISSIONS.pageHandover,
    module: PERMISSIONS.moduleTaxes,
  },

  {
    path: "/reports",
    labelKey: "nav.auswertungen",
    key: PERMISSIONS.pageReports,
    module: PERMISSIONS.moduleReports,
  },

  {
    path: "/team",
    labelKey: "nav.team",
    key: PERMISSIONS.pageTeam,
    module: PERMISSIONS.moduleAdmin,
  },
  {
    path: "/onboarding",
    labelKey: "nav.onboarding",
    key: PERMISSIONS.pageOnboarding,
    module: PERMISSIONS.moduleAdmin,
  },
  {
    path: "/notifications",
    labelKey: "nav.benachrichtigungen",
    key: PERMISSIONS.pageNotifications,
    module: PERMISSIONS.moduleAdmin,
  },
  {
    path: "/activity-log",
    labelKey: "nav.protokoll",
    key: PERMISSIONS.pageActivityLog,
    module: PERMISSIONS.moduleAdmin,
  },
  {
    path: "/trash",
    labelKey: "nav.papierkorb",
    key: PERMISSIONS.pageTrash,
    module: PERMISSIONS.moduleAdmin,
  },
];

/**
 * The feature key for a path, for the one guard that stands between every route and its screen.
 * Longest match wins, so /eingangsrechnungen/upload is still the incoming invoices page.
 */
export function featureKeyForPath(pathname: string): string | null {
  let best: RouteEntry | null = null;
  for (const route of ROUTES) {
    const matches = route.path === "/" ? pathname === "/" : pathname.startsWith(route.path);
    if (matches && (!best || route.path.length > best.path.length)) best = route;
  }
  return best?.key ?? null;
}
