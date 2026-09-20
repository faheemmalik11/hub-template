import { Link } from "@tanstack/react-router";
import { CheckCircle2, EyeOff, Landmark, Link2Off, Search } from "lucide-react";

import { DashboardPanel } from "@/components/dashboard/panel";
import { CHIP, StatRow } from "@/components/dashboard/stat-tile";
import { useBankMatchingCounts } from "@/data";
import { useTranslation } from "@/lib/i18n";

/**
 * The bank side of the dashboard: how many movements the bank delivered, what is not linked to a
 * receipt yet, what has a suggestion waiting for a person, and what is settled. Every row opens
 * the transactions list already filtered to that state, the same pattern as the stage tiles.
 */
export function BankCard() {
  const { t } = useTranslation();
  const countsQ = useBankMatchingCounts();

  if (countsQ.isError) return null;

  const laedt = countsQ.isLoading;
  const c = countsQ.data;
  const val = (n: number | undefined) => (laedt || n === undefined ? "—" : String(n));

  return (
    <DashboardPanel title={t("home.bank.title")}>
      <div className="mt-3 flex flex-1 flex-col gap-1.5">
        <StatRow
          to="/banktransaktionen"
          icon={Landmark}
          iconCls={CHIP.brand}
          label={t("home.bank.gesamt")}
          value={val(c?.total)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "open" }}
          icon={Link2Off}
          iconCls={c && c.open > 0 ? CHIP.warning : CHIP.neutral}
          label={t("home.bank.offen")}
          value={val(c?.open)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "suggestion" }}
          icon={Search}
          iconCls={c && c.suggestion > 0 ? CHIP.brand : CHIP.neutral}
          label={t("home.bank.vorschlag")}
          value={val(c?.suggestion)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "matched" }}
          icon={CheckCircle2}
          iconCls={CHIP.success}
          label={t("home.bank.zugeordnet")}
          value={val(c?.matched)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "ignored" }}
          icon={EyeOff}
          iconCls={CHIP.neutral}
          label={t("home.bank.ignoriert")}
          value={val(c?.ignored)}
        />
      </div>
      <Link
        to="/banktransaktionen"
        className="mt-auto pt-2 text-sm font-medium text-brand-dark hover:underline"
      >
        {t("home.bank.all")}
      </Link>
    </DashboardPanel>
  );
}
