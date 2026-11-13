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
  year,
  showApprovedBonuses,
}: {
  rows: AgentCommissionReportRow[];
  year: number;
  showApprovedBonuses: boolean;
}) {
  const { t } = useTranslation();
  const prevYear = year - 1;

  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">{t("commissionDeals.report.empty")}</p>
    );
  }

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>{t("commissionDeals.report.table.agent")}</TableHead>
          <TableHead className="text-right">{t("commissionDeals.report.tiles.closings")}</TableHead>
          <TableHead className="text-right">{t("commissionDeals.report.tiles.volume")}</TableHead>
          <TableHead className="text-right">
            {t("commissionDeals.report.tiles.commission")}
          </TableHead>
          <TableHead className="text-right">{t("commissionDeals.report.tiles.bonuses")}</TableHead>
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
  );
}
