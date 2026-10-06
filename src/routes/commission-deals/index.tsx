import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import { DealStatusBadge } from "@/components/commission/deal-status-badge";
import {
  calculateDealForm,
  dealFormOf,
  dealGrossTotalCents,
} from "@/components/commission/deal-form";
import { useCompanies, useCreateDeal, useDeals, useProperties, usePropertyListings } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
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
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("commissionDeals.columns.property")}</TableHead>
                  <TableHead>{t("commissionDeals.columns.notarisedOn")}</TableHead>
                  <TableHead className="text-right">{t("commissionDeals.columns.price")}</TableHead>
                  <TableHead className="text-right">
                    {t("commissionDeals.columns.commission")}
                  </TableHead>
                  <TableHead>{t("commissionDeals.columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => {
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
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const propertiesQ = useProperties();
  const listingsQ = usePropertyListings({ enabled: can(PERMISSIONS.propertiesCrmSync) });
  const companiesQ = useCompanies();
  const createDeal = useCreateDeal();

  const listingByProperty = useMemo(
    () => new Map((listingsQ.data ?? []).map((listing) => [listing.id, listing])),
    [listingsQ.data],
  );
  const options = useMemo<ComboboxOption[]>(
    () =>
      (propertiesQ.data ?? [])
        .filter((property) => !property.deleted_at)
        .map((property) => {
          const status = listingByProperty.get(property.id)?.crm_status;
          return {
            value: property.id,
            label: status
              ? `${property.name ?? property.code} · ${status}`
              : (property.name ?? property.code),
            keywords: [property.code, property.address].filter(Boolean).join(" "),
          };
        }),
    [propertiesQ.data, listingByProperty],
  );

  const create = () => {
    const property = propertiesQ.data?.find((candidate) => candidate.id === propertyId);
    if (!property) return;
    const listing = listingByProperty.get(property.id);
    createDeal.mutate(
      {
        propertyId: property.id,
        propertyLabel: [property.name ?? property.code, property.address]
          .filter(Boolean)
          .join(", "),
        companyId: companiesQ.data?.[0]?.id ?? null,
        purchasePrice: listing?.sold_price ?? listing?.asking_price ?? null,
      },
      {
        onSuccess: (id) => {
          setOpen(false);
          setPropertyId(null);
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
            <Combobox
              value={propertyId}
              onValueChange={setPropertyId}
              options={options}
              placeholder={t("commissionDeals.newDialog.propertyPlaceholder")}
              searchPlaceholder={t("commissionDeals.newDialog.propertySearch")}
              emptyText={t("commissionDeals.newDialog.noProperties")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("commissionDeals.newDialog.cancel")}
            </Button>
            <Button onClick={create} disabled={!propertyId || createDeal.isPending}>
              {t("commissionDeals.newDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
