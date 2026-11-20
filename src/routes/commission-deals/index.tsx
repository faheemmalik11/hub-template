import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEmitOnboardingEvent } from "@/kit/components/onboarding";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { AgentReportSection } from "@/components/commission/agent-report-section";
import { BrokerNumbersCard } from "@/components/commission/broker-numbers-card";
import { DealStatusBadge } from "@/components/commission/deal-status-badge";
import { PropertyPicker } from "@/components/commission/property-picker";
import { dealGrossTotalCentsOf } from "@/components/commission/deal-form";
import {
  DEAL_STATUSES,
  propertyChoiceTitle,
  useActiveDealForProperty,
  useCompanies,
  useCreateDeal,
  useDealsList,
  useDealsWithCrmChanges,
} from "@/data";
import type { DealStatus, PropertyChoice } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { TablePagination } from "@/kit/components/feedback/table-pagination";
import { useAuth } from "@/lib/auth";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";

const ALL_STATUSES = "__all";
const SEARCH_DELAY_MS = 250;
const DEFAULT_PAGE_SIZE = 25;
const SALES_ONLY_TABS = ["sales"] as const;
const SALES_AND_REPORTING_TABS = ["sales", "reporting"] as const;

type CommissionDealsTab = (typeof SALES_AND_REPORTING_TABS)[number];

export const Route = createFileRoute("/commission-deals/")({
  head: () => ({ meta: [{ title: pageTitle("Provisionen") }] }),
  staticData: { titleKey: "commissions" },
  validateSearch: (input: Record<string, unknown>) => tabSearch(input),
  component: CommissionDealsPage,
});

function CommissionDealsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DealStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(typed);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const dealsQ = useDealsList({
    search,
    status: status === ALL_STATUSES ? "" : status,
    page,
    pageSize,
  });
  const crmChangesQ = useDealsWithCrmChanges();
  const dealsWithCrmChanges = crmChangesQ.data ?? new Set<string>();
  const deals = useMemo(() => dealsQ.data?.rows ?? [], [dealsQ.data]);
  const total = dealsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totals = useMemo(
    () => new Map(deals.map((deal) => [deal.id, dealGrossTotalCentsOf(deal)])),
    [deals],
  );
  const filtering = search !== "" || status !== ALL_STATUSES;
  const paginationLabels = usePaginationLabels();
  const seesCommission = can(PERMISSIONS.dealsCommissionRead);
  const columnCount = seesCommission ? 5 : 4;
  const seesReporting = can(PERMISSIONS.dealsReport);
  const [tab, setTab] = useTabParam<CommissionDealsTab>(
    seesReporting ? SALES_AND_REPORTING_TABS : SALES_ONLY_TABS,
    "sales",
  );

  const salesContent = (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("commissionDeals.list.search")}
            className="pl-9"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-[200px]">
          <Label className="text-xs text-muted-foreground">
            {t("commissionDeals.list.filter.status")}
          </Label>
          <Combobox
            value={status}
            onValueChange={(value) => {
              setStatus(value as DealStatus | typeof ALL_STATUSES);
              setPage(1);
            }}
            options={[
              { value: ALL_STATUSES, label: t("commissionDeals.list.filter.allStatuses") },
              ...DEAL_STATUSES.map((s) => ({ value: s, label: t(`commissionDeals.status.${s}`) })),
            ]}
          />
        </div>
      </div>

      <div className="mt-6">
        {dealsQ.isError ? (
          <ErrorState error={dealsQ.error} onRetry={() => dealsQ.refetch()} />
        ) : dealsQ.isLoading ? (
          <TableSkeleton cols={5} />
        ) : total === 0 && !filtering ? (
          <EmptyState
            title={t("commissionDeals.emptyTitle")}
            hint={t("commissionDeals.emptyHint")}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("commissionDeals.columns.property")}</TableHead>
                    <TableHead>{t("commissionDeals.columns.notarisedOn")}</TableHead>
                    <TableHead className="text-right">
                      {t("commissionDeals.columns.price")}
                    </TableHead>
                    {seesCommission && (
                      <TableHead className="text-right">
                        {t("commissionDeals.columns.commission")}
                      </TableHead>
                    )}
                    <TableHead>{t("commissionDeals.columns.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => {
                    const dealTotal = totals.get(deal.id);
                    return (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Link
                              to="/commission-deals/$id"
                              params={{ id: deal.id }}
                              className="font-medium text-foreground hover:underline"
                            >
                              {deal.property?.name ?? deal.property_label ?? "—"}
                            </Link>
                            {dealsWithCrmChanges.has(deal.id) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle
                                    aria-label={t("commissionDeals.list.crmChanged")}
                                    className="size-4 shrink-0 text-destructive"
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("commissionDeals.list.crmChanged")}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {deal.notarised_on ? formatDate(deal.notarised_on) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {deal.purchase_price === null ? "—" : formatEUR(deal.purchase_price)}
                        </TableCell>
                        {seesCommission && (
                          <TableCell className="text-right tabular-nums">
                            {dealTotal === null || dealTotal === undefined
                              ? "—"
                              : formatEUR(dealTotal / 100)}
                          </TableCell>
                        )}
                        <TableCell>
                          <DealStatusBadge status={deal.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {total === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columnCount}
                        className="py-12 text-center text-muted-foreground"
                      >
                        {t("commissionDeals.list.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3">
              <TablePagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                total={total}
                from={from}
                to={to}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                labels={paginationLabels}
              />
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("commissionDeals.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("commissionDeals.subtitle")}
          </p>
        </div>
        {(can(PERMISSIONS.documentsWrite) || can(PERMISSIONS.dealsSubmit)) && <NewDealDialog />}
      </div>

      {seesReporting ? (
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="sales">{t("commissionDeals.listTabs.sales")}</TabsTrigger>
            <TabsTrigger value="reporting">{t("commissionDeals.listTabs.reporting")}</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-0">
            {salesContent}
          </TabsContent>

          <TabsContent value="reporting" className="mt-4">
            {can(PERMISSIONS.dealsSubmit) && !can(PERMISSIONS.documentsWrite) && (
              <BrokerNumbersCard />
            )}
            <AgentReportSection />
          </TabsContent>
        </Tabs>
      ) : (
        salesContent
      )}
    </div>
  );
}

function NewDealDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const emitOnboardingEvent = useEmitOnboardingEvent();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState<PropertyChoice | null>(null);
  const companiesQ = useCompanies();
  const createDeal = useCreateDeal();
  const activeDealQ = useActiveDealForProperty(property?.id ?? null);
  const activeDeal = activeDealQ.data ?? null;

  const create = () => {
    if (!property || activeDeal) return;
    createDeal.mutate(
      {
        propertyId: property.id,
        propertyLabel: [propertyChoiceTitle(property), property.address].filter(Boolean).join(", "),
        companyId: companiesQ.data?.[0]?.id ?? null,
        purchasePrice: property.sold_price ?? property.asking_price ?? null,
      },
      {
        onSuccess: (id) => {
          setOpen(false);
          setProperty(null);
          emitOnboardingEvent({ type: "commission_deal_created", recordId: id });
          navigate({ to: "/commission-deals/$id", params: { id } });
        },
        onError: (error) =>
          toast.error(t("commissionDeals.newDialog.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <>
      <Button
        data-tour="commission-new-deal"
        onClick={() => {
          emitOnboardingEvent({ type: "commission_deal_dialog_opened", recordId: "" });
          setOpen(true);
        }}
      >
        <Plus /> {t("commissionDeals.newDeal")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("commissionDeals.newDialog.title")}</DialogTitle>
            <DialogDescription>{t("commissionDeals.newDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2" data-tour="commission-property-picker">
            <Label>{t("commissionDeals.newDialog.property")}</Label>
            <PropertyPicker
              value={property}
              onChange={(next) => {
                setProperty(next);
                emitOnboardingEvent({ type: "commission_deal_property_picked", recordId: next.id });
              }}
            />
          </div>
          {activeDeal && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("commissionDeals.newDialog.propertyHasActiveDeal")}
                  </p>
                  <Link
                    to="/commission-deals/$id"
                    params={{ id: activeDeal.id }}
                    className="text-sm font-medium text-destructive hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {t("commissionDeals.newDialog.openExistingDeal")}
                  </Link>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("commissionDeals.newDialog.cancel")}
            </Button>
            <Button
              data-tour="commission-create-deal"
              onClick={create}
              disabled={!property || !!activeDeal || createDeal.isPending}
            >
              {createDeal.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("commissionDeals.newDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
