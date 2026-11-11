import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
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
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { BrokerNumbersCard } from "@/components/commission/broker-numbers-card";
import { DealStatusBadge } from "@/components/commission/deal-status-badge";
import { PropertyPicker } from "@/components/commission/property-picker";
import { dealGrossTotalCentsOf } from "@/components/commission/deal-form";
import {
  DEAL_STATUSES,
  propertyChoiceTitle,
  useCompanies,
  useCreateDeal,
  useDealsList,
} from "@/data";
import type { DealStatus, PropertyChoice } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { TablePagination } from "@/kit/components/feedback/table-pagination";
import { useAuth } from "@/lib/auth";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const ALL_STATUSES = "__all";
const SEARCH_DELAY_MS = 250;
const DEFAULT_PAGE_SIZE = 25;

export const Route = createFileRoute("/commission-deals/")({
  head: () => ({ meta: [{ title: pageTitle("Provisionen") }] }),
  staticData: { titleKey: "commissions" },
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

      {can(PERMISSIONS.dealsSubmit) && !can(PERMISSIONS.documentsWrite) && <BrokerNumbersCard />}

      <div className="mt-6 flex flex-wrap items-end gap-3">
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
                    <TableHead className="text-right">
                      {t("commissionDeals.columns.commission")}
                    </TableHead>
                    <TableHead>{t("commissionDeals.columns.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => {
                    const dealTotal = totals.get(deal.id);
                    return (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <Link
                            to="/commission-deals/$id"
                            params={{ id: deal.id }}
                            className="font-medium text-foreground hover:underline"
                          >
                            {deal.property?.name ?? deal.property_label ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {deal.notarised_on ? formatDate(deal.notarised_on) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {deal.purchase_price === null ? "—" : formatEUR(deal.purchase_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {dealTotal === null || dealTotal === undefined
                            ? "—"
                            : formatEUR(dealTotal / 100)}
                        </TableCell>
                        <TableCell>
                          <DealStatusBadge status={deal.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {total === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
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
    </div>
  );
}

function NewDealDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState<PropertyChoice | null>(null);
  const companiesQ = useCompanies();
  const createDeal = useCreateDeal();

  const create = () => {
    if (!property) return;
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
          navigate({ to: "/commission-deals/$id", params: { id } });
        },
        onError: (error) =>
          toast.error(t("commissionDeals.newDialog.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {t("commissionDeals.newDeal")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("commissionDeals.newDialog.title")}</DialogTitle>
            <DialogDescription>{t("commissionDeals.newDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("commissionDeals.newDialog.property")}</Label>
            <PropertyPicker value={property} onChange={setProperty} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("commissionDeals.newDialog.cancel")}
            </Button>
            <Button onClick={create} disabled={!property || createDeal.isPending}>
              {t("commissionDeals.newDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
