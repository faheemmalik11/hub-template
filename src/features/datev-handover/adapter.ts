/**
 * THE ONE FILE THAT DIFFERS PER REPOSITORY.
 *
 * Everything else under `features/datev-handover/` is meant to be copied, not adapted — the same
 * arrangement `features/cost-analysis/adapter.ts` and `features/invoice-detail/PORTING.md` already
 * describe, and for the same reason. The DATEV screen shipped as four independent copies (Immonetz,
 * this client, Mayestate, Eiffler's accounting module) and they had already drifted: one grew a bounce
 * banner, one a branded `pageTitle()`, one a bespoke status pill while still importing the shared
 * one and never using it. Each divergence was a reasonable local decision; together they mean every
 * fix has to be made and reviewed four times.
 *
 * The feature imports its data layer, formatting, domain types and UI kit from HERE and never from
 * `@/…` directly. That is what makes the copy work: Eiffler keeps this file pointing at `@acc/…`
 * (its accounting module lives under `src/accounting/`), the other three point at `@/…`, and no
 * other file in this folder has to know which repository it is in.
 *
 * TO PORT: see PORTING.md in this folder.
 *
 * If a symbol below does not exist in a target repository, that is a real gap in its data layer,
 * not something to paper over here.
 */

// ---------------------------------------------------------------------------
// Formatting and i18n. Locale lives on this side of the seam, never inside the feature.
// ---------------------------------------------------------------------------
export { fehlerText, formatDate, formatDateTime, formatEUR, formatNumber } from "@/lib/data/format";
export { useTranslation } from "@/lib/i18n";
// The monthly document export. Same signature in every Hub; only how the archive is built differs
// (a server function here, an edge function in Eiffler).
export { downloadMonthlyBundle } from "@/lib/data/monthly-bundle";
export type { BundleSummary } from "@/lib/data/monthly-bundle";
export { cn } from "@/lib/utils";
export { toast } from "sonner";

// ---------------------------------------------------------------------------
// Domain types. `DatevDirection` and friends are DATEV's own contract and are the same in every
// Hub; `DatevReadyInvoice` / `DatevCompanyStatus` come with the queries below.
// ---------------------------------------------------------------------------
export { DATEV_DIRECTIONS } from "@/lib/data/types";
export type {
  DatevCompanyStatus,
  DatevDirection,
  DatevHandoverBatch,
  DatevOutgoingInvoice,
  DatevReadyInvoice,
  DatevRoute,
  Gesellschaft,
} from "@/lib/data/types";

// ---------------------------------------------------------------------------
// Query hooks. Same names in every Hub; only the module path can differ.
// ---------------------------------------------------------------------------
export {
  useAcknowledgeDatevBounce,
  useDatevHandoverBatches,
  useDatevHandoverStatus,
  useDatevOutgoingCandidates,
  useDatevRoutes,
  useOpenDatevBounces,
  useGesellschaften,
  useSaveDatevRoutes,
  useTriggerDatevHandover,
} from "@/lib/data/queries";

// ---------------------------------------------------------------------------
// Shared components. `RouteStatus` is NOT part of this folder on purpose — LexOffice renders the
// same three-state pill, and owning a private copy here is how the two drift apart again (they did,
// once, in exactly that direction).
// ---------------------------------------------------------------------------
export { RouteStatus } from "@/components/integrations/route-status";
export { ErrorState, TableSkeleton } from "@/components/belege/query-states";
// The list pagination every master-data screen in this app already uses.
export { TablePagination } from "@/components/data-table/table-pagination";
export { useTableView } from "@/lib/use-table-view";

// ---------------------------------------------------------------------------
// UI kit (shadcn).
// ---------------------------------------------------------------------------
export { Button } from "@/components/ui/button";
export { Checkbox } from "@/components/ui/checkbox";
export { Input } from "@/components/ui/input";
export { Label } from "@/components/ui/label";
export { Switch } from "@/components/ui/switch";
export { Skeleton } from "@/components/ui/skeleton";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
