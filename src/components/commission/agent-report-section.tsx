import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeCalendar } from "@/components/data-table/date-range-picker";
import { AgentReportTable } from "@/components/commission/agent-report-table";
import { AgentReportTiles } from "@/components/commission/agent-report-tiles";
import { useAgentCommissionReport, useBonusSettings } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { dateLocale, formatDate } from "@/lib/data/format";

function CutoffDatePicker({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  max: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`${t("commissionDeals.report.cutoff")}: ${formatDate(value)}`}
          className="h-9 w-full justify-start gap-2 font-normal"
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="tabular-nums">{formatDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <DateRangeCalendar
          single
          open={open}
          from={value}
          to={value}
          maxDate={max}
          locale={dateLocale()}
          labels={{
            previousMonth: t("documents.list.filter.monatZurueck"),
            nextMonth: t("documents.list.filter.monatVor"),
          }}
          onApply={(selected) => {
            onChange(selected);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AgentReportSection() {
  const { t } = useTranslation();
  const { can, appUserId } = useAuth();
  const seesAllAgents = can(PERMISSIONS.dealsReportAll);
  const [cutoff, setCutoff] = useState(todayIso);

  const reportQ = useAgentCommissionReport(cutoff);
  const canReadBonusSettings = can(PERMISSIONS.bonusesReview) || can(PERMISSIONS.bonusesSubmit);
  const settingsQ = useBonusSettings(canReadBonusSettings);
  const showApprovedBonuses = settingsQ.data?.broker_bonus_counts_status === "separate";
  const rows = reportQ.data ?? [];
  const year = Number(cutoff.slice(0, 4));

  const grandTotal = rows.reduce(
    (sum, row) => ({
      agent_user_id: "total",
      agent_name: "",
      closings_current: sum.closings_current + row.closings_current,
      closings_previous: sum.closings_previous + row.closings_previous,
      volume_current: sum.volume_current + row.volume_current,
      volume_previous: sum.volume_previous + row.volume_previous,
      commission_current: sum.commission_current + row.commission_current,
      commission_previous: sum.commission_previous + row.commission_previous,
      bonuses_current: sum.bonuses_current + row.bonuses_current,
      bonuses_previous: sum.bonuses_previous + row.bonuses_previous,
      bonuses_approved_current: sum.bonuses_approved_current + row.bonuses_approved_current,
      bonuses_approved_previous: sum.bonuses_approved_previous + row.bonuses_approved_previous,
    }),
    {
      agent_user_id: "total",
      agent_name: "",
      closings_current: 0,
      closings_previous: 0,
      volume_current: 0,
      volume_previous: 0,
      commission_current: 0,
      commission_previous: 0,
      bonuses_current: 0,
      bonuses_previous: 0,
      bonuses_approved_current: 0,
      bonuses_approved_previous: 0,
    },
  );
  const ownRow = rows.find((row) => row.agent_user_id === appUserId) ?? null;

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("commissionDeals.report.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("commissionDeals.report.subtitle")}
          </p>
        </div>
        <div className="w-full space-y-1.5 sm:w-[200px]">
          <Label className="text-xs text-muted-foreground">
            {t("commissionDeals.report.cutoff")}
          </Label>
          <CutoffDatePicker value={cutoff} onChange={setCutoff} max={todayIso()} />
        </div>
      </div>

      {reportQ.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("commissionDeals.report.loading")}</p>
      ) : seesAllAgents ? (
        <div className="mt-4 space-y-6">
          <AgentReportTiles
            row={rows.length > 0 ? grandTotal : null}
            year={year}
            showApprovedBonuses={showApprovedBonuses}
          />
          <AgentReportTable rows={rows} year={year} showApprovedBonuses={showApprovedBonuses} />
        </div>
      ) : (
        <div className="mt-4">
          <AgentReportTiles row={ownRow} year={year} showApprovedBonuses={showApprovedBonuses} />
        </div>
      )}
    </section>
  );
}
