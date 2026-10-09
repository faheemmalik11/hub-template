export type SuggestedBonusType =
  "notary" | "viewing_new_job" | "company_lead_share" | "own_job_share";

export interface BonusRuleSettings {
  notaryAmountCents: number;
  followUpAmountCents: number;
  ownLeadSharePercent: number;
  companyLeadSharePercent: number;
  personnelFlatCents: number;
  companyLeadDeductsCosts: boolean;
}

export interface BonusDealFacts {
  notarisedOn: string | null;
  ownLead: boolean;
  fromViewing: boolean;
  handledBy: string | null;
  acquiredBy: string | null;
  netCommissionCents: number | null;
  costsCents: number;
  costsClosed: boolean;
  allCommissionInvoicesPaid: boolean;
}

export type BonusWaitingFor =
  "notarisation" | "broker" | "commission" | "costs_closed" | "invoices_paid";

export type BonusSuggestion = {
  type: SuggestedBonusType;
  brokerUserId: string | null;
  earnedOn: string | null;
  amountCents: number | null;
  breakdown: BonusBreakdownLine[];
} & (
  | { state: "ready" }
  | { state: "waiting"; waitingFor: BonusWaitingFor[] }
  | { state: "no_remainder" }
);

export interface BonusBreakdownLine {
  label: "commission_net" | "costs" | "personnel_flat" | "share" | "fixed";
  cents: number;
  percent?: number;
}

function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

function paidOutAfterPayment(facts: BonusDealFacts): BonusWaitingFor[] {
  const waiting: BonusWaitingFor[] = [];
  if (!facts.costsClosed) waiting.push("costs_closed");
  if (!facts.allCommissionInvoicesPaid) waiting.push("invoices_paid");
  return waiting;
}

function suggestion(
  base: Pick<BonusSuggestion, "type" | "brokerUserId" | "earnedOn" | "amountCents" | "breakdown">,
  waitingFor: BonusWaitingFor[],
): BonusSuggestion {
  const waiting = [...waitingFor];
  if (!base.brokerUserId) waiting.unshift("broker");
  return waiting.length > 0
    ? { ...base, state: "waiting", waitingFor: waiting }
    : { ...base, state: "ready" };
}

export function suggestBonuses(
  facts: BonusDealFacts,
  settings: BonusRuleSettings,
): BonusSuggestion[] {
  const notarised = facts.notarisedOn !== null;
  const atNotarisation: BonusWaitingFor[] = notarised ? [] : ["notarisation"];
  const result: BonusSuggestion[] = [];
  const handler = facts.handledBy ?? facts.acquiredBy;

  if (facts.ownLead) {
    if (facts.netCommissionCents === null) {
      result.push(
        suggestion(
          {
            type: "own_job_share",
            brokerUserId: handler,
            earnedOn: null,
            amountCents: null,
            breakdown: [],
          },
          ["commission"],
        ),
      );
    } else {
      const remainder = facts.netCommissionCents - facts.costsCents - settings.personnelFlatCents;
      const breakdown: BonusBreakdownLine[] = [
        { label: "commission_net", cents: facts.netCommissionCents },
        { label: "costs", cents: -facts.costsCents },
        { label: "personnel_flat", cents: -settings.personnelFlatCents },
        {
          label: "share",
          cents: percentOf(remainder, settings.ownLeadSharePercent),
          percent: settings.ownLeadSharePercent,
        },
      ];
      const base = {
        type: "own_job_share" as const,
        brokerUserId: handler,
        earnedOn: null,
        amountCents: remainder > 0 ? percentOf(remainder, settings.ownLeadSharePercent) : null,
        breakdown,
      };
      result.push(
        remainder > 0
          ? suggestion(base, paidOutAfterPayment(facts))
          : { ...base, state: "no_remainder" },
      );
    }
  } else {
    result.push(
      suggestion(
        {
          type: "notary",
          brokerUserId: handler,
          earnedOn: facts.notarisedOn,
          amountCents: settings.notaryAmountCents,
          breakdown: [{ label: "fixed", cents: settings.notaryAmountCents }],
        },
        atNotarisation,
      ),
    );
  }

  if (facts.fromViewing) {
    result.push(
      suggestion(
        {
          type: "viewing_new_job",
          brokerUserId: handler,
          earnedOn: facts.notarisedOn,
          amountCents: settings.followUpAmountCents,
          breakdown: [{ label: "fixed", cents: settings.followUpAmountCents }],
        },
        atNotarisation,
      ),
    );
  }

  const leadOwnerIsAnotherBroker =
    !facts.ownLead && facts.acquiredBy !== null && facts.acquiredBy !== handler;
  if (leadOwnerIsAnotherBroker) {
    if (facts.netCommissionCents === null) {
      result.push(
        suggestion(
          {
            type: "company_lead_share",
            brokerUserId: facts.acquiredBy,
            earnedOn: null,
            amountCents: null,
            breakdown: [],
          },
          ["commission"],
        ),
      );
    } else {
      const basis = settings.companyLeadDeductsCosts
        ? facts.netCommissionCents - facts.costsCents
        : facts.netCommissionCents;
      const share = percentOf(basis, settings.companyLeadSharePercent);
      const breakdown: BonusBreakdownLine[] = [
        { label: "commission_net", cents: facts.netCommissionCents },
        ...(settings.companyLeadDeductsCosts
          ? [{ label: "costs" as const, cents: -facts.costsCents }]
          : []),
        { label: "share", cents: share, percent: settings.companyLeadSharePercent },
      ];
      const base = {
        type: "company_lead_share" as const,
        brokerUserId: facts.acquiredBy,
        earnedOn: null,
        amountCents: share > 0 ? share : null,
        breakdown,
      };
      result.push(
        share > 0
          ? suggestion(base, paidOutAfterPayment(facts))
          : { ...base, state: "no_remainder" },
      );
    }
  }

  return result;
}
