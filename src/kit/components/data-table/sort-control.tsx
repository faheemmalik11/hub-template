import { Combobox } from "../../ui/combobox";
import type { SortDirection } from "./table-view";

export interface SortColumn {
  value: string;
  label: string;
}

export interface SortControlLabels {
  label: string;
  ascending: string;
  descending: string;
}

export const englishSortControlLabels: SortControlLabels = {
  label: "Sort",
  ascending: "Ascending",
  descending: "Descending",
};

export function SortControl({
  columns,
  sort,
  direction,
  onSort,
  onDirection,
  labels = englishSortControlLabels,
}: {
  columns: SortColumn[];
  sort: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  onDirection: (direction: SortDirection) => void;
  labels?: SortControlLabels;
}) {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
        {labels.label}
      </span>
      <Combobox
        value={sort}
        onValueChange={onSort}
        ariaLabel={labels.label}
        className="flex-1 sm:w-48 sm:flex-none"
        options={columns}
      />
      <Combobox
        value={direction}
        onValueChange={(value) => onDirection(value as SortDirection)}
        ariaLabel={labels.label}
        className="flex-1 sm:w-40 sm:flex-none"
        options={[
          { value: "asc", label: labels.ascending },
          { value: "desc", label: labels.descending },
        ]}
      />
    </div>
  );
}
