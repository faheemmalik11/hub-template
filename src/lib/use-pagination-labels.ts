import type { PaginationLabels } from "@/kit/components/feedback/table-pagination";
import { useTranslation } from "@/lib/i18n";

export function usePaginationLabels(): PaginationLabels {
  const { t } = useTranslation();
  return {
    perPage: t("common.pagination.perPage"),
    showing: (from, to, total) => t("common.pagination.showing", { from, to, total }),
    pageOf: (page, pages) => t("common.pagination.page", { page, pages }),
    previous: t("common.pagination.prev"),
    next: t("common.pagination.next"),
  };
}
