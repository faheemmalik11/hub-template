import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentCommissionReportRow } from "@/data";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

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

export function AgentReportTable({
  rows,
  total,
  year,
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
              {rows.map((row) => (
                <TableRow key={row.agent_user_id}>
                  <TableCell className="font-medium text-foreground">{row.agent_name}</TableCell>
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
              ))}
            </TableBody>
          </Table>
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
        </>
      )}
    </div>
  );
}
