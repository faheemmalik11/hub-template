import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  ImageOff,
  Info,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/feld";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewLine } from "@/kit/ui";
import { useEmitOnboardingEvent } from "@/kit/components/onboarding";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { DealStatusStepper } from "@/components/commission/deal-status-stepper";
import { BonusSuggestionsCard } from "@/components/commission/bonus-suggestions-card";
import { DealCommissionOverviewCard } from "@/components/commission/deal-commission-overview-card";
import { DealDonationCard } from "@/components/commission/deal-donation-card";
import { DealReferrerBonusCard } from "@/components/commission/deal-referrer-bonus-card";
import { DealCostsCard } from "@/components/commission/deal-costs-card";
import { DealFactsCard } from "@/components/commission/deal-facts-card";
import { CrmChangesCard } from "@/components/commission/crm-changes-card";
import { DealInvoicesCard } from "@/components/commission/deal-invoices-card";
import { DraftInvoices } from "@/components/commission/draft-invoices";
import { DraftInvoicePreviewTeaser } from "@/components/commission/draft-invoice-preview-teaser";
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
import type { CommissionSide } from "@/kit/lib/commission";
import {
  useApproveDeal,
  useCompanies,
  useCreateCustomer,
  useCreateDealInvoices,
  useCustomers,
  useDeal,
  useEmployees,
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
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { edgeFunctionErrorText, errorText, formatDateTime } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { cn } from "@/lib/utils";

function sanitizeAmountInput(raw: string): string {
  const digitsAndSeparators = raw.replace(/[^0-9.,]/g, "");
  const separatorIndex = digitsAndSeparators.search(/[.,]/);
  if (separatorIndex === -1) return digitsAndSeparators;
  return (
    digitsAndSeparators.slice(0, separatorIndex + 1) +
    digitsAndSeparators.slice(separatorIndex + 1).replace(/[.,]/g, "")
  );
}

const DEAL_TABS = ["dealDetails", "ownership", "calculation", "invoices"] as const;

const DEAL_TAB_LABEL_KEY: Record<(typeof DEAL_TABS)[number], string> = {
  dealDetails: "commissionDeals.tabs.dealDetails",
  ownership: "commissionDeals.tabs.ownership",
  calculation: "commissionDeals.tabs.calculation",
  invoices: "commissionDeals.tabs.invoices",
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

function DealPropertyThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md object-cover"
    />
  );
}

async function pushDueDateToCrm(propertyId: string): Promise<void> {
  const { error } = await sb.functions.invoke(EDGE_FUNCTION.propstackPaymentDueDatePush, {
    body: { property_id: propertyId },
  });
  if (error) throw new Error(await edgeFunctionErrorText(error));
}

async function pushDealValuesToCrm(dealId: string): Promise<void> {
  const { error } = await sb.functions.invoke(EDGE_FUNCTION.propstackDealValuesPush, {
    body: { deal_id: dealId },
  });
  if (error) throw new Error(await edgeFunctionErrorText(error));
}

function DealEditor({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const emitOnboardingEvent = useEmitOnboardingEvent();
  const mayEditAny = can(PERMISSIONS.documentsWrite);
  const mayEdit =
    deal.status !== "settled" &&
    deal.status !== "cancelled" &&
    (mayEditAny ||
      (can(PERMISSIONS.dealsSubmit) && (deal.status === "incomplete" || deal.status === "ready")));
  // The money side of the deal (price, VAT, fee rates, payers, shares, discounts) is locked once
  // invoiced, because real invoices already reference that exact data. Ownership facts and the
  // cost list stay editable after invoicing — costs_closed in particular is meant to be ticked
  // once invoicing is already done, as part of the bonus payout workflow.
  const mayEditFinancials = mayEdit && deal.status !== "invoiced";
  const mayApprove = can(PERMISSIONS.invoicesApprove);
  const suggestsBonuses = useFeature(PERMISSIONS.bonusesSuggest) && can(PERMISSIONS.bonusesReview);
  const suggestsReferrerBonuses =
    useFeature(PERMISSIONS.bonusesSuggestReferrer) && can(PERMISSIONS.bonusesReview);
  const managesDonations = can(PERMISSIONS.donationsManage);
  const seesCommission = can(PERMISSIONS.dealsCommissionRead);
  const syncsPaymentDueDate = useFeature(PERMISSIONS.propstackPaymentDueDateSync);
  const syncsDealValues = useFeature(PERMISSIONS.propstackDealValuesSync);
  const [activeTab, setActiveTab] = useTabParam(DEAL_TABS, "dealDetails");
  const [form, setForm] = useState<DealForm>(() => dealFormOf(deal));
  const [savedForm, setSavedForm] = useState(() => JSON.stringify(dealFormOf(deal)));
  const [dueDate, setDueDate] = useState(deal.property?.payment_due_date ?? "");
  const [dueDateNote, setDueDateNote] = useState(deal.property?.payment_due_date_note ?? "");
  const [savedDueDate, setSavedDueDate] = useState(deal.property?.payment_due_date ?? "");
  const [savedDueDateNote, setSavedDueDateNote] = useState(
    deal.property?.payment_due_date_note ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [createInvoicesConfirmOpen, setCreateInvoicesConfirmOpen] = useState(false);
  const customersQ = useCustomers();
  const companiesQ = useCompanies();
  const employeesQ = useEmployees();
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
  useEffect(() => {
    if (result.ok)
      emitOnboardingEvent({ type: "commission_deal_financials_ready", recordId: deal.id });
  }, [result.ok, deal.id, emitOnboardingEvent]);
  useEffect(() => {
    if (!form.ownLead && form.handledBy && form.acquiredBy && form.acquiredBy !== form.handledBy) {
      emitOnboardingEvent({ type: "commission_deal_ownership_split", recordId: deal.id });
    }
  }, [form.ownLead, form.handledBy, form.acquiredBy, deal.id, emitOnboardingEvent]);
  const sideShareInvalid = (side: CommissionSide) =>
    !result.ok &&
    result.problems.some(
      (problem) =>
        problem.side === side &&
        (problem.problem === "shares_do_not_add_up" || problem.problem === "shares_incomplete"),
    );
  const dueDateUnsaved = dueDate !== savedDueDate || dueDateNote !== savedDueDateNote;
  const unsaved = JSON.stringify(form) !== savedForm || dueDateUnsaved;
  const dealValuesUnsaved = useMemo(() => {
    const saved = JSON.parse(savedForm) as DealForm;
    return (
      form.notarisedOn !== saved.notarisedOn ||
      form.purchasePrice !== saved.purchasePrice ||
      form.buyer.feeKind !== saved.buyer.feeKind ||
      form.buyer.rate !== saved.buyer.rate ||
      form.seller.feeKind !== saved.seller.feeKind ||
      form.seller.rate !== saved.seller.rate
    );
  }, [form, savedForm]);
  const reviewLines = useMemo<ReviewLine[]>(() => {
    const lines: ReviewLine[] = [];
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
          target: { tab: "dealDetails", anchor: `side-${side}-fee` },
        });
      }
    }
    if (deal.property && !deal.property.payment_due_date && !deal.property.payment_due_date_note) {
      lines.push({
        field: "payment_due_date",
        text: t("commissionDeals.review.missingDueDate"),
        target: { tab: "dealDetails", anchor: "field-due-date" },
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
  const employeeName = (userId: string | null) =>
    employeesQ.data?.find((employee) => employee.id === userId)?.name ??
    employeesQ.data?.find((employee) => employee.id === userId)?.email ??
    t("commissionDeals.bonuses.nobody");
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
    const propertyId = deal.property_id;
    const needsDueDateSave = dueDateUnsaved && !!propertyId;
    const needsDealValuesPush =
      dealValuesUnsaved && syncsDealValues && !!deal.property?.external_id;
    // Captured now, synchronously: `await save.mutateAsync` below gives the deal query time to
    // refetch and re-render, which resets the dueDate/dueDateNote state via the effect watching
    // `deal` — reading the state again after that await would send whatever it was reset to.
    const dueDateToSave = dueDate;
    const dueDateNoteToSave = dueDateNote;

    const sequence = (async () => {
      await save.mutateAsync({ ...saveInputOf(form), complete: result.ok });
      emitOnboardingEvent({
        type: "commission_deal_saved",
        recordId: deal.id,
        data: { ready: result.ok },
      });

      let pushedToCrm: boolean | null = null;
      let reason = "";

      if (needsDueDateSave) {
        await updateDueDate.mutateAsync({
          payment_due_date: dueDateToSave.trim() === "" ? null : dueDateToSave,
          payment_due_date_note: dueDateNoteToSave.trim() === "" ? null : dueDateNoteToSave.trim(),
          payment_due_date_source: "hub",
        });
        setSavedDueDate(dueDateToSave);
        setSavedDueDateNote(dueDateNoteToSave);

        if (syncsPaymentDueDate) {
          try {
            await pushDueDateToCrm(propertyId);
            pushedToCrm = true;
          } catch (error) {
            pushedToCrm = false;
            reason = error instanceof Error ? error.message : String(error);
          }
        }
      }

      if (needsDealValuesPush) {
        try {
          await pushDealValuesToCrm(deal.id);
          if (pushedToCrm !== false) pushedToCrm = true;
        } catch (error) {
          const dealValuesReason = error instanceof Error ? error.message : String(error);
          pushedToCrm = false;
          reason = reason ? `${reason}; ${dealValuesReason}` : dealValuesReason;
        }
      }

      return { pushedToCrm, reason };
    })();

    const willSyncToCrm = (needsDueDateSave && syncsPaymentDueDate) || needsDealValuesPush;
    setIsSaving(true);
    toast.promise(sequence, {
      loading: t(
        willSyncToCrm
          ? "commissionDeals.actions.savingAndSyncing"
          : "commissionDeals.actions.saving",
      ),
      success: (outcome) => {
        if (outcome.pushedToCrm === true) return t("commissionDeals.actions.savedAndSynced");
        if (outcome.pushedToCrm === false) {
          return t("commissionDeals.actions.savedButNotInCrm", { reason: outcome.reason });
        }
        return t("commissionDeals.actions.saved");
      },
      error: (error) => t("commissionDeals.actions.saveFailed", { error: errorText(error) }),
    });
    sequence.finally(() => setIsSaving(false));
  };

  const runApprove = () => {
    const promise = approve.mutateAsync(undefined);
    promise
      .then(() => emitOnboardingEvent({ type: "commission_deal_approved", recordId: deal.id }))
      .catch(() => {
        // Already reported by toast.promise below; nothing further to do here.
      });
    toast.promise(promise, {
      loading: t("commissionDeals.actions.approving"),
      success: t("commissionDeals.actions.approved"),
      error: (error) => t("commissionDeals.actions.approveFailed", { error: errorText(error) }),
    });
  };

  const runCreateInvoices = () => {
    let invoices;
    try {
      invoices = invoiceInputsOf(deal, result);
    } catch (error) {
      toast.error(t("commissionDeals.actions.createInvoicesFailed", { error: errorText(error) }));
      return;
    }
    const promise = createInvoices.mutateAsync(invoices);
    promise
      .then(() =>
        emitOnboardingEvent({ type: "commission_deal_invoices_created", recordId: deal.id }),
      )
      .catch(() => {
        // Already reported by toast.promise below; nothing further to do here.
      });
    toast.promise(promise, {
      loading: t("commissionDeals.actions.creatingInvoices"),
      success: t("commissionDeals.actions.invoicesCreated"),
      error: (error) =>
        t("commissionDeals.actions.createInvoicesFailed", { error: errorText(error) }),
    });
  };

  const showSave = mayEdit;
  const showApprove =
    mayApprove &&
    deal.status !== "approved" &&
    deal.status !== "invoiced" &&
    deal.status !== "settled";
  const showCreateInvoices = mayApprove && deal.status === "approved" && result.ok;
  const saveDisabled = isSaving || !unsaved;
  const approveDisabled = isSaving || approve.isPending || unsaved || deal.status !== "ready";
  const createInvoicesDisabled = isSaving || createInvoices.isPending || unsaved;

  const primaryAction =
    deal.status === "incomplete" && showSave
      ? "save"
      : unsaved && showSave
        ? "save"
        : showCreateInvoices
          ? "createInvoices"
          : showApprove
            ? "approve"
            : showSave
              ? "save"
              : null;
  const secondaryActions = (["save", "approve", "createInvoices"] as const).filter(
    (action) =>
      action !== primaryAction &&
      ((action === "save" && showSave) ||
        (action === "approve" && showApprove) ||
        (action === "createInvoices" && showCreateInvoices)),
  );
  const hasPropstackLink = !!deal.property?.external_id;
  const showMoreMenu = secondaryActions.length > 0 || hasPropstackLink;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DealPropertyThumbnail url={deal.property?.cover_image_url ?? null} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {deal.property?.name ?? deal.property_label ?? t("commissionDeals.sale.title")}
          </h1>
          {deal.property_label && (
            <p className="text-sm text-muted-foreground">
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
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <DealStatusStepper status={deal.status} />
          {unsaved && (
            <span className="text-sm text-muted-foreground">
              {t("commissionDeals.actions.unsaved")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showMoreMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shadow-none">
                  <MoreHorizontal className="size-4" />
                  {t("commissionDeals.actions.more")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-auto min-w-48 [&_[role=menuitem]]:whitespace-nowrap"
              >
                {secondaryActions.includes("save") && (
                  <DropdownMenuItem
                    data-tour="commission-save"
                    className="cursor-pointer"
                    disabled={saveDisabled}
                    onSelect={runSave}
                  >
                    {t("commissionDeals.actions.save")}
                  </DropdownMenuItem>
                )}
                {secondaryActions.includes("approve") && (
                  <DropdownMenuItem
                    data-tour="commission-approve"
                    className="cursor-pointer"
                    disabled={approveDisabled}
                    onSelect={runApprove}
                  >
                    <Check className="size-4" /> {t("commissionDeals.actions.approve")}
                  </DropdownMenuItem>
                )}
                {secondaryActions.includes("createInvoices") && (
                  <DropdownMenuItem
                    data-tour="commission-create-invoices"
                    className="cursor-pointer"
                    disabled={createInvoicesDisabled}
                    onSelect={() => setCreateInvoicesConfirmOpen(true)}
                  >
                    <Check className="size-4" /> {t("commissionDeals.actions.createInvoices")}
                  </DropdownMenuItem>
                )}
                {secondaryActions.length > 0 && hasPropstackLink && <DropdownMenuSeparator />}
                {hasPropstackLink && deal.property?.external_id && (
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <a
                      href={propstackUnitUrl(deal.property.external_id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-4" />{" "}
                      {t("commissionDeals.actions.openInPropstack")}
                    </a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {primaryAction === "save" && (
            <Button
              data-tour="commission-save"
              className="shadow-none"
              onClick={runSave}
              disabled={saveDisabled}
            >
              {isSaving ? t("commissionDeals.actions.saving") : t("commissionDeals.actions.save")}
            </Button>
          )}
          {primaryAction === "approve" && (
            <Button
              data-tour="commission-approve"
              className="shadow-none"
              onClick={runApprove}
              disabled={approveDisabled}
            >
              <Check className="size-4" />
              {approve.isPending
                ? t("commissionDeals.actions.approving")
                : t("commissionDeals.actions.approve")}
            </Button>
          )}
          {primaryAction === "createInvoices" && (
            <Button
              data-tour="commission-create-invoices"
              className="shadow-none"
              onClick={() => setCreateInvoicesConfirmOpen(true)}
              disabled={createInvoicesDisabled}
            >
              <Check className="size-4" />
              {createInvoices.isPending
                ? t("commissionDeals.actions.creatingInvoices")
                : t("commissionDeals.actions.createInvoices")}
            </Button>
          )}
        </div>
      </div>
      <AlertDialog open={createInvoicesConfirmOpen} onOpenChange={setCreateInvoicesConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("commissionDeals.actions.createInvoicesConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("commissionDeals.actions.createInvoicesConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("commissionDeals.actions.createInvoicesConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCreateInvoicesConfirmOpen(false);
                runCreateInvoices();
              }}
            >
              {t("commissionDeals.actions.createInvoicesConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {unsaved && mayApprove && result.ok && deal.status !== "approved" && (
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {t("commissionDeals.actions.saveFirst")}
        </p>
      )}
      {unsaved && mayApprove && result.ok && deal.status === "approved" && (
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {t("commissionDeals.actions.saveFirstBeforeInvoices")}
        </p>
      )}

      <div className="mt-4">
        <CrmChangesCard deal={deal} />
      </div>

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
                  {line.target && mayEditFinancials && (
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

      {deal.status === "approved" && deal.approved_at && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("commissionDeals.actions.approvedNote", {
            name: employeeName(deal.approved_by),
            when: formatDateTime(deal.approved_at),
          })}
        </div>
      )}

      {deal.status === "invoiced" && (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("commissionDeals.actions.invoicedLexwareNote")}{" "}
          <Link
            to="/outgoing-invoices"
            className="font-medium text-brand-dark underline-offset-4 hover:underline"
          >
            {t("commissionDeals.actions.invoicedLexwareNoteLink")}
          </Link>
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Tabs
          value={activeTab}
          onValueChange={(tab) => {
            setActiveTab(tab);
            if (tab === "calculation") {
              emitOnboardingEvent({
                type: "commission_deal_calculation_viewed",
                recordId: deal.id,
              });
            }
          }}
          orientation="vertical"
          className="rounded-xl border border-border bg-card lg:flex"
        >
          <TabsList className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-transparent p-2 lg:w-48 lg:shrink-0 lg:flex-col lg:items-stretch lg:justify-start lg:border-r lg:border-border lg:bg-muted/30">
            {DEAL_TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                data-tour={tab === "calculation" ? "commission-calculation-tab" : undefined}
                className="w-full justify-start rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-brand-tint data-[state=active]:text-brand-dark data-[state=active]:shadow-none"
              >
                {t(DEAL_TAB_LABEL_KEY[tab])}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1 p-5">
            <TabsContent value="dealDetails" className="mt-0 space-y-6">
              <div className="@container grid gap-3 @lg:grid-cols-3">
                {companyOptions.length > 1 && (
                  <Field className="space-y-1.5 @lg:col-span-3">
                    <Label>{t("commissionDeals.sale.company")}</Label>
                    <Combobox
                      value={form.companyId}
                      onValueChange={(companyId) => set({ companyId })}
                      options={companyOptions}
                      disabled={!mayEditFinancials}
                      clearable
                    />
                  </Field>
                )}
                <Field
                  id="field-notarised-on"
                  data-tour="commission-notarised-on"
                  className="space-y-1.5"
                >
                  <Label>{t("commissionDeals.sale.notarisedOn")}</Label>
                  <DatePicker
                    value={form.notarisedOn}
                    onChange={(value) => set({ notarisedOn: value })}
                    disabled={!mayEditFinancials}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("commissionDeals.sale.notarisedOnHint")}
                  </p>
                </Field>
                <Field
                  id="field-purchase-price"
                  data-tour="commission-purchase-price"
                  className="space-y-1.5"
                >
                  <Label>{t("commissionDeals.sale.price")}</Label>
                  <Input
                    inputMode="decimal"
                    value={form.purchasePrice}
                    onChange={(event) =>
                      set({ purchasePrice: sanitizeAmountInput(event.target.value) })
                    }
                    placeholder="610.000"
                    disabled={!mayEditFinancials}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("commissionDeals.sale.priceHint")}
                  </p>
                </Field>
                <Field id="field-vat" className="space-y-1.5">
                  <Label>{t("commissionDeals.sale.vat")}</Label>
                  <Input
                    inputMode="decimal"
                    value={form.vatRate}
                    onChange={(event) => set({ vatRate: sanitizeAmountInput(event.target.value) })}
                    disabled={!mayEditFinancials}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("commissionDeals.sale.vatHint")}
                  </p>
                </Field>
                {deal.property_id && (
                  <>
                    <Field id="field-due-date" className="space-y-1.5">
                      <Label>{t("commissionDeals.sale.dueDate")}</Label>
                      <DatePicker
                        value={dueDate}
                        onChange={setDueDate}
                        disabled={!mayEditFinancials}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("commissionDeals.sale.dueDateHint")}
                      </p>
                      {dueDateNote.trim() !== "" && dueDate.trim() === "" && (
                        <p className="text-xs text-muted-foreground">
                          {t("commissionDeals.sale.dueDateRedundantHint")}
                        </p>
                      )}
                    </Field>
                    <Field className="space-y-1.5 @lg:col-span-2">
                      <Label>{t("commissionDeals.sale.dueDateNote")}</Label>
                      <Input
                        value={dueDateNote}
                        onChange={(event) => setDueDateNote(event.target.value)}
                        placeholder={t("commissionDeals.sale.dueDateNotePlaceholder")}
                        disabled={!mayEditFinancials}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("commissionDeals.sale.dueDateNoteHint")}
                      </p>
                      {dueDate.trim() !== "" && (
                        <p className="text-xs text-muted-foreground">
                          {t("commissionDeals.sale.dueDateNoteRedundantHint")}
                        </p>
                      )}
                    </Field>
                  </>
                )}
                <Field className="space-y-1.5 @lg:col-span-3">
                  <Label>{t("commissionDeals.sale.note")}</Label>
                  <Textarea
                    rows={2}
                    value={form.note}
                    onChange={(event) => set({ note: event.target.value })}
                    disabled={!mayEditFinancials}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("commissionDeals.sale.noteHint")}
                  </p>
                </Field>
              </div>

              <div className="@container grid gap-4 @lg:grid-cols-2">
                {SIDES.map((side) => (
                  <div
                    key={side}
                    data-tour={side === "buyer" ? "commission-side-buyer" : undefined}
                    className="rounded-xl border border-border bg-card p-5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                        <Users aria-hidden className="size-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t(`commissionDeals.side.${side}`)}
                      </h3>
                    </div>
                    <div className="mt-3">
                      <SideCard
                        side={side}
                        value={form[side]}
                        onChange={(next) => set({ [side]: next })}
                        customerOptions={customerOptions}
                        createCustomer={addCustomer}
                        disabled={!mayEditFinancials}
                        shareInvalid={sideShareInvalid(side)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <DraftInvoicePreviewTeaser
                result={result}
                customerName={customerName}
                onViewPreview={() => setActiveTab("calculation")}
              />
            </TabsContent>

            <TabsContent value="ownership" className="mt-0">
              <DealFactsCard
                form={form}
                onChange={set}
                customerOptions={customerOptions}
                disabled={!mayEdit}
                assignsBrokers={mayEditAny}
                onJumpToField={jumpToAnchor}
              />
            </TabsContent>

            <TabsContent value="calculation" className="mt-0 space-y-6">
              <DealCostsCard
                costs={form.costs}
                onChange={(costs) => set({ costs })}
                disabled={!mayEdit}
                costsClosed={form.costsClosed}
                onJumpToField={jumpToAnchor}
              />
              {seesCommission && (
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {t("commissionDeals.drafts.title")}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("commissionDeals.drafts.hint")}
                  </p>
                  <div className="mt-4">
                    <DraftInvoices
                      result={result}
                      customerName={customerName}
                      onJumpToField={mayEditFinancials ? jumpToAnchor : undefined}
                      invoiced={deal.status === "invoiced"}
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="invoices" className="mt-0">
              <DealInvoicesCard deal={deal} />
            </TabsContent>
          </div>
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {seesCommission && (
            <DealCommissionOverviewCard
              result={result}
              customerName={customerName}
              onJumpToField={mayEditFinancials ? jumpToAnchor : undefined}
              invoiced={deal.status === "invoiced"}
            />
          )}
          {suggestsBonuses && !unsaved && deal.status !== "settled" && (
            <BonusSuggestionsCard deal={deal} onJumpToField={jumpToAnchor} />
          )}
          {suggestsReferrerBonuses && !unsaved && deal.status !== "settled" && (
            <DealReferrerBonusCard deal={deal} />
          )}
          {managesDonations && !unsaved && deal.status !== "settled" && (
            <DealDonationCard deal={deal} />
          )}
        </aside>
      </div>
    </>
  );
}
