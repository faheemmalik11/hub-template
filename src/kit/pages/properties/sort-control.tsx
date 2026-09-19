import { Combobox } from "../../ui/combobox";
import type { SortDirection } from "./use-table-view";
import type { PropertiesLabels } from "./labels";

export interface SortColumn {
  value: string;
  label: string;
}

// One field picker plus an asc/desc picker; table headers stay static.
export function SortControl({
  columns,
  sort,
  direction,
  onSort,
  onDirection,
  labels,
}: {
  columns: SortColumn[];
  sort: string;
  direction: SortDirection;
  onSort: (key: string) => void;
  onDirection: (direction: SortDirection) => void;
  labels: PropertiesLabels["sort"];
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
        {labels.label}
      </span>
      <Combobox value={sort} onValueChange={onSort} className="w-full sm:w-48" options={columns} />
      <Combobox
        value={direction}
        onValueChange={(value) => onDirection(value as SortDirection)}
        className="w-full sm:w-40"
        options={[
          { value: "asc", label: labels.ascending },
          { value: "desc", label: labels.descending },
        ]}
      />
    </div>
  );
}
