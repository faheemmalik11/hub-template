import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";

import type { TourDefinition, TourLabels, TourMap, TourStep } from "@/kit/components/tour";

import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { useInvoiceQueueKpis, useNotificationChannels, usePermissionCatalogue } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { PERMISSIONS } from "@/config/permissions";

export function useTourLabels(): TourLabels {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      openTour: t("tour.open"),
      stepCounter: (current, total) => t("tour.counter", { current, total }),
      next: t("tour.next"),
      skip: t("tour.skip"),
      finish: t("tour.finish"),
      sampleData: t("tour.sampleData"),
      cardTitle: t("tour.cardTitle"),
    }),
    [t],
  );
}

type StepSpec = {
  target: string;
  key: string;
  placement?: TourStep["placement"];
  titleKey?: string;
};

type TourSpec = {
  id: string;
  version: number;
  namespace: string;
  steps: StepSpec[];
};

function overviewSpec(navVisible: boolean, canCostAnalysis: boolean): TourSpec {
  const navSteps: StepSpec[] = [
    { target: "shell-nav", key: "navigation", placement: "right" },
    { target: "shell-nav-rechnungen", key: "navInvoices", placement: "right" },
    { target: "shell-nav-zahlungen", key: "navBanking", placement: "right" },
    { target: "shell-nav-stammdaten", key: "navMasterData", placement: "right" },
    { target: "shell-nav-regeln", key: "navRules", placement: "right" },
    { target: "shell-nav-steuern", key: "navTax", placement: "right" },
    ...(canCostAnalysis
      ? [
          {
            target: "shell-nav-auswertungen",
            key: "navCostAnalysis",
            placement: "right",
          } as StepSpec,
        ]
      : []),
    { target: "shell-nav-verwaltung", key: "navAdministration", placement: "right" },
  ];
  return {
    id: "overview",
    version: 1,
    namespace: "tour.overview",
    steps: [
      ...(navVisible ? navSteps : []),
      { target: "overview-money-cards", key: "moneyCards" },
      { target: "overview-trend-chart", key: "chart", placement: "left" },
      { target: "overview-stages", key: "stages" },
      { target: "overview-top-suppliers", key: "suppliers", placement: "left" },
      { target: "overview-processing", key: "processing", placement: "top" },
      { target: "overview-company-volume", key: "companyVolume", placement: "top" },
      { target: "overview-open-items", key: "openItems", placement: "top" },
      { target: "overview-bank", key: "bank", placement: "top" },
    ],
  };
}

function incomingListSpec(hasQueueCards: boolean): TourSpec {
  return {
    id: "incoming-list",
    version: 1,
    namespace: "tour.incoming",
    steps: [
      ...(hasQueueCards ? [{ target: "incoming-queue", key: "queue" } as StepSpec] : []),
      { target: "incoming-ai-search", key: "aiSearch" },
      { target: "incoming-filters", key: "filters" },
      { target: "incoming-view-switch", key: "viewSwitch" },
      { target: "incoming-upload", key: "upload", placement: "bottom" },
    ],
  };
}

const INCOMING_DETAIL: TourSpec = {
  id: "incoming-detail",
  version: 1,
  namespace: "tour.incomingDetail",
  steps: [
    { target: "invoice-detail-header", key: "header" },
    { target: "invoice-detail-document", key: "document", placement: "right" },
    { target: "invoice-detail-fields", key: "fields", placement: "left" },
    { target: "invoice-detail-tabs", key: "tabs", placement: "bottom" },
  ],
};

const INCOMING_UPLOAD: TourSpec = {
  id: "incoming-upload",
  version: 1,
  namespace: "tour.incomingUpload",
  steps: [
    { target: "incoming-upload-dropzone", key: "dropzone" },
    { target: "incoming-upload-actions", key: "actions", placement: "top" },
  ],
};

const OUTGOING: TourSpec = {
  id: "outgoing-list",
  version: 1,
  namespace: "tour.outgoing",
  steps: [
    { target: "outgoing-queue", key: "queue" },
    { target: "outgoing-filters", key: "filters" },
    { target: "outgoing-table", key: "table", placement: "top" },
    { target: "outgoing-actions", key: "actions", placement: "bottom" },
  ],
};

const OUTGOING_UPLOAD: TourSpec = {
  id: "outgoing-upload",
  version: 1,
  namespace: "tour.outgoingUpload",
  steps: [
    { target: "outgoing-upload-intro", key: "intro" },
    { target: "outgoing-upload-dropzone", key: "dropzone" },
  ],
};

const MAILBOX: TourSpec = {
  id: "mailbox-settings",
  version: 2,
  namespace: "tour.mailbox",
  steps: [
    { target: "document-sources-status", key: "status", placement: "bottom" },
    { target: "document-sources-list", key: "sources", placement: "top" },
  ],
};

// ONE tour for the screen, not one per tab: a different id per tab made the tour re-open on every
// tab switch, replaying the same opening steps. Both halves carry the same anchors, so the steps
// do not need to branch.
function reconcileSpec(): TourSpec {
  return {
    id: "reconcile",
    version: 1,
    namespace: "tour.reconcile",
    steps: [
      { target: "reconcile-header", key: "intro" },
      { target: "reconcile-tabs", key: "tabs", placement: "bottom" },
      { target: "reconcile-filters", key: "filters", placement: "bottom" },
      { target: "reconcile-list", key: "list", placement: "top" },
    ],
  };
}

const MANUAL_BOOKINGS: TourSpec = {
  id: "manual-bookings",
  version: 1,
  namespace: "tour.manualBookings",
  steps: [
    { target: "manual-bookings-scope", key: "scope" },
    { target: "manual-bookings-create", key: "create", placement: "bottom" },
    { target: "manual-bookings-search", key: "search" },
    { target: "manual-bookings-table", key: "table", placement: "top" },
  ],
};

const FILENAMES: TourSpec = {
  id: "filenames",
  version: 1,
  namespace: "tour.filenames",
  steps: [
    { target: "filename-structure", key: "structure", placement: "right" },
    { target: "filename-description", key: "description", placement: "right" },
    { target: "filename-preview", key: "preview", placement: "left" },
  ],
};

const BANK_TRANSACTIONS: TourSpec = {
  id: "bank-transactions",
  version: 1,
  namespace: "tour.bankTransactions",
  steps: [
    { target: "bank-txn-actions", key: "actions", placement: "bottom" },
    { target: "bank-txn-filters", key: "filters", placement: "bottom" },
    { target: "bank-txn-list", key: "list", placement: "top" },
  ],
};

const BANK_TRANSACTION_DETAIL: TourSpec = {
  id: "bank-transaction-detail",
  version: 1,
  namespace: "tour.bankTransactionDetail",
  steps: [
    { target: "bank-txn-detail-header", key: "header" },
    { target: "bank-txn-detail-data", key: "data", placement: "right" },
    { target: "bank-txn-detail-matches", key: "matches", placement: "left" },
  ],
};

// The write actions are only mounted for somebody who may write, so the step that points at them
// is only added for that person. A step whose target is missing would be skipped silently, which
// reads as the tour jumping or closing early.
function oposSpec(mayWrite: boolean): TourSpec {
  return {
    id: "opos-whitelist",
    version: 1,
    namespace: "tour.opos",
    steps: [
      { target: "opos-intro", key: "intro" },
      ...(mayWrite
        ? [{ target: "opos-actions", key: "actions", placement: "bottom" } as StepSpec]
        : []),
      { target: "opos-filters", key: "filters", placement: "bottom" },
      { target: "opos-list", key: "list", placement: "top" },
    ],
  };
}

const SUPPLIERS: TourSpec = {
  id: "suppliers",
  version: 1,
  namespace: "tour.suppliers",
  steps: [
    { target: "suppliers-header", key: "header", placement: "bottom" },
    { target: "suppliers-toolbar", key: "toolbar", placement: "bottom" },
    { target: "suppliers-list", key: "list", placement: "top" },
  ],
};

const CUSTOMERS: TourSpec = {
  id: "customers",
  version: 1,
  namespace: "tour.customers",
  steps: [
    { target: "customers-header", key: "header", placement: "bottom" },
    { target: "customers-toolbar", key: "toolbar", placement: "bottom" },
    { target: "customers-list", key: "list", placement: "top" },
  ],
};

const COMPANIES: TourSpec = {
  id: "companies",
  version: 1,
  namespace: "tour.companies",
  steps: [
    { target: "companies-header", key: "header", placement: "bottom" },
    { target: "companies-toolbar", key: "toolbar", placement: "bottom" },
    { target: "companies-list", key: "list", placement: "top" },
  ],
};

const PROPERTIES: TourSpec = {
  id: "properties",
  version: 1,
  namespace: "tour.properties",
  steps: [
    { target: "properties-header", key: "header", placement: "bottom" },
    { target: "properties-toolbar", key: "toolbar", placement: "bottom" },
    { target: "properties-list", key: "list", placement: "top" },
  ],
};

const SUPPLIER_DETAIL: TourSpec = {
  id: "supplier-detail",
  version: 1,
  namespace: "tour.supplierDetail",
  steps: [
    { target: "supplier-detail-header", key: "header", placement: "bottom" },
    { target: "supplier-detail-content", key: "content", placement: "top" },
  ],
};

const CUSTOMER_DETAIL: TourSpec = {
  id: "customer-detail",
  version: 1,
  namespace: "tour.customerDetail",
  steps: [
    { target: "customer-detail-header", key: "header", placement: "bottom" },
    { target: "customer-detail-content", key: "content", placement: "top" },
  ],
};

const COMPANY_DETAIL: TourSpec = {
  id: "company-detail",
  version: 1,
  namespace: "tour.companyDetail",
  steps: [
    { target: "company-detail-header", key: "header", placement: "bottom" },
    { target: "company-detail-content", key: "content", placement: "top" },
  ],
};

const PROPERTY_DETAIL: TourSpec = {
  id: "property-detail",
  version: 1,
  namespace: "tour.propertyDetail",
  steps: [
    { target: "property-detail-header", key: "header", placement: "bottom" },
    { target: "property-detail-content", key: "content", placement: "top" },
  ],
};

// Bankkonten has three tabs (?tab= konten | pleo | manuell). Radix unmounts the inactive panels,
// so the panel step follows the active tab. The pleo tab has no dedicated anchor, so no panel
// step is offered there rather than pointing at markup that is not mounted.
function bankAccountsSpec(activeTab: string | undefined): TourSpec {
  const manual = activeTab === "manuell";
  const connected = activeTab === undefined || activeTab === "konten";
  const panel: StepSpec[] = manual
    ? [{ target: "bank-accounts-manual", key: "manual", placement: "top" }]
    : connected
      ? [{ target: "bank-accounts-connected", key: "connected", placement: "top" }]
      : [];
  return {
    id: "bank-accounts",
    version: 1,
    namespace: "tour.bankAccounts",
    steps: [
      { target: "bank-accounts-header", key: "header", placement: "bottom" },
      { target: "bank-accounts-toolbar", key: "toolbar", placement: "bottom" },
      ...panel,
    ],
  };
}

// Zuordnungsregeln keeps its tab in ?tab= and Radix unmounts the inactive panel, so the panel
// step travels with the tab the reader is on. Kategorien is a single, untabbed screen and gets
// its own one-step tour below.
const ASSIGNMENT_TABS: Record<string, StepSpec> = {
  regeln: { target: "assignment-rules", key: "rules", placement: "top" },
  spielplatz: { target: "assignment-playground", key: "playground", placement: "top" },
  suggestions: { target: "assignment-suggestions", key: "suggestions", placement: "top" },
};

function assignmentSpec(
  activeTab: string | undefined,
  pageTabs: string[],
  tabsKey: string,
): TourSpec {
  const key = activeTab && pageTabs.includes(activeTab) ? activeTab : pageTabs[0];
  return {
    id: `assignment-${pageTabs[0]}`,
    version: 1,
    namespace: "tour.assignmentRules",
    steps: [{ target: "assignment-tabs", key: tabsKey, placement: "bottom" }, ASSIGNMENT_TABS[key]],
  };
}

const KATEGORIEN: TourSpec = {
  id: "categories",
  version: 1,
  namespace: "tour.assignmentRules",
  steps: [{ target: "assignment-categories", key: "categories", placement: "top" }],
};

const VAT_RULES: TourSpec = {
  id: "vat-rules",
  version: 1,
  namespace: "tour.vatRules",
  steps: [
    { target: "vat-company", key: "company", placement: "bottom" },
    { target: "vat-rules", key: "rules", placement: "top" },
  ],
};

const VAT_RESERVE: TourSpec = {
  id: "vat-reserve",
  version: 1,
  namespace: "tour.vatRules",
  steps: [
    { target: "vat-company", key: "company", placement: "bottom" },
    { target: "vat-reserve", key: "reserve", placement: "top" },
  ],
};

const APPROVALS: TourSpec = {
  id: "approvals",
  version: 2,
  namespace: "tour.approvals",
  steps: [
    { target: "approval-header", key: "header", placement: "bottom" },
    { target: "approval-toolbar", key: "toolbar", placement: "bottom" },
    { target: "approval-list", key: "list", placement: "top" },
  ],
};

const EXCLUSIONS: TourSpec = {
  id: "exclusions",
  version: 1,
  namespace: "tour.exclusions",
  steps: [
    { target: "exclusion-header", key: "header", placement: "bottom" },
    { target: "exclusion-list", key: "list", placement: "top" },
  ],
};

const COST_ANALYSIS: TourSpec = {
  id: "cost-analysis",
  version: 1,
  namespace: "tour.costAnalysis",
  steps: [
    { target: "analysis-header", key: "header", placement: "bottom" },
    { target: "analysis-filters", key: "filters", placement: "bottom" },
    { target: "analysis-figures", key: "figures", placement: "bottom" },
    { target: "analysis-breakdown", key: "breakdown", placement: "top" },
  ],
};

const DATEV_HANDOVER: TourSpec = {
  id: "datev-handover",
  version: 3,
  namespace: "tour.datevHandover",
  steps: [
    { target: "export-header", key: "header", placement: "bottom" },
    { target: "export-list", key: "list", placement: "top" },
  ],
};

// Team keeps its tab in ?tab= (personen | rollen) and Radix unmounts the inactive panel, so the
// panel step follows the tab the reader is on.
function teamSpec(activeTab: string | undefined, permissionCategories: string[]): TourSpec {
  const roles = activeTab === "rollen";
  return {
    id: "team",
    version: 3,
    namespace: "tour.team",
    steps: roles
      ? [
          { target: "team-tabs", key: "tabs", placement: "bottom" },
          { target: "team-roles", key: "roles", placement: "top" },
          ...(permissionCategories.length
            ? [
                { target: "permission-row", key: "permissionRow", placement: "right" } as StepSpec,
                ...permissionCategories.map((category): StepSpec => ({
                  target: `permission-group-${category}`,
                  key: "permissionGroup",
                  titleKey: `team.permissions.kategorie.${category}`,
                  placement: "right",
                })),
              ]
            : []),
        ]
      : [
          { target: "team-tabs", key: "tabs", placement: "bottom" },
          { target: "team-people", key: "people", placement: "top" },
          { target: "team-actions", key: "actions", placement: "left" },
        ],
  };
}

// Benachrichtigungen keeps its tab in ?tab= (meldungen | einstellungen) and Radix unmounts the
// inactive panel, so the panel step follows the tab the reader is on. The Slack card only mounts
// once the tenant actually has a Slack channel configured, so its step is only offered then.
function notificationsSpec(
  activeTab: string | undefined,
  maySeeSettings: boolean,
  hasSlackChannel: boolean,
): TourSpec {
  const settings = maySeeSettings && activeTab === "einstellungen";
  return {
    id: "notifications",
    version: 3,
    namespace: "tour.notifications",
    steps: [
      { target: "notifications-tabs", key: "tabs", placement: "bottom" },
      ...(settings
        ? [
            { target: "notifications-bell", key: "bell", placement: "right" } as StepSpec,
            ...(hasSlackChannel
              ? [{ target: "notifications-slack", key: "slack", placement: "left" } as StepSpec]
              : []),
          ]
        : [{ target: "notifications-alerts", key: "alerts", placement: "top" } as StepSpec]),
    ],
  };
}

const ONBOARDING: TourSpec = {
  id: "onboarding",
  version: 1,
  namespace: "tour.onboarding",
  steps: [{ target: "onboarding-steps", key: "steps", placement: "top" }],
};

const LOG: TourSpec = {
  id: "log",
  version: 1,
  namespace: "tour.log",
  steps: [
    { target: "log-header", key: "header", placement: "bottom" },
    { target: "log-tabs", key: "tabs", placement: "bottom" },
  ],
};

const TRASH: TourSpec = {
  id: "trash",
  version: 1,
  namespace: "tour.trash",
  steps: [
    { target: "trash-header", key: "header", placement: "bottom" },
    { target: "trash-filters", key: "filters", placement: "bottom" },
    { target: "trash-list", key: "list", placement: "top" },
  ],
};

// Fixed, per-path tours whose targets do not depend on tab or permission.
const BY_PATH: Record<string, TourSpec> = {
  "/lieferanten": SUPPLIERS,
  "/kunden": CUSTOMERS,
  "/gesellschaften": COMPANIES,
  "/objekte": PROPERTIES,
  "/ausschlussregeln": EXCLUSIONS,
  "/datev-uebergabe": DATEV_HANDOVER,
  "/ust-regeln": VAT_RULES,
  "/steuerruecklage": VAT_RESERVE,
  "/kategorien": KATEGORIEN,
  "/manuelle-buchungen": MANUAL_BOOKINGS,
  "/banktransaktionen": BANK_TRANSACTIONS,
  "/eingangsrechnungen/upload": INCOMING_UPLOAD,
  "/ausgangsrechnungen/hochladen": OUTGOING_UPLOAD,
};

// A single record lives at /<module>/<id>, so its address differs on every visit and cannot be a
// fixed key. The provider looks the current pathname up verbatim, so the entry is built for the
// address the reader is actually on.
const DETAIL_PATHS: { pattern: RegExp; spec: TourSpec }[] = [
  { pattern: /^\/eingangsrechnungen\/(?!upload$)[^/]+$/, spec: INCOMING_DETAIL },
  { pattern: /^\/banktransaktionen\/[^/]+$/, spec: BANK_TRANSACTION_DETAIL },
  { pattern: /^\/lieferanten\/[^/]+$/, spec: SUPPLIER_DETAIL },
  { pattern: /^\/kunden\/[^/]+$/, spec: CUSTOMER_DETAIL },
  { pattern: /^\/gesellschaften\/[^/]+$/, spec: COMPANY_DETAIL },
  { pattern: /^\/objekte\/[^/]+$/, spec: PROPERTY_DETAIL },
];

export function useTours(): TourMap {
  const { t } = useTranslation();
  const { can } = useAuth();
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tab = useRouterState({
    select: (state) => (state.location.search as { tab?: string }).tab,
  });

  const catalogueQ = usePermissionCatalogue();
  const permissionCategories = useMemo(() => {
    const seen: string[] = [];
    for (const p of catalogueQ.data ?? []) {
      if (p.category && !seen.includes(p.category)) seen.push(p.category);
    }
    return seen;
  }, [catalogueQ.data]);

  const queueQ = useInvoiceQueueKpis();
  const hasQueueCards = (queueQ.data ?? []).length > 0;
  const channelsQ = useNotificationChannels();
  const hasSlackChannel = (channelsQ.data ?? []).length > 0;

  const canOposWrite = can(PERMISSIONS.bankWrite);
  const canApprovals = can(PERMISSIONS.pageApprovalRules);
  const canFilenames = can(PERMISSIONS.pageFileNaming);
  const canCostAnalysis = can(PERMISSIONS.pageReports);
  const canTeam = can(PERMISSIONS.pageTeam);
  const canLog = can(PERMISSIONS.pageActivityLog);
  const canTrash = can(PERMISSIONS.pageTrash);
  const canNotificationSettings = can(PERMISSIONS.settingsManage);

  return useMemo(() => {
    const build = (spec: TourSpec): TourDefinition => ({
      id: spec.id,
      version: spec.version,
      steps: spec.steps.map(({ target, key, placement, titleKey }) => ({
        target,
        title: titleKey ? t(titleKey) : t(`${spec.namespace}.${key}.title`),
        content: [
          { kind: "paragraph", text: t(`${spec.namespace}.${key}.text`) },
          { kind: "callout", tone: "info", text: t(`${spec.namespace}.${key}.hint`) },
        ],
        placement,
      })),
    });

    const map: TourMap = {};
    for (const [path, spec] of Object.entries(BY_PATH)) {
      map[path] = build(spec);
    }

    map["/"] = build(overviewSpec(!isMobile, canCostAnalysis));
    map["/eingangsrechnungen"] = build(incomingListSpec(hasQueueCards));
    map["/ausgangsrechnungen"] = build(OUTGOING);
    map["/postfach"] = build(MAILBOX);
    map["/onboarding"] = build(ONBOARDING);
    map["/offene-posten"] = build(reconcileSpec());
    map["/opos-whitelist"] = build(oposSpec(canOposWrite));
    map["/bankkonten"] = build(bankAccountsSpec(tab));
    map["/zuordnungsregeln"] = build(
      assignmentSpec(tab, ["regeln", "spielplatz", "suggestions"], "tabsRegeln"),
    );
    map["/benachrichtigungen"] = build(
      notificationsSpec(tab, canNotificationSettings, hasSlackChannel),
    );
    if (canApprovals) {
      map["/freigabe-regeln"] = build(APPROVALS);
    }
    if (canFilenames) {
      map["/dateibenennung"] = build(FILENAMES);
    }
    if (canCostAnalysis) {
      map["/auswertungen"] = build(COST_ANALYSIS);
    }
    if (canTeam) {
      map["/team"] = build(teamSpec(tab, permissionCategories));
    }
    if (canLog) {
      map["/protokoll"] = build(LOG);
    }
    if (canTrash) {
      map["/papierkorb"] = build(TRASH);
    }

    const detail = DETAIL_PATHS.find((d) => d.pattern.test(pathname));
    if (detail) {
      map[pathname] = build(detail.spec);
    }
    return map;
  }, [
    t,
    isMobile,
    pathname,
    tab,
    hasQueueCards,
    canOposWrite,
    canApprovals,
    canFilenames,
    canCostAnalysis,
    canTeam,
    canLog,
    canTrash,
    canNotificationSettings,
    hasSlackChannel,
    permissionCategories,
  ]);
}
