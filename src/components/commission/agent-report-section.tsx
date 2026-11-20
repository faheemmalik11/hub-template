import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeCalendar } from "@/components/data-table/date-range-picker";
import { AgentReportTable } from "@/components/commission/agent-report-table";
import { AgentReportTiles } from "@/components/commission/agent-report-tiles";
import { useAgentCommissionReport, useBonusSettings } from "@/data";
import type { AgentCommissionReportRow, AgentCommissionReportSort } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { useAuth } from "@/lib/auth";
import { CardsSkeleton, TableSkeleton } from "@/components/documents/query-states";
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
      <PopoverContent align="end" className="w-auto p-3">
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AgentCommissionReportSort>("closings");
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const pageQ = useAgentCommissionReport({ cutoff, search, sort, ascending, page, pageSize });
  const canReadBonusSettings = can(PERMISSIONS.bonusesReview) || can(PERMISSIONS.bonusesSubmit);
  const settingsQ = useBonusSettings(canReadBonusSettings);
  const showApprovedBonuses = settingsQ.data?.broker_bonus_counts_status === "separate";
  const pageRows = pageQ.data?.rows ?? [];
  const year = Number(cutoff.slice(0, 4));

  const changeCutoff = (value: string) => {
    setCutoff(value);
    setPage(1);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const sortBy = (column: string) => {
    const key = column as AgentCommissionReportSort;
    if (key === sort) {
      setAscending(!ascending);
    } else {
      setSort(key);
      setAscending(true);
    }
    setPage(1);
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const firstRow = pageRows[0];
  const grandTotal: AgentCommissionReportRow | null = firstRow
    ? {
        ...firstRow,
        agent_user_id: "total",
        agent_name: "",
        closings_current: firstRow.all_closings_current,
        closings_previous: firstRow.all_closings_previous,
        volume_current: firstRow.all_volume_current,
        volume_previous: firstRow.all_volume_previous,
        commission_current: firstRow.all_commission_current,
        commission_previous: firstRow.all_commission_previous,
        bonuses_current: firstRow.all_bonuses_current,
        bonuses_previous: firstRow.all_bonuses_previous,
        bonuses_approved_current: firstRow.all_bonuses_approved_current,
        bonuses_approved_previous: firstRow.all_bonuses_approved_previous,
      }
    : null;
  const ownRow = pageRows.find((row) => row.agent_user_id === appUserId) ?? null;

  return (
    <section>
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
          <CutoffDatePicker value={cutoff} onChange={changeCutoff} max={todayIso()} />
        </div>
      </div>

      {pageQ.isLoading ? (
        <div className="mt-4 space-y-6">
          <CardsSkeleton count={showApprovedBonuses ? 5 : 4} />
          {seesAllAgents && <TableSkeleton rows={4} cols={showApprovedBonuses ? 6 : 5} />}
        </div>
      ) : seesAllAgents ? (
        <div className="mt-4 space-y-6">
          <AgentReportTiles
            row={grandTotal}
            cutoff={cutoff}
            showApprovedBonuses={showApprovedBonuses}
          />
          <AgentReportTable
            rows={pageRows}
            total={pageQ.data?.total ?? 0}
            year={year}
            showApprovedBonuses={showApprovedBonuses}
            search={search}
            onSearch={changeSearch}
            sort={sort}
            ascending={ascending}
            onSort={sortBy}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={changePageSize}
          />
        </div>
      ) : (
        <div className="mt-4">
          <AgentReportTiles
            row={ownRow}
            cutoff={cutoff}
            showApprovedBonuses={showApprovedBonuses}
          />
        </div>
      )}
    </section>
  );
}
