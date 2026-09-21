/**
 * THE ONE FILE THAT DIFFERS PER REPOSITORY.
 *
 * Everything else under `features/properties/` is byte-identical across the Hubs and is meant to be
 * copied, not adapted. The screens import their data layer, formatting, domain types and shared UI
 * from HERE and never from `@/…` directly — that is what makes the copy work.
 *
 * TO PORT: see `PORTING.md` in this folder.
 */

import { useMemo } from "react";

import { useCompanies, usePropertyCompanies } from "@/data";

import type { PropertyCompany, PropertyCompaniesIndex, PropertyAssignment } from "./config";

// ---------------------------------------------------------------------------
// Formatting and domain types.
// ---------------------------------------------------------------------------
export {
  dateLocale,
  errorText,
  formatDate,
  formatDateTime,
  formatEUR,
  periodToRange,
} from "@/lib/data/format";

export type { Document, Property } from "@/lib/data/types";
export type { DocumentAggregateRow } from "@/data";

export { useTranslation } from "@/lib/i18n";
export { cn } from "@/lib/utils";
export { fieldError, propertySchema } from "@/lib/forms/property-schema";

// ---------------------------------------------------------------------------
// Query hooks. Same names in every Hub; only the module path can differ.
// ---------------------------------------------------------------------------
export {
  useArchiveProperty,
  useDocumentsForPropertyPages,
  useCreateProperty,
  useSuppliers,
  usePropertyDocumentAggregate,
  usePropertyDocumentTotals,
  useProperties,
  useUnarchiveProperty,
  useUpdateProperty,
} from "@/data";

export { useFetchNextSentinel } from "@/lib/use-fetch-next-sentinel";
export { useTableView } from "@/lib/use-table-view";
export type { SortDir } from "@/lib/use-table-view";

// ---------------------------------------------------------------------------
// Shared UI.
// ---------------------------------------------------------------------------
export { Button } from "@/components/ui/button";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Skeleton } from "@/components/ui/skeleton";
export { Combobox } from "@/components/ui/combobox";
export { FieldErrorText, RequiredStern } from "@/components/ui/form-field";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export { ErrorState, TableSkeleton } from "@/components/documents/query-states";
export { CompanyChip, StatusBadge, VatBadge } from "@/components/documents/badges";
export { CopyButton } from "@/components/documents/copy-button";

export { ListToolbar } from "@/components/records/list-toolbar";
export { InvoiceSummaryCell } from "@/components/records/invoice-summary-cell";
export { FactList } from "@/components/records/fact-list";
export type { Fact } from "@/components/records/fact-list";
export { SectionSkeleton } from "@/components/records/section-skeleton";

export { FilterPopover } from "@/components/data-table/filter-popover";
export { FilterPills } from "@/components/data-table/filter-pills";
export type { FilterField } from "@/components/data-table/filter-fields";
export { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
export { TablePagination } from "@/components/data-table/table-pagination";
export { PeriodPicker } from "@/components/data-table/period-picker";
export {
  usePeriodOptions,
  PERIOD_ALL,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";

// ---------------------------------------------------------------------------
// Capabilities this Hub does not have.
//
// this client's `properties` has no `reviewed_at` and no `ownership_type`, so `stammdatenPruefung` and
// `eigentum` are false in the route's config and none of the controls behind them are rendered.
// `driveOrdner` is off too, for a different reason: the column here is `filing_folder`, a Dropbox
// path used by the pipeline for filing, not a link anybody opens.
//
// Archiving IS supported: deleted_at / deleted_by / delete_reason are on the table and `properties`
// is already in trash_eligible_tables() (migration 0062).
//
// This still has to exist because the shared screens call it on every render and the flag is what
// keeps it from ever mattering.
// ---------------------------------------------------------------------------

/** Always false: without `reviewed_at` there is no review date to have gone stale. */
export function needsMasterDataReview(_reviewedAt: string | null | undefined): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// The relation both screens are really about: which companies a property belongs to.
//
// this client assigns a property straight to companies (`property_companies`, migration 0083), several at
// once being normal rather than an error. There are no business lines in between, so every
// assignment's `bereich` is null and the detail page renders the company alone.
// ---------------------------------------------------------------------------
export function usePropertyCompanyIndex(): PropertyCompaniesIndex {
  const companiesQ = useCompanies();
  const linksQ = usePropertyCompanies();

  const ready = companiesQ.data !== undefined && linksQ.data !== undefined;

  return useMemo(() => {
    const companyById = new Map((companiesQ.data ?? []).map((g) => [g.id, g]));
    const byProperty = new Map<string, PropertyCompany[]>();
    const assignmentsByProperty = new Map<string, PropertyAssignment[]>();

    for (const link of linksQ.data ?? []) {
      const g = companyById.get(link.company_id);

      const assignments = assignmentsByProperty.get(link.property_id) ?? [];
      assignments.push({
        id: link.id,
        company: g ? { id: g.id, code: g.code, name: g.name } : null,
        area: null,
        // Null, not undefined: this client numbers its cost centres, so a pairing without a number is a
        // gap to show rather than a Hub that has no such concept.
        costCentre: link.cost_centre_number ?? null,
      });
      assignmentsByProperty.set(link.property_id, assignments);

      if (!g) continue;
      const list = byProperty.get(link.property_id) ?? [];
      if (!list.some((x) => x.code === g.code)) {
        list.push({ id: g.id, code: g.code, name: g.name });
      }
      byProperty.set(link.property_id, list);
    }

    for (const list of byProperty.values()) list.sort((x, y) => x.code.localeCompare(y.code));
    for (const list of assignmentsByProperty.values()) {
      list.sort((x, y) => (x.company?.code ?? "").localeCompare(y.company?.code ?? ""));
    }

    return { ready, byProperty, assignmentsByProperty };
  }, [companiesQ.data, linksQ.data, ready]);
}
