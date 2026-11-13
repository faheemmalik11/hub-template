import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewLine } from "@/kit/ui";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { DealStatusBadge } from "@/components/commission/deal-status-badge";
import { BonusSuggestionsCard } from "@/components/commission/bonus-suggestions-card";
import { DealDonationCard } from "@/components/commission/deal-donation-card";
import { DealReferrerBonusCard } from "@/components/commission/deal-referrer-bonus-card";
import { DealCostsCard } from "@/components/commission/deal-costs-card";
import { DealFactsCard } from "@/components/commission/deal-facts-card";
import { DealInvoicesCard } from "@/components/commission/deal-invoices-card";
import { DraftInvoices } from "@/components/commission/draft-invoices";
import { SideCard } from "@/components/commission/side-card";
import { useShellLeafLabel } from "@/kit/components/shell";
import {
  SIDES,
  calculateDealForm,
  dealFormOf,
  invoiceInputsOf,
  saveInputOf,
  type DealForm,
} from "@/components/commission/deal-form";
import {
  useApproveDeal,
  useCompanies,
  useCreateCustomer,
  useCreateDealInvoices,
  useCustomers,
  useDeal,
  useSaveDeal,
  useUpdateProperty,
} from "@/data";
import type { Deal } from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { EDGE_FUNCTION } from "@/config/edge-functions";
import { pageTitle } from "@/config/brand";
import { useAuth } from "@/lib/auth";
import { sb } from "@/data/client";
import { edgeFunctionErrorText, errorText, formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { cn } from "@/lib/utils";

const DEAL_TABS = ["sale", "details", "costs", "buyer", "seller"] as const;

const DEAL_TAB_LABEL_KEY: Record<(typeof DEAL_TABS)[number], string> = {
  sale: "commissionDeals.sale.title",
  details: "commissionDeals.facts.title",
  costs: "commissionDeals.costs.title",
  buyer: "commissionDeals.side.buyer",
  seller: "commissionDeals.side.seller",
};

export const Route = createFileRoute("/commission-deals/$id")({
  head: () => ({ meta: [{ title: pageTitle("Provision") }] }),
  staticData: { titleKey: "commission" },
  validateSearch: (input: Record<string, unknown>) => tabSearch(input),
  component: CommissionDealPage,
});

function CommissionDealPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const dealQ = useDeal(id);
  useShellLeafLabel(dealQ.data ? (dealQ.data.property?.name ?? dealQ.data.property_label) : null);

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

async function pushDueDateToCrm(propertyId: string): Promise<void> {
  const { error } = await sb.functions.invoke(EDGE_FUNCTION.propstackPaymentDueDatePush, {
    body: { property_id: propertyId },
  });
  if (error) throw new Error(await edgeFunctionErrorText(error));
}

function DealEditor({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const mayEditAny = can(PERMISSIONS.documentsWrite);
  const mayEdit =
    deal.status !== "settled" &&
    (mayEditAny ||
      (can(PERMISSIONS.dealsSubmit) && (deal.status === "incomplete" || deal.status === "ready")));
  const mayApprove = can(PERMISSIONS.invoicesApprove);
  const suggestsBonuses = useFeature(PERMISSIONS.bonusesSuggest) && can(PERMISSIONS.bonusesReview);
  const managesDonations = can(PERMISSIONS.donationsManage);
  const syncsPaymentDueDate = useFeature(PERMISSIONS.propstackPaymentDueDateSync);
  const [activeTab, setActiveTab] = useTabParam(DEAL_TABS, "sale");
  const [form, setForm] = useState<DealForm>(() => dealFormOf(deal));
  const [savedForm, setSavedForm] = useState(() => JSON.stringify(dealFormOf(deal)));
  const [dueDate, setDueDate] = useState(deal.property?.payment_due_date ?? "");
  const [dueDateNote, setDueDateNote] = useState(deal.property?.payment_due_date_note ?? "");
  const [savedDueDate, setSavedDueDate] = useState(deal.property?.payment_due_date ?? "");
  const [savedDueDateNote, setSavedDueDateNote] = useState(
    deal.property?.payment_due_date_note ?? "",
  );
  const customersQ = useCustomers();
  const companiesQ = useCompanies();
  const createCustomer = useCreateCustomer();
  const save = useSaveDeal(deal.id);
  const approve = useApproveDeal(deal.id);
  const createInvoices = useCreateDealInvoices(deal.id);
  const updateDueDate = useUpdateProperty(deal.property_id ?? "");

  useEffect(() => {
    const fresh = dealFormOf(deal);
    setForm(fresh);
    setSavedForm(JSON.stringify(fresh));
    setDueDate(deal.property?.payment_due_date ?? "");
    setDueDateNote(deal.property?.payment_due_date_note ?? "");
    setSavedDueDate(deal.property?.payment_due_date ?? "");
    setSavedDueDateNote(deal.property?.payment_due_date_note ?? "");
  }, [deal]);

  const result = useMemo(() => calculateDealForm(form), [form]);
  const dueDateUnsaved = dueDate !== savedDueDate || dueDateNote !== savedDueDateNote;
  const unsaved = JSON.stringify(form) !== savedForm || dueDateUnsaved;
  const reviewLines = useMemo<ReviewLine[]>(() => {
    const lines: ReviewLine[] = [];
    if (deal.purchase_price === null) {
      lines.push({
        field: "purchase_price",
        text: t("commissionDeals.review.missingPrice"),
        target: { tab: "sale", anchor: "field-purchase-price" },
      });
    }
    if (deal.notarised_on === null) {
      lines.push({
        field: "notarised_on",
        text: t("commissionDeals.review.missingNotarisedOn"),
        target: { tab: "sale", anchor: "field-notarised-on" },
      });
    }
    for (const side of SIDES) {
      const dealSide = deal.deal_sides.find((s) => s.side === side);
      const missing =
        !dealSide ||
        (dealSide.fee_kind === "percent"
          ? dealSide.fee_net_rate === null
          : dealSide.fee_net_amount === null);
      if (missing) {
        lines.push({
          field: `${side}_fee`,
          title: t(`commissionDeals.side.${side}`),
          text: t("commissionDeals.review.missingFee"),
          target: { tab: side, anchor: `side-${side}-fee` },
        });
      }
    }
    if (deal.property && !deal.property.payment_due_date && !deal.property.payment_due_date_note) {
      lines.push({
        field: "payment_due_date",
        text: t("commissionDeals.review.missingDueDate"),
        target: { tab: "sale", anchor: "field-due-date" },
      });
    }
    return lines;
  }, [deal, t]);

  const [scrollTarget, setScrollTarget] = useState<{ tab: string; id: string } | null>(null);
  useEffect(() => {
    if (!scrollTarget || activeTab !== scrollTarget.tab) return;
    let frames = 0;
    let raf = 0;
    const attempt = () => {
      const el = document.getElementById(scrollTarget.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const flash = [
          "ring-2",
          "ring-brand-hover",
          "ring-offset-4",
          "ring-offset-background",
          "rounded-lg",
        ];
        el.classList.add(...flash);
        window.setTimeout(() => el.classList.remove(...flash), 1800);
        setScrollTarget(null);
        return;
      }
      if (++frames < 60) raf = requestAnimationFrame(attempt);
      else setScrollTarget(null);
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget, activeTab]);

  const jumpToAnchor = (tab: string, id: string) => {
    setActiveTab(tab);
    setScrollTarget({ tab, id });
  };
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

  const runSave = () => {
    save.mutate(
      { ...saveInputOf(form), complete: result.ok },
      {
        onSuccess: () => toast.success(t("commissionDeals.actions.saved")),
        onError: (error) =>
          toast.error(t("commissionDeals.actions.saveFailed"), { description: errorText(error) }),
      },
    );
    const propertyId = deal.property_id;
    if (dueDateUnsaved && propertyId) {
      updateDueDate.mutate(
        {
          payment_due_date: dueDate.trim() === "" ? null : dueDate,
          payment_due_date_note: dueDateNote.trim() === "" ? null : dueDateNote.trim(),
          payment_due_date_source: "hub",
        },
        {
          onSuccess: () => {
            setSavedDueDate(dueDate);
            setSavedDueDateNote(dueDateNote);
            if (syncsPaymentDueDate) {
              pushDueDateToCrm(propertyId).catch((error: unknown) =>
                toast.warning(t("commissionDeals.actions.dueDateNotInCrm"), {
                  description: errorText(error),
                }),
              );
            }
          },
          onError: (error) =>
            toast.error(t("commissionDeals.actions.saveFailed"), { description: errorText(error) }),
        },
      );
    }
  };

  const runApprove = () =>
    approve.mutate(undefined, {
      onSuccess: () => toast.success(t("commissionDeals.actions.approved")),
      onError: (error) =>
        toast.error(t("commissionDeals.actions.approveFailed"), { description: errorText(error) }),
    });

  const runCreateInvoices = () => {
    let invoices;
    try {
      invoices = invoiceInputsOf(deal, result);
    } catch (error) {
      toast.error(t("commissionDeals.actions.createInvoicesFailed"), {
        description: errorText(error),
      });
      return;
    }
    createInvoices.mutate(invoices, {
      onSuccess: () => toast.success(t("commissionDeals.actions.invoicesCreated")),
      onError: (error) =>
        toast.error(t("commissionDeals.actions.createInvoicesFailed"), {
          description: errorText(error),
        }),
    });
  };

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

      {/* A gentle nudge, not a warning: nothing here blocks saving or approving, and the whole
          point of the payment-due-date rule (briefing §4.3) is "don't chase anyone without a
          date" — so this reads calmly, the same way the direct-debit note on the invoice detail
          page does, not with the red/amber treatment reserved for something that needs fixing
          before the record can move on. */}
      {reviewLines.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base text-foreground">
          <Info className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("commissionDeals.review.title")}</p>
            <ul className="mt-1 space-y-1">
              {reviewLines.map((line) => (
                <li
                  key={line.field}
                  className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground"
                >
                  {line.title && <span className="font-medium text-foreground">{line.title}:</span>}
                  <span>{line.text}</span>
                  {line.target && (
                    <button
                      type="button"
                      onClick={() => jumpToAnchor(line.target!.tab, line.target!.anchor)}
                      className="text-xs font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {t("commissionDeals.review.fix")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="rounded-xl border border-border bg-card lg:flex"
        >
          <TabsList className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-transparent p-2 lg:w-48 lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-r lg:border-border lg:bg-muted/30">
            {DEAL_TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="w-full justify-start rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-brand-tint data-[state=active]:text-brand-dark data-[state=active]:shadow-none"
              >
                {t(DEAL_TAB_LABEL_KEY[tab])}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1 p-5">
            <TabsContent value="sale" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-3">
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
                <div id="field-notarised-on" className="space-y-1.5">
                  <Label>{t("commissionDeals.sale.notarisedOn")}</Label>
                  <Input
                    type="date"
                    value={form.notarisedOn}
                    onChange={(event) => set({ notarisedOn: event.target.value })}
                    disabled={!mayEdit}
                  />
                </div>
                <div id="field-purchase-price" className="space-y-1.5">
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
                {deal.property_id && (
                  <>
                    <div id="field-due-date" className="space-y-1.5">
                      <Label>{t("commissionDeals.sale.dueDate")}</Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        disabled={!mayEdit}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>{t("commissionDeals.sale.dueDateNote")}</Label>
                      <Input
                        value={dueDateNote}
                        onChange={(event) => setDueDateNote(event.target.value)}
                        placeholder={t("commissionDeals.sale.dueDateNotePlaceholder")}
                        disabled={!mayEdit}
                      />
                    </div>
                  </>
                )}
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
            </TabsContent>

            <TabsContent value="details" className="mt-0">
              <DealFactsCard
                form={form}
                onChange={set}
                customerOptions={customerOptions}
                disabled={!mayEdit}
                assignsBrokers={mayEditAny}
              />
            </TabsContent>

            <TabsContent value="costs" className="mt-0">
              <DealCostsCard
                costs={form.costs}
                onChange={(costs) => set({ costs })}
                disabled={!mayEdit}
              />
            </TabsContent>

            {SIDES.map((side) => (
              <TabsContent key={side} value={side} className="mt-0">
                <SideCard
                  side={side}
                  value={form[side]}
                  onChange={(next) => set({ [side]: next })}
                  customerOptions={customerOptions}
                  createCustomer={addCustomer}
                  disabled={!mayEdit}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">
              {t("commissionDeals.drafts.title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("commissionDeals.drafts.hint")}</p>
            <div className="mt-4">
              <DraftInvoices
                result={result}
                customerName={customerName}
                onJumpToField={jumpToAnchor}
              />
            </div>
          </section>

          <DealInvoicesCard deal={deal} />

          {suggestsBonuses && !unsaved && deal.status !== "settled" && (
            <BonusSuggestionsCard deal={deal} />
          )}
          {suggestsBonuses && !unsaved && deal.status !== "settled" && (
            <DealReferrerBonusCard deal={deal} />
          )}
          {managesDonations && !unsaved && deal.status !== "settled" && (
            <DealDonationCard deal={deal} />
          )}

          <div className="flex flex-wrap gap-2">
            {mayEdit && (
              <Button
                className="shadow-none"
                onClick={runSave}
                disabled={save.isPending || !unsaved}
              >
                {save.isPending
                  ? t("commissionDeals.actions.saving")
                  : t("commissionDeals.actions.save")}
              </Button>
            )}
            {mayApprove &&
              deal.status !== "approved" &&
              deal.status !== "invoiced" &&
              deal.status !== "settled" && (
                <Button
                  className="shadow-none"
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
            {mayApprove && deal.status === "approved" && result.ok && (
              <Button
                className="shadow-none"
                onClick={runCreateInvoices}
                disabled={createInvoices.isPending}
              >
                <Check className="size-4" />
                {createInvoices.isPending
                  ? t("commissionDeals.actions.creatingInvoices")
                  : t("commissionDeals.actions.createInvoices")}
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
