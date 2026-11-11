import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { PaymentFileAdapter, PendingPaymentRow } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";
import { MarkPaidButton } from "./review-table";

export interface PendingPaymentsTableProps {
  rows: PendingPaymentRow[];
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
}

export function PendingPaymentsTable({ rows, adapter, labels }: PendingPaymentsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.track.colRecipient}</TableHead>
          <TableHead>{labels.track.colIban}</TableHead>
          <TableHead>{labels.track.colAmount}</TableHead>
          <TableHead>{labels.track.colFile}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.documentId}>
            <TableCell>
              <button
                type="button"
                className="text-primary underline"
                onClick={() => adapter.openDocument(row.documentId)}
              >
                {row.recipientName}
              </button>
            </TableCell>
            <TableCell>{row.iban}</TableCell>
            <TableCell>{adapter.formatMoney(row.amount)}</TableCell>
            <TableCell>{row.fileName}</TableCell>
            <TableCell>
              <MarkPaidButton
                labels={labels}
                onConfirm={() => void adapter.confirmPaid(row.documentId)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
