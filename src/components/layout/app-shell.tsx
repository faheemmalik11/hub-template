import { type ReactNode, useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Settings2,
  BellRing,
  TriangleAlert,
  ArrowLeftRight,
  Banknote,
  Building2,
  ClipboardList,
  Coins,
  Database,
  FileInput,
  FileOutput,
  FileText,
  HandCoins,
  Files,
  Folder,
  FolderTree,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LogOut,
  UserRound,
  type LucideIcon,
  Percent,
  PiggyBank,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { AppNotificationBell } from "@/components/layout/notification-bell";
import {
  Shell,
  isShellGroup,
  ShellFooterGroup,
  type ShellBadge,
  type ShellNavEntry,
} from "@/kit/components/shell";
import { TourButton, TourProvider } from "@/kit/components/tour";
import { Avatar } from "@/kit/ui";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu } from "@/components/ui/sidebar";
import { NoAccess } from "@/components/layout/no-access";
import { featureKeyForPath } from "@/config/routes";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS, type PermissionKey } from "@/config/permissions";
import { useActingAs, useInvoicesReturnedToMe } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { useTourLabels, useTours } from "@/lib/tour/tours";
import { useTourSeenStore } from "@/lib/tour/use-tour-seen-store";
import { TourOpenFlag } from "@/lib/tour/tour-open-flag";
import { cn } from "@/lib/utils";

// `labelKey` is an i18n key (resolved below via t()) — labels are translated, not hard-coded.
// `roles` is a UX-only filter (Briefing Screen 17 / Appendix A7) — undefined means visible to
// every role. The real boundary is RLS; hiding a link here just keeps the menu honest about what
// a role can actually do, it doesn't grant or withhold anything by itself.
type NavLink = {
  labelKey: string;
  to: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  tourId?: string;
};
type NavGroup = {
  labelKey: string;
  icon: LucideIcon;
  items: NavLink[];
  permission?: PermissionKey;
  tourId?: string;
};
type NavEntry = NavLink | NavGroup;

// A7: "Only management sees the evaluation/BWA — the assistant does not see it." The one
// explicit exclusion in the briefing; supervisor is left visible since nothing restricts it.

// Grouped so the sidebar stays scannable — related pages collapse under one parent instead of
// each being a top-level row. This array is also what the breadcrumb trail reads.
const nav: NavEntry[] = [
  { labelKey: "nav.uebersicht", to: "/", icon: LayoutDashboard },
  {
    labelKey: "nav.rechnungen",
    tourId: "shell-nav-rechnungen",
    icon: Files,
    items: [
      { labelKey: "nav.eingangsrechnungen", to: "/incoming-invoices", icon: FileInput },
      { labelKey: "nav.ausgangsrechnungen", to: "/outgoing-invoices", icon: FileOutput },
      { labelKey: "nav.manuelleBuchungen", to: "/manual-bookings", icon: Banknote },
      {
        labelKey: "nav.dateibenennung",
        to: "/file-naming",
        icon: Receipt,
        permission: PERMISSIONS.pageFileNaming,
      },
      { labelKey: "nav.postfach", to: "/inbox", icon: Settings },
    ],
  },
  {
    labelKey: "nav.zahlungen",
    tourId: "shell-nav-zahlungen",
    icon: Wallet,
    items: [
      { labelKey: "nav.offenePosten", to: "/open-items", icon: Coins },
      { labelKey: "nav.banktransaktionen", to: "/bank-transactions", icon: ArrowLeftRight },
      // Bank connections used to be a second entry here. They are now the group headers of the
      // accounts table on /bankkonten, together with the sync controls and the sync log, so the
      // menu no longer offers two routes to the same subject. The connection layer is still gated
      // by PERMISSIONS.pageBankConnections inside that page, for the same reason the nav entry
      // was: bank_connections and bank_sync_logs carry the BANKSapi access handles and the banking
      // relationship, neither has a company_id to scope by, and migration 20260819160000 denies
      // both to the assistant role at the database.
      { labelKey: "nav.bankkonten", to: "/bank-accounts", icon: Landmark },
      { labelKey: "nav.oposWhitelist", to: "/opos-whitelist", icon: ListChecks },
      // Readable by everyone, writable by an admin. The one setting on it explains behaviour the
      // whole team meets daily -- how far a payment may miss an invoice and still be suggested --
      // so hiding the page from non-admins would make that behaviour look arbitrary.
      { labelKey: "nav.bankEinstellungen", to: "/bank-settings", icon: Settings2 },
    ],
  },
  {
    labelKey: "nav.stammdaten",
    tourId: "shell-nav-stammdaten",
    icon: Database,
    items: [
      { labelKey: "nav.lieferanten", to: "/suppliers", icon: Users },
      { labelKey: "nav.kunden", to: "/customers", icon: Users },
      { labelKey: "nav.gesellschaften", to: "/companies", icon: Building2 },
      { labelKey: "nav.objekte", to: "/properties", icon: Folder },
      { labelKey: "nav.kategorien", to: "/categories", icon: FolderTree },
    ],
  },
  {
    labelKey: "nav.regeln",
    tourId: "shell-nav-regeln",
    icon: ClipboardList,
    items: [
      { labelKey: "nav.zuordnungsregeln", to: "/assignment-rules", icon: Tags },
      // Admin-only: approvers/approval_rules writes are RLS-gated to is_admin() -- hiding the
      // link keeps the menu honest.
      {
        labelKey: "nav.freigabeRegeln",
        to: "/approval-rules",
        icon: ShieldCheck,
        permission: PERMISSIONS.pageApprovalRules,
      },
      { labelKey: "nav.ausschlussregeln", to: "/exclusion-rules", icon: Trash2 },
    ],
  },
  {
    labelKey: "nav.steuern",
    tourId: "shell-nav-steuern",
    icon: HandCoins,
    items: [
      { labelKey: "nav.ustRegeln", to: "/vat-rules", icon: Percent },
      { labelKey: "nav.steuerruecklage", to: "/vat-reserve", icon: PiggyBank },
      { labelKey: "nav.datevUebergabe", to: "/datev-handover", icon: FileText },
    ],
  },
  {
    labelKey: "nav.auswertungen",
    to: "/reports",
    tourId: "shell-nav-auswertungen",
    icon: PieChart,
    permission: PERMISSIONS.pageReports,
  },
];

const adminNav: NavGroup = {
  labelKey: "nav.verwaltung",
  icon: Settings,
  items: [
    { labelKey: "nav.team", to: "/team", icon: Users, permission: PERMISSIONS.pageTeam },
    { labelKey: "nav.onboarding", to: "/onboarding", icon: ListChecks },
    {
      labelKey: "nav.benachrichtigungen",
      to: "/notifications",
      icon: BellRing,
      permission: PERMISSIONS.settingsManage,
    },
    {
      labelKey: "nav.protokoll",
      to: "/activity-log",
      icon: ScrollText,
      permission: PERMISSIONS.pageActivityLog,
    },
    {
      labelKey: "nav.papierkorb",
      to: "/trash",
      icon: Trash2,
      permission: PERMISSIONS.pageTrash,
    },
  ],
};

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Unrestricted entries (no `roles`) are always visible, including while the role is still
// resolving -- that's most of the nav, and hiding it during the brief profile fetch would flicker
// the whole menu. Role-restricted entries are the opposite: hidden until a role is positively
// known to qualify, not shown-then-redirected. That asymmetry is deliberate, not an oversight --
// has_company_access() defaults data visibility open (an assistant must see the intake queue
// immediately), but an admin-only menu item flashing at a non-admin who then bounces off a
// redirect is just sloppy UX, not a data-access concern RLS needs to cover either way.
function visibleWith(permission: PermissionKey | undefined, can: (k: string) => boolean): boolean {
  if (!permission) return true;
  return can(permission);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role, pictureUrl, can, permissionsUnavailable, logout } = useAuth();
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageFeature = featureKeyForPath(pathname);
  const pageIsLiveForThisPerson = pageFeature === null || can(pageFeature);
  const showDenied = !permissionsUnavailable && !pageIsLiveForThisPerson;
  const shellNav = useMemo<ShellNavEntry[]>(
    () =>
      nav
        .filter((entry) => visibleWith(entry.permission, can))
        .map((entry) =>
          isGroup(entry)
            ? {
                key: entry.labelKey,
                label: t(entry.labelKey),
                icon: entry.icon,
                tourId: entry.tourId,
                items: entry.items
                  .filter((child) => visibleWith(child.permission, can))
                  .map((child) => ({
                    key: child.to,
                    label: t(child.labelKey),
                    to: child.to,
                    icon: child.icon,
                  })),
              }
            : {
                key: entry.to,
                label: t(entry.labelKey),
                to: entry.to,
                icon: entry.icon,
                tourId: entry.tourId,
              },
        )
        .filter((entry) => !isShellGroup(entry) || entry.items.length > 0),
    [can, t],
  );

  // In-app "returned to me" notification (Briefing Screen 6) — no email/push, just a count badge
  // on the group the invoices tab lives under, refreshed on the normal query staleTime.
  const { actingAs } = useActingAs();
  const returnedToMeQ = useInvoicesReturnedToMe(actingAs?.id ?? null, actingAs?.name ?? null);
  const returnedToMeCount = returnedToMeQ.data?.length ?? 0;

  const badges = useMemo<Record<string, ShellBadge>>(
    () => ({
      "nav.rechnungen": {
        count: returnedToMeCount,
        title: t("nav.rueckfrageAnMich", { count: returnedToMeCount }),
      },
    }),
    [returnedToMeCount, t],
  );

  const adminItems = useMemo(
    () => adminNav.items.filter((child) => visibleWith(child.permission, can)),
    [can],
  );
  const adminActive = adminItems.some((child) => pathname.startsWith(child.to));

  const tours = useTours();
  const tourLabels = useTourLabels();
  const tourSeenStore = useTourSeenStore();

  const staticLeafLabels = useMemo(
    () => ({
      upload: t("breadcrumb.upload"),
      new: t("breadcrumb.ausgangsrechnungNeu"),
      "/outgoing-invoices/upload": t("breadcrumb.ausgangsrechnungHochladen"),
      // The Administration rail lives in the footer, outside the nav the crumb builder walks, so
      // its pages' names have to come from this map.
      ...Object.fromEntries(adminNav.items.map((item) => [item.to.slice(1), t(item.labelKey)])),
    }),
    [t],
  );

  return (
    <TourProvider tours={tours} pathname={pathname} labels={tourLabels} seenStore={tourSeenStore}>
      <TourOpenFlag />
      <Shell
        nav={shellNav}
        badges={badges}
        toaster={<Toaster position="bottom-right" />}
        homeLabel={t("nav.uebersicht")}
        staticLeafLabels={staticLeafLabels}
        breadcrumbAriaLabel={t("breadcrumb.ariaLabel")}
        closeLabel={t("nav.menu")}
        logo={
          <Link
            to="/"
            aria-label={t("nav.toOverview")}
            className="flex items-center gap-2 overflow-hidden"
          >
            <Logo className="h-7 shrink-0 group-data-[collapsible=icon]:h-6" />
          </Link>
        }
        headerActions={
          <>
            <TourButton />
            <LanguageSwitch />
            <AppNotificationBell />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer gap-2 pl-1.5 pr-2 hover:bg-transparent"
                  >
                    <Avatar name={user.name} email={user.email} imageUrl={pictureUrl} size="sm" />
                    <span className="hidden max-w-[12rem] truncate text-sm text-foreground sm:inline">
                      {user.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  collisionPadding={12}
                  className={cn(
                    "w-56 overflow-visible border-t-4 border-t-primary shadow-xl",
                    "relative before:absolute before:h-0 before:w-0 before:right-5 before:content-['']",
                    "data-[side=bottom]:before:-top-2 data-[side=bottom]:before:border-x-8 data-[side=bottom]:before:border-b-8 data-[side=bottom]:before:border-x-transparent data-[side=bottom]:before:border-b-primary",
                    "data-[side=top]:before:-bottom-2 data-[side=top]:before:border-x-8 data-[side=top]:before:border-t-8 data-[side=top]:before:border-x-transparent data-[side=top]:before:border-t-primary",
                  )}
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                    {role && (
                      <span className="mt-1.5 inline-flex rounded-md bg-brand-wash px-1.5 py-0.5 text-[0.7rem] font-medium text-brand-dark">
                        {t(`team.role.${role}`)}
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/profile">
                      <UserRound className="size-4" />
                      {t("nav.meinProfil")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="cursor-pointer">
                    <LogOut className="size-4" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
        footer={
          adminItems.length > 0 ? <AdminMenu items={adminItems} active={adminActive} /> : undefined
        }
      >
        {permissionsUnavailable && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>{t("access.permissionsNotLoaded")}</span>
          </div>
        )}
        {showDenied ? <NoAccess variant="page" /> : children}
      </Shell>
    </TourProvider>
  );
}

function AdminMenu({ items, active }: { items: NavLink[]; active: boolean }) {
  const { t } = useTranslation();
  return (
    <SidebarMenu>
      <ShellFooterGroup
        label={t(adminNav.labelKey)}
        icon={adminNav.icon}
        tourId="shell-nav-verwaltung"
        items={items.map((child) => ({
          key: child.to,
          label: t(child.labelKey),
          to: child.to,
          icon: child.icon,
        }))}
        active={active}
      />
    </SidebarMenu>
  );
}
