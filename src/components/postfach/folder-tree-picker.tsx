"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, Minus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FolderOption } from "@/lib/postfach/folder-option";

export interface FolderNode {
  id: string;
  name: string;
  children: FolderNode[];
}

// Neither Graph mailFolders nor Dropbox's list_folder come back pre-nested in a form this can
// render directly — this turns the flat list, plus each folder's parentId (see
// src/lib/graph/mail-folders.server.ts / src/lib/dropbox/folders.server.ts), into an actual tree,
// so the picker can show real nesting instead of an alphabetical soup where two folders named the
// same in different places are indistinguishable. A folder whose parent isn't itself in the
// fetched set becomes a top-level node.
export function buildFolderTree(folders: FolderOption[]): FolderNode[] {
  const byId = new Map<string, FolderNode>(
    folders.map((f) => [f.id, { id: f.id, name: f.name, children: [] }]),
  );
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = byId.get(f.id)!;
    const parent = f.parentId ? byId.get(f.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// Every ancestor id of the given target ids, so a saved selection several levels deep is expanded
// and visible the moment the picker opens rather than hidden under collapsed parents.
function ancestorIdsOf(nodes: FolderNode[], targetIds: Set<string>): Set<string> {
  const ancestors = new Set<string>();
  function walk(node: FolderNode, path: string[]): boolean {
    let matched = targetIds.has(node.id);
    for (const child of node.children) {
      if (walk(child, [...path, node.id])) matched = true;
    }
    if (matched) path.forEach((id) => ancestors.add(id));
    return matched;
  }
  nodes.forEach((n) => walk(n, []));
  return ancestors;
}

// Every node id that has at least one selected DESCENDANT (not counting the node's own selection
// state) — a parent otherwise shows nothing when a folder nested under it is selected, so a
// selection several levels deep can silently sit invisible on a collapsed or unselected parent.
function idsWithSelectedDescendant(nodes: FolderNode[], targetIds: Set<string>): Set<string> {
  const result = new Set<string>();
  function walk(node: FolderNode): boolean {
    let anySelectedBelow = false;
    for (const child of node.children) {
      if (targetIds.has(child.id) || walk(child)) anySelectedBelow = true;
    }
    if (anySelectedBelow) result.add(node.id);
    return anySelectedBelow;
  }
  nodes.forEach((n) => walk(n));
  return result;
}

// Prune the tree to what matches `query`, keeping each match's ancestor chain so a hit stays
// readable in context instead of appearing as a bare name with no idea which drive or parent it
// belongs to. A folder that matches keeps its ENTIRE subtree (not just matching children), so
// searching for a parent still lets its subfolders be browsed and selected without clearing the
// search first.
function filterTree(nodes: FolderNode[], query: string): FolderNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: FolderNode[] = [];
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(q)) {
      out.push(node);
      continue;
    }
    const children = filterTree(node.children, q);
    if (children.length > 0) out.push({ ...node, children });
  }
  return out;
}

// Every node id that has a MATCHING DESCENDANT — the ancestor chains that have to be opened while
// searching, or a hit several levels down stays hidden behind collapsed parents. Membership is
// decided purely by what lies BELOW a node, never by its own name: a folder that matches but
// contains no further match renders collapsed with its chevron intact, so searching a folder near
// the root does not dump its whole subtree into the list.
function idsOnPathToMatch(nodes: FolderNode[], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const ids = new Set<string>();
  function walk(node: FolderNode): boolean {
    const selfMatches = node.name.toLowerCase().includes(q);
    let hasMatchBelow = false;
    for (const child of node.children) {
      if (walk(child)) hasMatchBelow = true;
    }
    if (hasMatchBelow) ids.add(node.id);
    return selfMatches || hasMatchBelow;
  }
  nodes.forEach((n) => walk(n));
  return ids;
}

// Every descendant id of one node, flattened (not including the node itself).
function descendantIds(node: FolderNode): string[] {
  const ids: string[] = [];
  function walk(n: FolderNode) {
    for (const child of n.children) {
      ids.push(child.id);
      walk(child);
    }
  }
  walk(node);
  return ids;
}

// Folder tree browser (Briefing Screen 1), used for both the mailbox (Graph) and filing (Dropbox)
// pickers: expand/collapse real nesting, select a folder at any level — a nested folder or a main
// one, same as any other. Same Popover-button shell as the flat Combobox/MultiCombobox elsewhere
// in this app, so it fits the same form layout; the content is a tree instead of a flat searchable
// list because that's what distinguishing nested folders with the same name actually requires.
export function FolderTreePicker({
  folders,
  multi,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  folders: FolderOption[] | undefined;
  multi: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState("");

  const tree = React.useMemo(() => buildFolderTree(folders ?? []), [folders]);
  const searching = search.trim().length > 0;
  const visibleTree = React.useMemo(() => filterTree(tree, search), [tree, search]);

  // The ORIGINAL node for an id, so the multi-select cascade below always walks the real subtree.
  // Looking up descendants on the RENDERED node would, mid-search, cascade only the folders that
  // happen to match the query — checking a parent would then silently miss its filtered-out
  // children, breaking the "select this folder and everything under it" promise.
  const nodeById = React.useMemo(() => {
    const map = new Map<string, FolderNode>();
    const walk = (nodes: FolderNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);
  const nameById = React.useMemo(
    () => new Map((folders ?? []).map((f) => [f.id, f.name])),
    [folders],
  );
  const hasSelectedDescendant = React.useMemo(
    () => idsWithSelectedDescendant(tree, new Set(value)),
    [tree, value],
  );

  // Auto-expand ancestors of the current selection whenever the tree itself changes (first load,
  // a refetch) — a value several levels deep must not look "not selected" just because its parents
  // start out collapsed.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestorIdsOf(tree, new Set(value)).forEach((id) => next.add(id));
      return next;
    });
    // Only re-run when the tree identity changes, not on every value change — expanding on every
    // selection edit would fight a user who deliberately collapsed a branch back up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  // What the effect below force-opened, so it can be rolled back once the query is gone. Merging
  // without ever un-merging left the tree permanently expanded down every path a query once
  // matched -- branches the user never opened, still hanging open after the search was cleared or
  // the picker closed and reopened.
  const searchForced = React.useRef<Set<string>>(new Set());
  // Open the ancestor chains leading to a search hit, or a match several levels down stays hidden
  // behind collapsed parents. Merged INTO `expanded` rather than layered over it as a separate
  // override, deliberately: with one source of truth a row clicked during a search really does
  // collapse, whereas an override would win over the click and leave the row looking dead while
  // still recording it, flipping the row to expanded once the query cleared.
  React.useEffect(() => {
    if (!searching) {
      if (searchForced.current.size === 0) return;
      const forced = searchForced.current;
      searchForced.current = new Set();
      setExpanded((prev) => {
        // Ancestors of the current selection are exempt: the effect above opens those on purpose
        // and only re-runs on a tree change, so collapsing one here would bury a folder the user
        // ticked DURING the search with nothing left to re-open it. `value` is read without being
        // a dependency deliberately -- this branch runs on the render where the query cleared, so
        // the closure already holds that render's selection.
        const keep = ancestorIdsOf(tree, new Set(value));
        const next = new Set(prev);
        // Only ids the search itself opened and the user never touched afterwards -- toggling a
        // row by hand hands it back to the user (see toggleExpanded).
        forced.forEach((id) => {
          if (!keep.has(id)) next.delete(id);
        });
        return next;
      });
      return;
    }
    setExpanded((prev) => {
      const forced = idsOnPathToMatch(tree, search);
      const added = [...forced].filter((id) => !prev.has(id));
      if (added.length === 0) return prev; // no change: keep the same Set
      const next = new Set(prev);
      added.forEach((id) => {
        next.add(id);
        searchForced.current.add(id);
      });
      return next;
    });
    // `value` is read by the rollback branch but deliberately NOT a dependency: re-running on every
    // selection edit would re-force rows the user collapsed mid-search, which is exactly the
    // "row looks dead" behaviour the merge above avoids. The branch only runs on the render where
    // the query cleared, so the closure's `value` is already that render's selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, search, searching]);

  // Every close path goes through here. Radix only calls `onOpenChange` from its OWN internal state
  // setter, so with `open` controlled here a plain setOpen(false) from our handlers never reaches
  // it — resetting the query there alone left a stale filter behind on the single-select pickers,
  // which then reopened showing what looked like a near-empty folder list.
  function closePicker() {
    setOpen(false);
    setSearch("");
  }

  function toggleExpanded(id: string) {
    // Touching a row by hand takes it out of the search's ownership, both ways: a row the user
    // collapsed mid-search must not be "rolled back" a second time, and one they re-opened
    // themselves must not be closed again when the query clears.
    searchForced.current.delete(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Multi-select (source folders) cascades: checking a folder also checks every folder nested
  // under it, so all of them land in the saved list as their own explicit entries — each one
  // becomes an independent scan root for the pipeline. Without this, a folder nested below a
  // checked one could be missed depending on how deep the pipeline walks from any single
  // configured root; cascading the whole subtree in is what makes "select this folder" actually
  // mean "and everything under it". Single-select (the one destination/processed folder) never
  // cascades — only one folder can be a destination, so toggling always just replaces the single
  // selection, same as before.
  function toggleSelected(node: FolderNode) {
    if (multi) {
      const full = nodeById.get(node.id) ?? node;
      const subtreeIds = [node.id, ...descendantIds(full)];
      if (value.includes(node.id)) {
        const remove = new Set(subtreeIds);
        onChange(value.filter((v) => !remove.has(v)));
      } else {
        onChange([...new Set([...value, ...subtreeIds])]);
      }
    } else {
      onChange(value.includes(node.id) ? [] : [node.id]);
      closePicker();
    }
  }

  // A saved id the current fetch doesn't (yet, or any longer) return must stay visible in the
  // trigger summary — a folder deleted since, or a call that hasn't loaded/failed, must not make a
  // working configuration look silently empty. It just cannot be expanded/toggled inside the tree
  // itself, since there is no known parent path to place it under.
  // WHILE THE FOLDER LIST IS STILL LOADING an unknown id is not "a folder we cannot name" — it is
  // simply not looked up yet, and printing it raw put a Google id like "Label_8" on screen for a
  // moment, on the one screen whose stated promise is that nobody has to look at one. Those ids are
  // dropped until the list arrives, which leaves the trigger showing its placeholder (already
  // "Lädt …" during that window). Once the list HAS arrived, an id it does not contain is genuinely
  // unknown — a folder deleted since — and keeping it visible is deliberate: it stops a working
  // configuration from looking silently empty.
  const nochNichtGeladen = folders === undefined;
  const selectedLabels = value
    .map((id) => nameById.get(id) ?? (nochNichtGeladen ? null : id))
    .filter((label): label is string => label !== null);
  const missingCount = nochNichtGeladen ? 0 : value.filter((id) => !nameById.has(id)).length;

  const triggerLabel =
    selectedLabels.length === 0
      ? // Once the list has loaded, an empty single-select IS "no folder" — say so, instead of
        // "choose a folder …", which reads as an unanswered question. While still loading the
        // caller's placeholder ("Lädt …") stays.
        !multi && !nochNichtGeladen
        ? t("postfach.folder.keineAuswahl")
        : (placeholder ?? t("common.combobox.placeholder"))
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : t("common.multiCombobox.countSelected", { count: selectedLabels.length });

  function renderNode(node: FolderNode, depth: number) {
    const isExpanded = expanded.has(node.id);
    const isSelected = value.includes(node.id);
    // A selected folder nested under this one, while this folder itself isn't selected — shown as
    // a dash rather than nothing, so a selection several levels deep never looks invisible on a
    // collapsed or unselected parent.
    const isIndeterminate = !isSelected && hasSelectedDescendant.has(node.id);
    const hasChildren = node.children.length > 0;
    // The whole row toggles expand/collapse (a folder with children is clicked open, not just its
    // tiny chevron) — the checkbox/radio and the name stop that click from bubbling and toggle
    // selection instead, so "open this folder" and "select this folder" stay two clearly separate
    // actions sharing one row instead of fighting over the same click.
    return (
      <div key={node.id}>
        <div
          role={hasChildren ? "button" : undefined}
          tabIndex={hasChildren ? 0 : undefined}
          onClick={() => hasChildren && toggleExpanded(node.id)}
          onKeyDown={(e) => {
            if (hasChildren && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              toggleExpanded(node.id);
            }
          }}
          aria-label={
            hasChildren
              ? isExpanded
                ? t("postfach.folder.ordnerEinklappen")
                : t("postfach.folder.ordnerAusklappen")
              : undefined
          }
          className={cn(
            "flex items-center gap-1.5 rounded-md py-1.5 pr-1.5 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
            hasChildren && "cursor-pointer",
          )}
          style={{ paddingLeft: `${depth * 1.25 + 0.375}rem` }}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
              !hasChildren && "invisible",
            )}
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </span>
          {multi ? (
            <Checkbox
              checked={isSelected ? true : isIndeterminate ? "indeterminate" : false}
              onCheckedChange={() => toggleSelected(node)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // A REAL BUTTON, not a <span role="radio">. As a span it had no tabIndex and no key
            // handler, so the single-select picker could not be operated by keyboard at all: Tab
            // only ever reached a folder's expand chevron, Enter there merely expanded it, and a
            // leaf folder had no focusable element whatsoever. The multi-select variant was always
            // fine because it uses a real Checkbox — this is the same standard, applied to the
            // control next to it.
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={node.name}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelected(node);
              }}
              // Enter/Space already activate a button; this only stops the row behind it from
              // ALSO treating the same key as "expand this folder".
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") e.stopPropagation();
              }}
              className={cn(
                "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected || isIndeterminate
                  ? "border-brand bg-brand text-primary-foreground"
                  : "border-input",
              )}
            >
              {isSelected ? (
                <Check className="size-3" />
              ) : isIndeterminate ? (
                <Minus className="size-3" />
              ) : null}
            </button>
          )}
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggleSelected(node);
            }}
            className="min-w-0 flex-1 cursor-pointer truncate text-sm"
          >
            {node.name}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  return (
    <Popover
      open={open}
      // Covers only the dismissals Radix drives itself (outside click, Escape). Selecting a folder
      // closes via closePicker() instead, which Radix never learns about — see its comment.
      onOpenChange={(next) => (next ? setOpen(true) : closePicker())}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full cursor-pointer justify-between whitespace-normal px-3 py-2 text-left font-normal",
            selectedLabels.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        {/* Plain input rather than cmdk's CommandInput: this list is a tree, not a Command list, so
            there is no cmdk context to hang it off. Styled to match CommandInput exactly (see
            command.tsx) so it reads as the same search box the flat pickers use. */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 size-4 shrink-0 opacity-50" aria-hidden />
          <input
            // cmdk's CommandInput takes focus on open; matching that keeps this picker typeable the
            // instant it opens, same as the flat pickers next to it.
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.combobox.search")}
            aria-label={t("common.combobox.search")}
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="p-1">
          {/* Single-select: an explicit clear row, same discoverability as the flat Combobox's
              "keine Auswahl" entry — re-clicking an already-selected node also clears it, but
              that's less obvious than a dedicated row at the top.
              ALWAYS OFFERED, not only once something is selected: on the Immonetz screens the
              equivalent "— keiner —" is a permanent entry in the list, so "no folder" reads as a
              choice you can see and pick rather than a state you can only reach by undoing. */}
          {!multi && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                closePicker();
              }}
              className="mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              {t("postfach.folder.keineAuswahl")}
            </button>
          )}
          {visibleTree.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("common.combobox.empty")}</p>
          ) : (
            // Plain overflow-y-auto, not the Radix ScrollArea primitive: this is the same scroll
            // mechanism CommandList already uses everywhere else in this app (see command.tsx) —
            // ScrollArea's own viewport/custom-scrollbar layering is a different, untested pattern
            // here and was the actual cause of the popover's broken scroll.
            <div className="max-h-72 space-y-0.5 overflow-y-auto overflow-x-hidden p-1">
              {visibleTree.map((node) => renderNode(node, 0))}
            </div>
          )}
        </div>
        {missingCount > 0 && (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            {t("postfach.folder.ordnerFehlt", { count: missingCount })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
