import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../ui/button";
import { cn } from "../../lib/class-names";
import { Combobox } from "../../ui/combobox";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface PaginationLabels {
  perPage: string;
  showing: (from: number, to: number, total: number) => string;
  pageOf: (page: number, pages: number) => string;
  previous: string;
  next: string;
}

export const englishPaginationLabels: PaginationLabels = {
  perPage: "Per page",
  showing: (from, to, total) => `Showing ${from}–${to} of ${total}`,
  pageOf: (page, pages) => `Page ${page} of ${pages}`,
  previous: "Previous",
  next: "Next",
};

export function TablePagination({
  page,
  totalPages,
  pageSize,
  total,
  from,
  to,
  onPage,
  onPageSize,
  labels = englishPaginationLabels,
  divider = true,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  labels?: PaginationLabels;
  /**
   * Draw the rule above the pager.
   *
   * On by default, because the pager usually sits inside the same bordered card as its table and
   * is the line between them. A page that puts it BELOW that card wants it off: the card already
   * ends in a border, and a second rule a few pixels under it reads as two separators.
   */
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        divider && "mt-4 border-t border-border pt-4",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span className="font-medium">{labels.perPage}</span>
        <Combobox
          value={String(pageSize)}
          onValueChange={(value) => onPageSize(Number(value))}
          ariaLabel={labels.perPage}
          className="h-8 w-[80px]"
          options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
        />
        <span className="hidden text-muted-foreground sm:inline">
          {labels.showing(from, to, total)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          {labels.pageOf(page, totalPages)}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 rounded-md"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="size-4" /> {labels.previous}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1 rounded-md"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            {labels.next} <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
