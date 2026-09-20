/**
 * THE ONE FILE THAT DIFFERS PER REPOSITORY.
 *
 * Everything else under `features/cost-analysis/` is byte-identical across the Hubs and is meant to
 * be copied, not adapted — the same arrangement `bwa-export.ts` already documents for itself, and
 * for the same reason: the client checks these numbers line for line against a real BWA, so the
 * four screens must not be four slightly different implementations.
 *
 * The feature imports its data layer, formatting and domain types from HERE and never from `@/…`
 * directly. That is what makes the copy work: Eiffler keeps this module pointing at `@acc/…`
 * (its accounting module lives under `src/accounting/`), the other three point at `@/…`, and no
 * other file in the folder has to know which repository it is in.
 *
 * TO PORT:
 *   1. copy `features/cost-analysis/` wholesale
 *   2. rewrite the specifiers in THIS file if the repository's layout differs
 *   3. hand the screen a `CostAnalysisConfig` from the route (see `config.ts`)
 *   4. copy the `auswertungen` i18n block into both locales
 *
 * If a symbol below does not exist in a target repository, that is a real gap in its data layer,
 * not something to paper over here — the screen's figures depend on all of it.
 */

export {
  coveredAmount,
  dateLocale,
  formatDate,
  formatDayShort,
  formatEUR,
  formatEURCompact,
  formatIBAN,
  formatMonthShort,
  isFullyCovered,
  isOverviewPeriod,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  overviewPeriodRange,
  previousPeriodRange,
} from "@/lib/data/format";

export {
  BWA_SKELETON,
  NOT_PNL_ROW_KEY,
  UNASSIGNED_ROW_KEY,
  rowKeyForCategoryCode,
  signForRowKey,
} from "@/lib/data/bwa-skeleton";
export type { BwaSkeletonComputed } from "@/lib/data/bwa-skeleton";

export {
  bookingDateFor,
  coarseCategoryCode,
  outgoingBookingDateFor,
  useBwaScope,
} from "@/lib/data/use-bwa-scope";
export type { BookingBasis, BwaAmountBasis, BwaScopeItem } from "@/lib/data/use-bwa-scope";

export { buildBwaCsv, downloadCsv } from "@/lib/data/bwa-export";
export type { BwaExportRow } from "@/lib/data/bwa-export";

export type { BwaCategory } from "@/lib/data/types";

export { useTranslation } from "@/lib/i18n";
export { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Query hooks. Same names in every Hub; only the module path can differ.
// ---------------------------------------------------------------------------
export {
  useBankAccounts,
  useBwaCategories,
  useConfirmedAllocations,
  useConfirmedOutgoingAllocations,
  useGesellschaften,
  useObjekte,
  useOutgoingInvoices,
} from "@/data";

// ---------------------------------------------------------------------------
// Shared UI. Re-exported here for the same reason as the data layer: so a port is one file's worth
// of edits and not a search-and-replace through a dozen components.
//
// `filter-pills.tsx` was written for this screen and does not exist in the other Hubs yet — copy it
// alongside the feature folder. The rest (`zeitraum-picker`, `filter-popover`, `filter-fields`,
// the shadcn primitives, `query-states`) are already present in all four.
// ---------------------------------------------------------------------------
export { Button } from "@/components/ui/button";
export { Skeleton } from "@/components/ui/skeleton";
export { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
export { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
export type { ChartConfig } from "@/components/ui/chart";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export { ErrorState, CardsSkeleton } from "@/components/belege/query-states";
export { ZeitraumPicker } from "@/components/data-table/zeitraum-picker";
export { FilterPopover } from "@/components/data-table/filter-popover";
export { FilterPills } from "@/components/data-table/filter-pills";
export type { FilterField } from "@/components/data-table/filter-fields";
