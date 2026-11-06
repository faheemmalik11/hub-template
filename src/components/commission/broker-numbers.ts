import type { BrokerBonus, Deal } from "@/data";

export interface BrokerNumbers {
  notarisedThisYear: number;
  notarisedLastYear: number;
  salesInProgress: number;
  bonusesToConfirm: number;
  bonusesAwaitingReview: number;
  bonusesApprovedNotPaid: number;
  bonusesPaidThisYear: number;
}

const yearOf = (isoDate: string) => Number(isoDate.slice(0, 4));

export function brokerNumbers(deals: Deal[], bonuses: BrokerBonus[], year: number): BrokerNumbers {
  const live = deals.filter((deal) => deal.status !== "cancelled");
  const sumOf = (rows: BrokerBonus[]) => rows.reduce((total, bonus) => total + bonus.amount, 0);
  const withStatus = (status: BrokerBonus["status"]) =>
    bonuses.filter((bonus) => bonus.status === status);

  return {
    notarisedThisYear: live.filter((d) => d.notarised_on && yearOf(d.notarised_on) === year).length,
    notarisedLastYear: live.filter((d) => d.notarised_on && yearOf(d.notarised_on) === year - 1)
      .length,
    salesInProgress: live.filter((d) => !d.notarised_on || d.status === "incomplete").length,
    bonusesToConfirm: withStatus("suggested").length,
    bonusesAwaitingReview: withStatus("submitted").length,
    bonusesApprovedNotPaid: sumOf(withStatus("approved")),
    bonusesPaidThisYear: sumOf(withStatus("paid").filter((b) => yearOf(b.earned_on) === year)),
  };
}
