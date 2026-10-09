import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { DealStatusBadge } from "@/components/commission/deal-status-badge";
import { BonusSuggestionsCard } from "@/components/commission/bonus-suggestions-card";
import { DealCostsCard } from "@/components/commission/deal-costs-card";
import { DealFactsCard } from "@/components/commission/deal-facts-card";
import { DraftInvoices } from "@/components/commission/draft-invoices";
import { SideCard } from "@/components/commission/side-card";
import {
  SIDES,
  calculateDealForm,
  dealFormOf,
  saveInputOf,
  type DealForm,
} from "@/components/commission/deal-form";
import {
  useApproveDeal,
  useCompanies,
  useCreateCustomer,
  useCustomers,
  useDeal,
  useSaveDeal,
} from "@/data";
import type { Deal } from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { errorText, formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/commission-deals/$id")({
  head: () => ({ meta: [{ title: pageTitle("Provision") }] }),
  staticData: { titleKey: "commission" },
  component: CommissionDealPage,
});

function CommissionDealPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const dealQ = useDeal(id);

  return (
    <div>
      <Link
        to="/commission-deals"
        className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("commissionDeals.back")}
      </Link>
      {dealQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} cols={2} />
        </div>
      ) : dealQ.error ? (
        <div className="mt-4">
          <ErrorState error={dealQ.error} onRetry={() => dealQ.refetch()} />
        </div>
      ) : !dealQ.data ? (
        <p className="mt-6 text-muted-foreground">{t("commissionDeals.notFound")}</p>
      ) : (
        <DealEditor deal={dealQ.data} />
      )}
    </div>
  );
}

function DealEditor({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const mayEditAny = can(PERMISSIONS.documentsWrite);
  const mayEdit =
    mayEditAny ||
    (can(PERMISSIONS.dealsSubmit) && (deal.status === "incomplete" || deal.status === "ready"));
  const mayApprove = can(PERMISSIONS.invoicesApprove);
  const suggestsBonuses = useFeature(PERMISSIONS.bonusesSuggest) && can(PERMISSIONS.bonusesReview);
  const [form, setForm] = useState<DealForm>(() => dealFormOf(deal));
  const [savedForm, setSavedForm] = useState(() => JSON.stringify(dealFormOf(deal)));
  const customersQ = useCustomers();
  const companiesQ = useCompanies();
  const createCustomer = useCreateCustomer();
  const save = useSaveDeal(deal.id);
  const approve = useApproveDeal(deal.id);

  useEffect(() => {
    const fresh = dealFormOf(deal);
    setForm(fresh);
    setSavedForm(JSON.stringify(fresh));
  }, [deal]);

  const result = useMemo(() => calculateDealForm(form), [form]);
  const unsaved = JSON.stringify(form) !== savedForm;
  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      (customersQ.data ?? []).map((customer) => ({
        value: customer.id,
        label: customer.name,
        keywords: [customer.address_city, customer.email].filter(Boolean).join(" "),
      })),
    [customersQ.data],
  );
  const customerName = (customerId: string) =>
    customersQ.data?.find((customer) => customer.id === customerId)?.name;
  const companyOptions = useMemo<ComboboxOption[]>(
    () =>
      (companiesQ.data ?? []).map((company) => ({
        value: company.id,
        label: `${company.code} · ${company.name}`,
      })),
    [companiesQ.data],
  );

  const set = (patch: Partial<DealForm>) => setForm((current) => ({ ...current, ...patch }));

  const addCustomer = async (name: string) => {
    const companyId = form.companyId ?? companiesQ.data?.[0]?.id;
    if (!companyId && mayEditAny) throw new Error("No company to file the customer under");
    const customer = await createCustomer.mutateAsync({
      companyId: companyId ?? null,
      isCompany: false,
      name,
    });
    return customer.id;
  };

  const runSave = () =>
    save.mutate(
      { ...saveInputOf(form), complete: result.ok },
      {
        onSuccess: () => toast.success(t("commissionDeals.actions.saved")),
        onError: (error) =>
          toast.error(t("commissionDeals.actions.saveFailed"), { description: errorText(error) }),
      },
    );

  const runApprove = () =>
    approve.mutate(undefined, {
      onSuccess: () => toast.success(t("commissionDeals.actions.approved")),
      onError: (error) =>
        toast.error(t("commissionDeals.actions.approveFailed"), { description: errorText(error) }),
    });

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {deal.property?.name ?? deal.property_label ?? t("commissionDeals.sale.title")}
        </h1>
        <DealStatusBadge status={deal.status} />
        {unsaved && (
          <span className="text-sm text-muted-foreground">
            {t("commissionDeals.actions.unsaved")}
          </span>
        )}
      </div>
      {deal.property_label && (
        <p className="mt-1 text-sm text-muted-foreground">
          {deal.property ? (
            <Link
              to="/properties/$code"
              params={{ code: deal.property.code }}
              className="hover:underline"
            >
              {deal.property_label}
            </Link>
          ) : (
            deal.property_label
          )}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">
              {t("commissionDeals.sale.title")}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {companyOptions.length > 1 && (
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>{t("commissionDeals.sale.company")}</Label>
                  <Combobox
                    value={form.companyId}
                    onValueChange={(companyId) => set({ companyId })}
                    options={companyOptions}
                    disabled={!mayEdit}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("commissionDeals.sale.notarisedOn")}</Label>
                <Input
                  type="date"
                  value={form.notarisedOn}
                  onChange={(event) => set({ notarisedOn: event.target.value })}
                  disabled={!mayEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("commissionDeals.sale.price")}</Label>
                <Input
                  inputMode="decimal"
                  value={form.purchasePrice}
                  onChange={(event) => set({ purchasePrice: event.target.value })}
                  placeholder="610.000"
                  disabled={!mayEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("commissionDeals.sale.vat")}</Label>
                <Input
                  inputMode="decimal"
                  value={form.vatRate}
                  onChange={(event) => set({ vatRate: event.target.value })}
                  disabled={!mayEdit}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label>{t("commissionDeals.sale.note")}</Label>
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(event) => set({ note: event.target.value })}
                  disabled={!mayEdit}
                />
              </div>
            </div>
          </section>

          <DealFactsCard
            form={form}
            onChange={set}
            customerOptions={customerOptions}
            disabled={!mayEdit}
            assignsBrokers={mayEditAny}
          />

          <DealCostsCard
            costs={form.costs}
            onChange={(costs) => set({ costs })}
            disabled={!mayEdit}
          />

          {SIDES.map((side) => (
            <SideCard
              key={side}
              side={side}
              value={form[side]}
              onChange={(next) => set({ [side]: next })}
              customerOptions={customerOptions}
              createCustomer={addCustomer}
              disabled={!mayEdit}
            />
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">
              {t("commissionDeals.drafts.title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("commissionDeals.drafts.hint")}</p>
            <div className="mt-4">
              <DraftInvoices result={result} customerName={customerName} />
            </div>
          </section>

          {suggestsBonuses && !unsaved && <BonusSuggestionsCard deal={deal} />}

          <div className="flex flex-wrap gap-2">
            {mayEdit && (
              <Button onClick={runSave} disabled={save.isPending || !unsaved}>
                {save.isPending
                  ? t("commissionDeals.actions.saving")
                  : t("commissionDeals.actions.save")}
              </Button>
            )}
            {mayApprove && deal.status !== "approved" && (
              <Button
                variant="outline"
                onClick={runApprove}
                disabled={approve.isPending || unsaved || deal.status !== "ready"}
              >
                <Check className="size-4" />
                {approve.isPending
                  ? t("commissionDeals.actions.approving")
                  : t("commissionDeals.actions.approve")}
              </Button>
            )}
          </div>
          {unsaved && deal.status !== "approved" && mayApprove && result.ok && (
            <p className="text-xs text-muted-foreground">
              {t("commissionDeals.actions.saveFirst")}
            </p>
          )}
          {deal.status === "approved" && deal.approved_at && (
            <p className="text-xs text-muted-foreground">
              {t("commissionDeals.actions.approvedNote", {
                when: formatDateTime(deal.approved_at),
              })}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
