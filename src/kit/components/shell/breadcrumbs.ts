import {
  isShellGroup,
  type Crumb,
  type ShellNavEntry,
  type ShellNavGroup,
  type ShellNavLink,
} from "./types";

function findTrail(
  entries: ShellNavEntry[],
  base: string,
  groups: ShellNavGroup[] = [],
): { groups: ShellNavGroup[]; link: ShellNavLink } | undefined {
  for (const entry of entries) {
    if (isShellGroup(entry)) {
      const found = findTrail(entry.items, base, [...groups, entry]);
      if (found) return found;
    } else if (entry.to === base && entry.to !== "/") {
      return { groups, link: entry };
    }
  }
  return undefined;
}

function firstLink(entry: ShellNavEntry): ShellNavLink | undefined {
  if (!isShellGroup(entry)) return entry;
  for (const child of entry.items) {
    const found = firstLink(child);
    if (found) return found;
  }
  return undefined;
}

export function buildCrumbs({
  nav,
  pathname,
  homeLabel,
  staticLeafLabels = {},
}: {
  nav: ShellNavEntry[];
  pathname: string;
  homeLabel: string;
  staticLeafLabels?: Record<string, string>;
}): Crumb[] {
  if (pathname === "/") return [{ label: homeLabel }];

  const segments = pathname.split("/").filter(Boolean);
  const base = `/${segments[0]}`;
  const crumbs: Crumb[] = [{ label: homeLabel, to: "/" }];

  const trail = findTrail(nav, base);
  let page: ShellNavLink | undefined;
  if (trail) {
    for (const group of trail.groups) {
      crumbs.push({ label: group.label, to: firstLink(group)?.to });
    }
    page = trail.link;
  }

  const isLeafPage = segments.length === 1;
  if (page) {
    crumbs.push({ label: page.label, to: isLeafPage ? undefined : page.to });
  } else {
    crumbs.push({
      label: staticLeafLabels[segments[0]] ?? segments[0],
      to: isLeafPage ? undefined : base,
    });
  }

  if (!isLeafPage) {
    const leaf = segments[segments.length - 1];
    crumbs.push({ label: staticLeafLabels[leaf] ?? decodeURIComponent(leaf) });
  }

  return crumbs;
}
