import { Link } from "@tanstack/react-router";

import { useBrokerBonuses, useDeals } from "@/data";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { brokerNumbers } from "./broker-numbers";

export function BrokerNumbersCard() {
  const { t } = useTranslation();
  const dealsQ = useDeals();
  const bonusesQ = useBrokerBonuses();
  if (!dealsQ.data || !bonusesQ.data) return null;

  const year = new Date().getFullYear();
  const numbers = brokerNumbers(dealsQ.data, bonusesQ.data, year);
  const tiles = [
    {
      label: t("commissionDeals.numbers.notarised", { year }),
      value: String(numbers.notarisedThisYear),
      hint: t("commissionDeals.numbers.lastYear", {
        year: year - 1,
        count: numbers.notarisedLastYear,
      }),
    },
    {
      label: t("commissionDeals.numbers.inProgress"),
      value: String(numbers.salesInProgress),
    },
    {
      label: t("commissionDeals.numbers.toConfirm"),
      value: String(numbers.bonusesToConfirm),
      to: numbers.bonusesToConfirm > 0 ? "/broker-bonuses" : undefined,
    },
    {
      label: t("commissionDeals.numbers.approved"),
      value: formatEUR(numbers.bonusesApprovedNotPaid),
      hint: t("commissionDeals.numbers.awaitingReview", { count: numbers.bonusesAwaitingReview }),
    },
    {
      label: t("commissionDeals.numbers.paid", { year }),
      value: formatEUR(numbers.bonusesPaidThisYear),
    },
  ];

  return (
    <section
      aria-label={t("commissionDeals.numbers.title")}
      className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {tiles.map((tile) => {
        const body = (
          <div className="h-full rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{tile.value}</p>
            {tile.hint && <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>}
          </div>
        );
        return tile.to ? (
          <Link key={tile.label} to={tile.to} className="block">
            {body}
          </Link>
        ) : (
          <div key={tile.label}>{body}</div>
        );
      })}
    </section>
  );
}
