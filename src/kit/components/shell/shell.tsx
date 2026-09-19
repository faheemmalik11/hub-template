import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, X, type LucideIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { HintTooltip } from "../../ui/hint-tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { useIsMobile } from "../../hooks/use-mobile";
import { Separator } from "../../ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarToggleHandle,
  SidebarTrigger,
  useSidebar,
} from "../../ui/sidebar";
import { Toaster } from "../../ui/sonner";
import { TooltipProvider } from "../../ui/tooltip";
import { cn } from "../../lib/class-names";
import { buildCrumbs } from "./breadcrumbs";
import {
  flattenShellLinks,
  isShellGroup,
  type ShellBadge,
  type ShellNavEntry,
  type ShellNavGroup,
  type ShellNavLink,
} from "./types";

const ShellLeafLabelContext = createContext<{
  label: string | null;
  setLabel: (label: string | null) => void;
}>({ label: null, setLabel: () => {} });

export function useShellLeafLabel(label: string | null) {
  const { setLabel } = useContext(ShellLeafLabelContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [setLabel, label]);
}

// For projects composing their own layout instead of using Shell: wrap the app once so
// ShellBreadcrumbs and useShellLeafLabel share the same leaf-label state.
export function ShellLeafLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <ShellLeafLabelContext.Provider value={value}>{children}</ShellLeafLabelContext.Provider>;
}

export function useShellCrumbs({
  nav,
  homeLabel,
  staticLeafLabels,
}: {
  nav: ShellNavEntry[];
  homeLabel: string;
  staticLeafLabels?: Record<string, string>;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { label: leafLabel } = useContext(ShellLeafLabelContext);
  return useMemo(() => {
    const built = buildCrumbs({ nav, pathname, homeLabel, staticLeafLabels });
    if (leafLabel && built.length > 1) {
      built[built.length - 1] = { ...built[built.length - 1], label: leafLabel };
    }
    return built;
  }, [nav, pathname, homeLabel, staticLeafLabels, leafLabel]);
}

export interface ShellProps {
  nav: ShellNavEntry[];
  logo: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  badges?: Record<string, ShellBadge>;
  homeLabel: string;
  staticLeafLabels?: Record<string, string>;
  breadcrumbAriaLabel?: string;
  closeLabel?: string;
  toaster?: ReactNode;
  children: ReactNode;
}

export function ShellFooterGroup({
  label,
  icon: Icon,
  items,
  active,
  tourId,
}: {
  label: string;
  icon: LucideIcon;
  items: ShellNavLink[];
  active: boolean;
  tourId?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { state, isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem data-tour={tourId}>
        <ShellRailMenu label={label} icon={Icon} items={items} active={active} align="end" />
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      {/* Opens upward. This group is pinned to the bottom of the sidebar, so growing downward
          like the nav groups above would push its items past the screen edge, which reads as a
          click that did nothing. The content renders BEFORE the trigger so it stacks above it. */}
      <SidebarMenuItem ref={groupRef} className="flex flex-col" data-tour={tourId}>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          {/* Styled as the SAME card the collapsed rail shows, not as an inline sub-list: this
              group reads as one panel in both sidebar states, so the surface, rounding, border,
              primary left accent and shadow are carried over from ShellRailMenu's popover. */}
          <SidebarMenuSub className="mx-1 mb-1 gap-0.5 rounded-md border border-l-4 border-border border-l-primary bg-popover p-1 shadow-xl">
            {items.map((child) => {
              const childActive =
                child.to === "/" ? pathname === "/" : pathname.startsWith(child.to);
              return (
                <SidebarMenuSubItem key={child.key}>
                  <SidebarMenuSubButton asChild isActive={childActive}>
                    <Link
                      to={child.to}
                      aria-current={childActive ? "page" : undefined}
                      onClick={() => {
                        setOpen(false);
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <child.icon className="size-4" />
                      <HintTooltip label={child.label}>
                        <span className="truncate">{child.label}</span>
                      </HintTooltip>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
        <CollapsibleTrigger asChild>
          {/* No isActive on the trigger: like the other nav groups, only the child that IS the
              current page carries the highlight. */}
          <SidebarMenuButton>
            <Icon />
            <HintTooltip label={label}>
              <span className="truncate">{label}</span>
            </HintTooltip>
            {/* Same chevron behaviour as the nav groups above: down while closed, flipped up
                once open. Consistency with the rest of the sidebar beats hinting the direction
                the panel happens to grow in. */}
            <ChevronDown className="ml-auto size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function ShellRailMenu({
  label,
  icon: Icon,
  items,
  active,
  align = "start",
}: {
  label: string;
  icon: LucideIcon;
  items: ShellNavEntry[];
  active: boolean;
  align?: "start" | "end";
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton isActive={active}>
          <Icon />
          <span>{label}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "right"}
        align={isMobile ? "start" : align}
        sideOffset={isMobile ? 8 : 10}
        collisionPadding={12}
        className={cn(
          "min-w-52 max-w-[calc(100vw-2rem)] overflow-visible border-l-4 border-l-primary shadow-xl",
          "relative before:absolute before:h-0 before:w-0 before:content-['']",
          "data-[side=right]:before:-left-2 data-[side=right]:before:border-y-8 data-[side=right]:before:border-r-8 data-[side=right]:before:border-y-transparent data-[side=right]:before:border-r-primary",
          "data-[side=right]:data-[align=start]:before:top-4 data-[side=right]:data-[align=end]:before:bottom-4",
          "data-[side=top]:before:-bottom-2 data-[side=top]:before:left-5 data-[side=top]:before:border-x-8 data-[side=top]:before:border-t-8 data-[side=top]:before:border-x-transparent data-[side=top]:before:border-t-primary",
        )}
      >
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {flattenShellLinks(items).map((child) => {
          const childActive = child.to === "/" ? pathname === "/" : pathname.startsWith(child.to);
          return (
            <DropdownMenuItem key={child.key} asChild>
              <Link
                to={child.to}
                aria-current={childActive ? "page" : undefined}
                onClick={() => isMobile && setOpenMobile(false)}
                className={cn("cursor-pointer", childActive && "font-medium text-brand")}
              >
                <child.icon className="size-4" />
                {child.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The breadcrumb header bar, extracted so a custom layout can reuse it without Shell.
// Requires ShellLeafLabelProvider (or Shell itself) above it for detail-page leaf labels.
export function ShellHeader({
  nav,
  homeLabel,
  staticLeafLabels,
  breadcrumbAriaLabel,
  actions,
}: {
  nav: ShellNavEntry[];
  homeLabel: string;
  staticLeafLabels?: Record<string, string>;
  breadcrumbAriaLabel?: string;
  actions?: ReactNode;
}) {
  const crumbs = useShellCrumbs({ nav, homeLabel, staticLeafLabels });
  // useIsMobile rather than useSidebar: this header is exported for custom layouts to reuse on
  // their own, and useSidebar throws outside a SidebarProvider. The trigger it gates still needs
  // that provider, but only on mobile — which is exactly where it now renders.
  const isMobile = useIsMobile();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-[var(--shell-header,var(--background))]/85 px-4 backdrop-blur-sm">
      {/* MOBILE ONLY. On desktop, SidebarToggleHandle owns collapse/expand and sits on this
          header's own bottom border where the sidebar's edge crosses it — a second toggle a few
          pixels from it was the pair of overlapping icons in that corner. But that handle renders
          nothing on mobile (the sidebar is an offcanvas sheet there, with no edge to pin to and
          nothing to resize), so dropping this outright would leave a phone with no way to OPEN the
          nav at all — the sheet's own X only closes it. */}
      {isMobile && (
        <>
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="mr-1 h-4 shrink-0" />
        </>
      )}
      <Breadcrumb aria-label={breadcrumbAriaLabel} className="min-w-0">
        <BreadcrumbList className="flex-nowrap sm:hidden">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{crumbs[crumbs.length - 1]?.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>

        <BreadcrumbList className="hidden flex-nowrap sm:flex">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <BreadcrumbItem key={`${crumb.label}-${i}`} className="min-w-0">
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : crumb.to ? (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate text-muted-foreground">{crumb.label}</span>
                )}
                {!last && <BreadcrumbSeparator className="shrink-0" />}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">{actions}</div>}
    </header>
  );
}

export function Shell({
  nav,
  logo,
  footer,
  headerActions,
  badges,
  homeLabel,
  staticLeafLabels,
  breadcrumbAriaLabel,
  closeLabel,
  toaster,
  children,
}: ShellProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <ShellLeafLabelProvider>
        <SidebarProvider>
          <ShellSidebar
            nav={nav}
            logo={logo}
            footer={footer}
            badges={badges}
            closeLabel={closeLabel}
          />
          <SidebarInset className="min-w-0 bg-[var(--shell-wash,transparent)]">
            <ShellHeader
              nav={nav}
              homeLabel={homeLabel}
              staticLeafLabels={staticLeafLabels}
              breadcrumbAriaLabel={breadcrumbAriaLabel}
              actions={headerActions}
            />
            <main className="w-full min-w-0 px-4 py-4 sm:px-6">{children}</main>
            {toaster === undefined ? <Toaster position="bottom-right" /> : toaster}
          </SidebarInset>
        </SidebarProvider>
      </ShellLeafLabelProvider>
    </TooltipProvider>
  );
}

// Just the nav list (links, collapsible groups, badges, rail flyouts) — exported so a custom
// sidebar can place the standard menu inside its own frame.
export function ShellNavMenu({
  nav,
  badges,
}: {
  nav: ShellNavEntry[];
  badges?: Record<string, ShellBadge>;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const railCollapsed = state === "collapsed" && !isMobile;
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <SidebarMenu>
      {nav.map((item) => {
        const badge = badges?.[item.key];
        const showBadge = !!badge && badge.count > 0;

        if (!isShellGroup(item)) {
          const active = isActive(item.to);
          return (
            <SidebarMenuItem key={item.key} data-tour={item.tourId}>
              <SidebarMenuButton asChild isActive={active}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  onClick={closeOnMobile}
                >
                  <item.icon />
                  <HintTooltip label={item.label}>
                    <span className="truncate">{item.label}</span>
                  </HintTooltip>
                </Link>
              </SidebarMenuButton>
              {showBadge && <ShellBadgePill badge={badge} />}
            </SidebarMenuItem>
          );
        }

        const groupActive = flattenShellLinks(item.items).some((c) => isActive(c.to));

        if (railCollapsed) {
          return (
            <SidebarMenuItem key={item.key} data-tour={item.tourId}>
              <ShellRailMenu
                label={item.label}
                icon={item.icon}
                items={item.items}
                active={groupActive}
              />
              {showBadge && <ShellBadgePill badge={badge} />}
            </SidebarMenuItem>
          );
        }

        return (
          <ShellNavGroupItem
            key={item.key}
            item={item}
            groupActive={groupActive}
            isActive={isActive}
            closeOnMobile={closeOnMobile}
            badge={showBadge ? badge : undefined}
          />
        );
      })}
    </SidebarMenu>
  );
}

// The complete sidebar (logo header, nav, optional footer, collapse rail) — exported so a
// custom layout can keep the standard sidebar while replacing the rest of Shell.
export function ShellSidebar({
  nav,
  logo,
  footer,
  badges,
  closeLabel,
}: Pick<ShellProps, "nav" | "logo" | "footer" | "badges" | "closeLabel">) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 flex-row items-center justify-between px-3">
          {logo}
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              aria-label={closeLabel}
              className="-mr-1 shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          )}
        </SidebarHeader>

        <SidebarContent data-tour="shell-nav">
          <SidebarGroup>
            <ShellNavMenu nav={nav} badges={badges} />
          </SidebarGroup>
        </SidebarContent>

        {footer && <SidebarFooter className="gap-2">{footer}</SidebarFooter>}
      </Sidebar>

      {/* OUTSIDE <Sidebar>, not a stray. The sidebar frame is `fixed z-10`, a stacking context no
          child can escape, so in there this button painted under ShellHeader's sticky z-30 and
          came out as a clipped half-disc. As a sibling it stacks against the header normally. */}
      <SidebarToggleHandle />
    </>
  );
}

function ShellNavGroupItem({
  item,
  groupActive,
  isActive,
  closeOnMobile,
  badge,
}: {
  item: ShellNavGroup;
  groupActive: boolean;
  isActive: (to: string) => boolean;
  closeOnMobile: () => void;
  badge?: ShellBadge;
}) {
  const [open, setOpen] = useState(groupActive);
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem data-tour={item.tourId}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <item.icon />
            <HintTooltip label={item.label}>
              <span className="truncate">{item.label}</span>
            </HintTooltip>
            <ChevronDown className="ml-auto size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        {badge && <ShellBadgePill badge={badge} className="right-8" />}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub>
            {item.items.map((child) =>
              isShellGroup(child) ? (
                <ShellNavSubGroup
                  key={child.key}
                  item={child}
                  isActive={isActive}
                  closeOnMobile={closeOnMobile}
                />
              ) : (
                <SidebarMenuSubItem key={child.key} data-tour={child.tourId}>
                  <SidebarMenuSubButton asChild isActive={isActive(child.to)}>
                    <Link
                      to={child.to}
                      aria-current={isActive(child.to) ? "page" : undefined}
                      onClick={closeOnMobile}
                    >
                      <child.icon className="size-4" />
                      <HintTooltip label={child.label}>
                        <span className="truncate">{child.label}</span>
                      </HintTooltip>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ),
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/**
 * A group nested inside another group. Rendered as its own collapsible section rather than being
 * flattened into the parent: a Hub whose whole accounting module sits under one entry would
 * otherwise show fifteen screens as one undifferentiated list, which is what the sections are
 * there to prevent.
 */
function ShellNavSubGroup({
  item,
  isActive,
  closeOnMobile,
}: {
  item: ShellNavGroup;
  isActive: (to: string) => boolean;
  closeOnMobile: () => void;
}) {
  const groupActive = flattenShellLinks(item.items).some((child) => isActive(child.to));
  const [open, setOpen] = useState(groupActive);
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/subcollapsible">
      <SidebarMenuSubItem data-tour={item.tourId}>
        <CollapsibleTrigger asChild>
          <SidebarMenuSubButton className="cursor-pointer">
            <item.icon className="size-4" />
            <HintTooltip label={item.label}>
              <span className="truncate">{item.label}</span>
            </HintTooltip>
            <ChevronDown className="ml-auto size-4 shrink-0 opacity-60 transition-transform group-data-[state=open]/subcollapsible:rotate-180" />
          </SidebarMenuSubButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mr-0 translate-x-px pr-0">
            {flattenShellLinks(item.items).map((child) => (
              <SidebarMenuSubItem key={child.key}>
                <SidebarMenuSubButton asChild isActive={isActive(child.to)}>
                  <Link
                    to={child.to}
                    aria-current={isActive(child.to) ? "page" : undefined}
                    onClick={closeOnMobile}
                  >
                    <child.icon className="size-4" />
                    <HintTooltip label={child.label}>
                      <span className="truncate">{child.label}</span>
                    </HintTooltip>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  );
}

function ShellBadgePill({ badge, className }: { badge: ShellBadge; className?: string }) {
  return (
    <SidebarMenuBadge
      title={badge.title}
      className={cn("pointer-events-none bg-amber-500 text-white", className)}
    >
      {badge.count}
    </SidebarMenuBadge>
  );
}
