import { Link } from "@tanstack/react-router";
import { CheckCircle2, EyeOff, Landmark, Link2Off, Search } from "lucide-react";

import { DashboardPanel } from "@/components/dashboard/panel";
import { CHIP, StatRow } from "@/components/dashboard/stat-tile";
import { useBankMatchingCounts } from "@/lib/data/queries";
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
          value={val(c?.gesamt)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "offen" }}
          icon={Link2Off}
          iconCls={c && c.offen > 0 ? CHIP.warning : CHIP.neutral}
          label={t("home.bank.offen")}
          value={val(c?.offen)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "vorschlag" }}
          icon={Search}
          iconCls={c && c.vorschlag > 0 ? CHIP.brand : CHIP.neutral}
          label={t("home.bank.vorschlag")}
          value={val(c?.vorschlag)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "zugeordnet" }}
          icon={CheckCircle2}
          iconCls={CHIP.success}
          label={t("home.bank.zugeordnet")}
          value={val(c?.zugeordnet)}
        />
        <StatRow
          to="/banktransaktionen"
          search={{ matching: "ignoriert" }}
          icon={EyeOff}
          iconCls={CHIP.neutral}
          label={t("home.bank.ignoriert")}
          value={val(c?.ignoriert)}
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
