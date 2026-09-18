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

import { useGesellschaften, usePropertyCompanies } from "@/lib/data/queries";

import type { ObjektGesellschaft, ObjektGesellschaftenIndex, ObjektZuordnung } from "./config";

// ---------------------------------------------------------------------------
// Formatting and domain types.
// ---------------------------------------------------------------------------
export {
  dateLocale,
  fehlerText,
  formatDate,
  formatDateTime,
  formatEUR,
  zeitraumToRange,
} from "@/lib/data/format";

export type { Beleg, Objekt } from "@/lib/data/types";
export type { BelegAggregatZeile } from "@/lib/data/queries";

export { useTranslation } from "@/lib/i18n";
export { cn } from "@/lib/utils";
export { feldFehler, objektSchema } from "@/lib/forms/objekt-schema";

// ---------------------------------------------------------------------------
// Query hooks. Same names in every Hub; only the module path can differ.
// ---------------------------------------------------------------------------
export {
  useArchiveObjekt,
  useBelegeFuerObjektSeiten,
  useCreateObjekt,
  useLieferanten,
  useObjektBelegAggregat,
  useObjektBelegSummen,
  useObjekte,
  useUnarchiveObjekt,
  useUpdateObjekt,
} from "@/lib/data/queries";

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
export { FeldFehlerText, PflichtStern } from "@/components/ui/form-field";
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

export { ErrorState, TableSkeleton } from "@/components/belege/query-states";
export { GesellschaftChip, StatusBadge, UstBadge } from "@/components/belege/badges";
export { CopyButton } from "@/components/belege/copy-button";

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
export { ZeitraumPicker } from "@/components/data-table/zeitraum-picker";
export {
  useZeitraumOptionen,
  ZEITRAUM_ALLE,
  ZEITRAUM_INDIVIDUELL,
  zeitraumBereich,
} from "@/components/data-table/zeitraum-optionen";

// ---------------------------------------------------------------------------
// Capabilities this Hub does not have.
//
// Stäy's `properties` has no `reviewed_at` and no `ownership_type`, so `stammdatenPruefung` and
// `eigentum` are false in the route's config and none of the controls behind them are rendered.
// `driveOrdner` is off too, for a different reason: the column here is `drive_folder_id`, a Dropbox
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
// Stäy assigns a property straight to companies (`property_companies`, migration 0083), several at
// once being normal rather than an error. There are no business lines in between, so every
// assignment's `bereich` is null and the detail page renders the company alone.
// ---------------------------------------------------------------------------
export function useObjektGesellschaften(): ObjektGesellschaftenIndex {
  const gesellschaftenQ = useGesellschaften();
  const linksQ = usePropertyCompanies();

  const bereit = gesellschaftenQ.data !== undefined && linksQ.data !== undefined;

  return useMemo(() => {
    const gesellschaftById = new Map((gesellschaftenQ.data ?? []).map((g) => [g.id, g]));
    const byProperty = new Map<string, ObjektGesellschaft[]>();
    const zuordnungenByProperty = new Map<string, ObjektZuordnung[]>();

    for (const link of linksQ.data ?? []) {
      const g = gesellschaftById.get(link.company_id);

      const zuordnungen = zuordnungenByProperty.get(link.property_id) ?? [];
      zuordnungen.push({
        id: link.id,
        gesellschaft: g ? { id: g.id, code: g.code, name: g.name } : null,
        bereich: null,
        // Null, not undefined: Stäy numbers its cost centres, so a pairing without a number is a
        // gap to show rather than a Hub that has no such concept.
        kostenstelle: link.cost_center_number ?? null,
      });
      zuordnungenByProperty.set(link.property_id, zuordnungen);

      if (!g) continue;
      const list = byProperty.get(link.property_id) ?? [];
      if (!list.some((x) => x.code === g.code)) {
        list.push({ id: g.id, code: g.code, name: g.name });
      }
      byProperty.set(link.property_id, list);
    }

    for (const list of byProperty.values()) list.sort((x, y) => x.code.localeCompare(y.code));
    for (const list of zuordnungenByProperty.values()) {
      list.sort((x, y) => (x.gesellschaft?.code ?? "").localeCompare(y.gesellschaft?.code ?? ""));
    }

    return { bereit, byProperty, zuordnungenByProperty };
  }, [gesellschaftenQ.data, linksQ.data, bereit]);
}
