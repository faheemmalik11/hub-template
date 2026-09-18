import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/use-table-view";

/**
 * A table column header that sorts.
 *
 * Three copies of this had grown independently (eingangsrechnungen, offene-posten,
 * opos-whitelist), each with its own icon set and its own idea of whether the sort state reaches a
 * screen reader. This is the shared one: the direction is drawn AND announced via `aria-sort`, and
 * the whole header is a real button so keyboard users can reach it.
 *
 * Deliberately domain-agnostic. It knows a column key, the active key and a direction, nothing
 * about what is being sorted or where the sorting happens (client-side via useTableView here, a
 * backend `order by` elsewhere). That is what makes it portable to the sibling hubs.
 */
export function SortableColumnHeader({
  column,
  sort,
  dir,
  onSort,
  align = "left",
  className,
  children,
}: {
  /** This column's sort key. */
  column: string;
  /** The currently sorted column key. */
  sort: string;
  dir: SortDir;
  /** Called with this column's key. The caller decides whether that means "toggle" or "switch". */
  onSort: (column: string) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort === column;
  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      // The icon carries the sort state visually; aria-sort carries it for screen readers, which
      // otherwise get an unlabelled button and no indication the table is sorted at all.
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
          // The arrow stays to the RIGHT of the label in every column, including right-aligned
          // ones -- mirroring the row for those moved the same control to the other side halfway
          // across the header.
          align === "right" && "w-full justify-end",
        )}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
