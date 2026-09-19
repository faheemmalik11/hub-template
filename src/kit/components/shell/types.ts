import type { LucideIcon } from "lucide-react";

export type ShellNavLink = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  // Rendered as data-tour on the menu item, so a project's tour can spotlight this entry.
  tourId?: string;
};

export type ShellNavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: ShellNavEntry[];
  tourId?: string;
};

export type ShellNavEntry = ShellNavLink | ShellNavGroup;

export function isShellGroup(entry: ShellNavEntry): entry is ShellNavGroup {
  return "items" in entry;
}

export type ShellBadge = { count: number; title?: string };

export type Crumb = { label: string; to?: string };

export function flattenShellLinks(entries: ShellNavEntry[]): ShellNavLink[] {
  return entries.flatMap((entry) => (isShellGroup(entry) ? flattenShellLinks(entry.items) : entry));
}
