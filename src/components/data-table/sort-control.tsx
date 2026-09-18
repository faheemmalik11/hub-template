import { Combobox } from "@/components/ui/combobox";
import { useTranslation } from "@/lib/i18n";
import type { SortDir } from "@/lib/use-table-view";

export interface SortColumn {
  value: string;
  label: string;
}

/**
 * Dropdown-based sort control: one field picker + an asc/desc picker. Fixed-width triggers on
 * sm+ so the surrounding layout never shifts when a selection changes; full width below sm to
 * match the filter-Combobox width convention used across the app's mobile layouts. Table headers
 * stay static — sorting is driven entirely from here, keeping the table UI consistent.
 */
export function SortControl({
  columns,
  sort,
  dir,
  onSort,
  onDir,
}: {
  columns: SortColumn[];
  sort: string;
  dir: SortDir;
  onSort: (key: string) => void;
  onDir: (dir: SortDir) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
        {t("common.sort.label")}
      </span>
      <Combobox value={sort} onValueChange={onSort} className="w-full sm:w-48" options={columns} />
      <Combobox
        value={dir}
        onValueChange={(v) => onDir(v as SortDir)}
        className="w-full sm:w-40"
        options={[
          { value: "asc", label: t("common.sort.asc") },
          { value: "desc", label: t("common.sort.desc") },
        ]}
      />
    </div>
  );
}
