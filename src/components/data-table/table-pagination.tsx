import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useTranslation } from "@/lib/i18n";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Pagination bar for client-side lists — page-size picker, "showing x–y of z", and prev/next.
 * Mirrors the invoice list's bar so every table paginates the same way.
 */
export function TablePagination({
  page,
  totalPages,
  pageSize,
  total,
  from,
  to,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span className="font-medium">{t("common.pagination.perPage")}</span>
        <Combobox
          value={String(pageSize)}
          onValueChange={(v) => onPageSize(Number(v))}
          ariaLabel={t("common.pagination.perPage")}
          className="h-8 w-[80px]"
          options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
        />
        <span className="hidden text-muted-foreground sm:inline">
          {t("common.pagination.showing", { from, to, total })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          {t("common.pagination.page", { page, pages: totalPages })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 rounded-md"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="size-4" /> {t("common.pagination.prev")}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1 rounded-md"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            {t("common.pagination.next")} <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
