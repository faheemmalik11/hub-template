import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  calculateDealForm,
  dealFormOf,
  dealGrossTotalCents,
} from "@/components/commission/deal-form";
import { propertyChoiceTitle, useCompanies, useCreateDeal, useDeals } from "@/data";
import type { PropertyChoice } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { TablePagination } from "@/kit/components/feedback/table-pagination";
import { useAuth } from "@/lib/auth";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { useTableView } from "@/lib/use-table-view";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/commission-deals/")({
  head: () => ({ meta: [{ title: pageTitle("Provisionen") }] }),
  staticData: { titleKey: "commissions" },
  component: CommissionDealsPage,
});

function CommissionDealsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const dealsQ = useDeals();
  const deals = useMemo(() => dealsQ.data ?? [], [dealsQ.data]);
  const totals = useMemo(
    () =>
      new Map(
        deals.map((deal) => [deal.id, dealGrossTotalCents(calculateDealForm(dealFormOf(deal)))]),
      ),
    [deals],
  );

  const view = useTableView(deals, {
    sortValue: (deal) => deal.created_at,
    initialSort: "created",
    initialDir: "desc",
  });
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

      <div className="mt-6">
        {dealsQ.isLoading ? (
          <TableSkeleton cols={5} />
        ) : dealsQ.error ? (
          <ErrorState error={dealsQ.error} onRetry={() => dealsQ.refetch()} />
        ) : deals.length === 0 ? (
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
                  {view.pageRows.map((deal) => {
                    const total = totals.get(deal.id);
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
                          {total === null || total === undefined ? "—" : formatEUR(total / 100)}
                        </TableCell>
                        <TableCell>
                          <DealStatusBadge status={deal.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3">
              <TablePagination
                page={view.page}
                totalPages={view.totalPages}
                pageSize={view.pageSize}
                total={view.total}
                from={view.from}
                to={view.to}
                onPage={view.setPage}
                onPageSize={view.setPageSize}
                labels={paginationLabels}
                divider={false}
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
