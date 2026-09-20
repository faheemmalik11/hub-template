import { Search } from "lucide-react";

import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { SortControl, type SortColumn } from "../../pages/invoice-list/sort-control";
import type { InvoiceListLabels } from "../../pages/invoice-list/labels";

export interface CompanyOption {
  code: string;
  name: string;
}

export interface InvoiceFilterBarProps {
  search: string;
  onSearch: (value: string) => void;
  company: string;
  onCompany: (value: string) => void;
  companyOptions: CompanyOption[];
  sortColumns: SortColumn[];
  sort: string;
  onSort: (value: string) => void;
  direction: "asc" | "desc";
  onDirection: (direction: "asc" | "desc") => void;
  labels: InvoiceListLabels;
  className?: string;
}

export function InvoiceFilterBar({
  search,
  onSearch,
  company,
  onCompany,
  companyOptions,
  sortColumns,
  sort,
  onSort,
  direction,
  onDirection,
  labels,
  className,
}: InvoiceFilterBarProps) {
  return (
    <div className={className}>
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="pl-9"
        />
      </div>
      {companyOptions.length > 0 && (
        <Combobox
          value={company}
          onValueChange={onCompany}
          className="w-full sm:w-48"
          options={[
            { value: "", label: labels.companyAll },
            ...companyOptions.map((option) => ({
              value: option.code,
              label: `${option.code} — ${option.name}`,
            })),
          ]}
        />
      )}
      <SortControl
        columns={sortColumns}
        sort={sort}
        direction={direction}
        onSort={onSort}
        onDirection={onDirection}
        labels={labels}
      />
    </div>
  );
}
