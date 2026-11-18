import type { OnboardingTask } from "@/kit/onboarding";

import type { PracticeTranslate } from "./practice-invoice-task";

export const COMMISSION_DEAL_PRACTICE_TASK_ID = "commission-deal";

const COMMISSION_DEALS_PATH = "/commission-deals";

export function buildCommissionDealPracticeTask(t: PracticeTranslate): OnboardingTask {
  const text = (key: string) => t(`onboarding.commissionDeal.${key}`);
  const pageCommission = text("pageCommission");
  const task: OnboardingTask = {
    id: COMMISSION_DEAL_PRACTICE_TASK_ID,
    title: text("taskTitle"),
    goal: text("taskGoal"),
    roles: ["preparer"],
    steps: [
      {
        id: "commission-open-new-deal",
        group: text("groupCreate"),
        type: "check",
        role: "preparer",
        instruction: text("openDealInstruction"),
        expectedOutcome: text("openDealOutcome"),
        target: "commission-new-deal",
        path: COMMISSION_DEALS_PATH,
        pageLabel: pageCommission,
        completionCondition: { eventType: "commission_deal_dialog_opened" },
      },
      {
        id: "commission-pick-property",
        group: text("groupCreate"),
        type: "check",
        role: "preparer",
        instruction: text("pickPropertyInstruction"),
        expectedOutcome: text("pickPropertyOutcome"),
        helpText: text("pickPropertyHelp"),
        target: "commission-property-picker",
        placement: "top",
        path: COMMISSION_DEALS_PATH,
        pageLabel: pageCommission,
        completionCondition: { eventType: "commission_deal_property_picked" },
      },
      {
        id: "commission-create-deal",
        group: text("groupCreate"),
        type: "check",
        role: "preparer",
        instruction: text("createDealInstruction"),
        expectedOutcome: text("createDealOutcome"),
        target: "commission-create-deal",
        path: COMMISSION_DEALS_PATH,
        pageLabel: pageCommission,
        completionCondition: { eventType: "commission_deal_created" },
      },
      {
        id: "commission-set-notary-date",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("notaryDateInstruction"),
        expectedOutcome: text("notaryDateOutcome"),
        target: "commission-notarised-on",
        placement: "top",
        completionCondition: { eventType: "commission_deal_notary_date_set" },
      },
      {
        id: "commission-set-purchase-price",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("purchasePriceInstruction"),
        expectedOutcome: text("purchasePriceOutcome"),
        target: "commission-purchase-price",
        placement: "top",
        completionCondition: { eventType: "commission_deal_purchase_price_set" },
      },
      {
        id: "commission-set-buyer-rate",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("buyerRateInstruction"),
        expectedOutcome: text("buyerRateOutcome"),
        helpText: text("buyerRateHelp"),
        target: "commission-buyer-rate",
        placement: "top",
        completionCondition: { eventType: "commission_deal_buyer_rate_set" },
      },
      {
        id: "commission-set-buyer-payer",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("buyerPayerInstruction"),
        expectedOutcome: text("buyerPayerOutcome"),
        target: "commission-buyer-payer",
        placement: "top",
        completionCondition: { eventType: "commission_deal_buyer_payer_set" },
      },
      {
        id: "commission-view-calculation",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("viewCalculationInstruction"),
        expectedOutcome: text("viewCalculationOutcome"),
        helpText: text("viewCalculationHelp"),
        target: "commission-calculation-tab",
        completionCondition: { eventType: "commission_deal_calculation_viewed" },
      },
      {
        id: "commission-save-details",
        group: text("groupDetails"),
        type: "check",
        role: "preparer",
        instruction: text("saveDetailsInstruction"),
        expectedOutcome: text("saveDetailsOutcome"),
        target: "commission-save",
        completionCondition: { eventType: "commission_deal_saved", data: { ready: true } },
      },
      {
        id: "commission-set-ownership",
        group: text("groupOwnership"),
        type: "check",
        role: "preparer",
        instruction: text("ownershipInstruction"),
        expectedOutcome: text("ownershipOutcome"),
        helpText: text("ownershipHelp"),
        target: "commission-handled-by|commission-acquired-by",
        placement: "top",
        completionCondition: { eventType: "commission_deal_ownership_split" },
      },
      {
        id: "commission-save-ownership",
        group: text("groupOwnership"),
        type: "check",
        role: "preparer",
        instruction: text("saveOwnershipInstruction"),
        expectedOutcome: text("saveOwnershipOutcome"),
        target: "commission-save",
        completionCondition: { eventType: "commission_deal_saved", data: { ready: true } },
      },
      {
        id: "commission-approve-deal",
        group: text("groupApprove"),
        type: "approve",
        role: "preparer",
        instruction: text("approveInstruction"),
        expectedOutcome: text("approveOutcome"),
        target: "commission-approve",
        completionCondition: { eventType: "commission_deal_approved" },
      },
      {
        id: "commission-create-invoices",
        group: text("groupApprove"),
        type: "confirm",
        role: "preparer",
        instruction: text("createInvoicesInstruction"),
        expectedOutcome: text("createInvoicesOutcome"),
        helpText: text("createInvoicesHelp"),
        target: "commission-create-invoices",
        completionCondition: { eventType: "commission_deal_invoices_created" },
      },
    ],
  };
  const restartHint = t("onboarding.commissionDeal.restartHint", {
    button: t("onboarding.practice.panelReset"),
  });
  return {
    ...task,
    steps: task.steps.map((step) =>
      step.completionCondition
        ? { ...step, helpText: [step.helpText, restartHint].filter(Boolean).join(" ") }
        : step,
    ),
  };
}
