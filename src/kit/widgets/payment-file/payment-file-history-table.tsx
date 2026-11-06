import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { PaymentFileAdapter, PaymentFileRow } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

function statusLabel(status: PaymentFileRow["status"], labels: PaymentFileLabels): string {
  if (status === "draft") return labels.review.statusDraft;
  if (status === "generated") return labels.review.statusGenerated;
  if (status === "downloaded") return labels.review.statusDownloaded;
  return labels.review.statusDiscarded;
}

export interface PaymentFileHistoryTableProps {
  rows: PaymentFileRow[];
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
  onSelect: (fileId: string) => void;
}

export function PaymentFileHistoryTable({
  rows,
  adapter,
  labels,
  onSelect,
}: PaymentFileHistoryTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.history.colFile}</TableHead>
          <TableHead>{labels.history.colDate}</TableHead>
          <TableHead>{labels.history.colCount}</TableHead>
          <TableHead>{labels.history.colTotal}</TableHead>
          <TableHead>{labels.history.colStatus}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className="cursor-pointer" onClick={() => onSelect(row.id)}>
            <TableCell>{row.filename ?? "-"}</TableCell>
            <TableCell>{adapter.formatDate(row.createdAt)}</TableCell>
            <TableCell>{row.itemCount}</TableCell>
            <TableCell>{adapter.formatMoney(row.total)}</TableCell>
            <TableCell>
              <Badge variant="outline">{statusLabel(row.status, labels)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
