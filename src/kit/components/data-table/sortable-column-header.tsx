import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "../../ui/table";
import { cn } from "../../lib/class-names";
import type { SortDirection } from "./table-view";

export function SortableColumnHeader({
  column,
  sort,
  direction,
  onSort,
  align = "left",
  className,
  children,
}: {
  column: string;
  sort: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort === column;
  return (
    <TableHead
      className={cn(align === "right" && "text-right", className)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "w-full justify-end",
        )}
      >
        {children}
        {active ? (
          direction === "asc" ? (
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
