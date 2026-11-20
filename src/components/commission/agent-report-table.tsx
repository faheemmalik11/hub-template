import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAgentReportDeals } from "@/data";
import type { AgentCommissionReportRow } from "@/data";
import { formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DEALS_PAGE_SIZE = 10;

function Cell({ current, previous, year }: { current: string; previous: string; year: number }) {
  return (
    <TableCell className="text-right tabular-nums">
      <div className="font-medium text-foreground">{current}</div>
      <div className="text-xs text-muted-foreground">
        {year}: {previous}
      </div>
    </TableCell>
  );
}

function AgentDeals({
  agentUserId,
  cutoff,
  colSpan,
  open,
}: {
  agentUserId: string;
  cutoff: string;
  colSpan: number;
  open: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEALS_PAGE_SIZE);
  const dealsQ = useAgentReportDeals({ agentUserId, cutoff, page, pageSize }, open);

  if (!open) return null;

  const rows = dealsQ.data?.rows ?? [];
  const total = dealsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 p-4">
        {dealsQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("commissionDeals.report.deals.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("commissionDeals.report.deals.property")}</TableHead>
                    <TableHead>{t("commissionDeals.report.deals.notarisedOn")}</TableHead>
                    <TableHead>{t("commissionDeals.report.deals.status")}</TableHead>
                    <TableHead className="text-right">
                      {t("commissionDeals.report.deals.commission")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((deal) => (
                    <TableRow key={deal.deal_id}>
                      <TableCell>
                        <Link
                          to="/commission-deals/$id"
                          params={{ id: deal.deal_id }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {deal.property_label ?? t("commissionDeals.report.deals.noProperty")}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(deal.notarised_on)}
                      </TableCell>
                      <TableCell>{t(`commissionDeals.status.${deal.status}`)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatEUR(deal.commission_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {total > pageSize && (
              <TablePagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                total={total}
                from={from}
                to={to}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AgentReportTable({
  rows,
  total,
  year,
  cutoff,
  showApprovedBonuses,
  search,
  onSearch,
  sort,
  ascending,
  onSort,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  rows: AgentCommissionReportRow[];
  total: number;
  year: number;
  cutoff: string;
  showApprovedBonuses: boolean;
  search: string;
  onSearch: (value: string) => void;
  sort: string;
  ascending: boolean;
  onSort: (column: string) => void;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const { t } = useTranslation();
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const prevYear = year - 1;
  const dir = ascending ? "asc" : "desc";
  const searching = search.trim().length > 0;

  if (total === 0 && !searching) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">{t("commissionDeals.report.empty")}</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const columns = showApprovedBonuses ? 6 : 5;

  return (
    <div className="mt-4 space-y-3">
      <Input
        className="max-w-xs"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={t("commissionDeals.report.table.search")}
        aria-label={t("commissionDeals.report.table.search")}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("commissionDeals.report.table.noMatch")}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableColumnHeader column="agent" sort={sort} dir={dir} onSort={onSort}>
                    {t("commissionDeals.report.table.agent")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="closings"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    align="right"
                  >
                    {t("commissionDeals.report.tiles.closings")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="volume"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    align="right"
                  >
                    {t("commissionDeals.report.tiles.volume")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="commission"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    align="right"
                  >
                    {t("commissionDeals.report.tiles.commission")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="bonuses"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    align="right"
                  >
                    {t("commissionDeals.report.tiles.bonuses")}
                  </SortableColumnHeader>
                  {showApprovedBonuses && (
                    <TableHead className="text-right">
                      {t("commissionDeals.report.tiles.bonusesApproved")}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const open = expandedAgentId === row.agent_user_id;
                  const toggle = () => setExpandedAgentId(open ? null : row.agent_user_id);
                  return (
                    <Fragment key={row.agent_user_id}>
                      <TableRow className="cursor-pointer" onClick={toggle}>
                        <TableCell className="font-medium text-foreground">
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={t("commissionDeals.report.deals.toggle", {
                                name: row.agent_name,
                              })}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggle();
                              }}
                              className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChevronRight
                                aria-hidden
                                className={cn(
                                  "size-4 shrink-0 text-muted-foreground transition-transform",
                                  open && "rotate-90",
                                )}
                              />
                            </button>
                            {row.agent_name}
                          </span>
                        </TableCell>
                        <Cell
                          current={String(row.closings_current)}
                          previous={String(row.closings_previous)}
                          year={prevYear}
                        />
                        <Cell
                          current={formatEUR(row.volume_current)}
                          previous={formatEUR(row.volume_previous)}
                          year={prevYear}
                        />
                        <Cell
                          current={formatEUR(row.commission_current)}
                          previous={formatEUR(row.commission_previous)}
                          year={prevYear}
                        />
                        <Cell
                          current={formatEUR(row.bonuses_current)}
                          previous={formatEUR(row.bonuses_previous)}
                          year={prevYear}
                        />
                        {showApprovedBonuses && (
                          <Cell
                            current={formatEUR(row.bonuses_approved_current)}
                            previous={formatEUR(row.bonuses_approved_previous)}
                            year={prevYear}
                          />
                        )}
                      </TableRow>
                      <AgentDeals
                        agentUserId={row.agent_user_id}
                        cutoff={cutoff}
                        colSpan={columns}
                        open={open}
                      />
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {total > pageSize && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={total}
              from={from}
              to={to}
              onPage={onPage}
              onPageSize={onPageSize}
            />
          )}
        </>
      )}
    </div>
  );
}
