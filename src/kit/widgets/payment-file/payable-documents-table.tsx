import { Badge } from "../../ui/badge";
import { Checkbox } from "../../ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { PayableDocumentRow, PaymentFileAdapter } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";
import type { DocumentSelection } from "./use-document-selection";

export interface PayableDocumentsTableProps {
  rows: PayableDocumentRow[];
  selection: DocumentSelection;
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
}

export function PayableDocumentsTable({
  rows,
  selection,
  adapter,
  labels,
}: PayableDocumentsTableProps) {
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selection.selected.has(row.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={(checked) => selection.toggleAll(rows, checked === true)}
              aria-label={labels.prepare.selectAll}
            />
          </TableHead>
          <TableHead>{labels.prepare.colSupplier}</TableHead>
          <TableHead>{labels.prepare.colInvoiceNumber}</TableHead>
          <TableHead>{labels.prepare.colAmount}</TableHead>
          <TableHead>{labels.prepare.colDueDate}</TableHead>
          <TableHead>{labels.prepare.colPaymentAmount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const hasDiscount = row.discountApplied;
          return (
            <TableRow key={row.id}>
              <TableCell>
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={(checked) => selection.toggle(row, checked === true)}
                />
              </TableCell>
              <TableCell>{row.issuer}</TableCell>
              <TableCell>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => adapter.openDocument(row.id)}
                >
                  {row.invoiceNumber ?? labels.prepare.noInvoiceNumber}
                </button>
              </TableCell>
              <TableCell>{adapter.formatMoney(row.amountGross)}</TableCell>
              <TableCell>{row.dueDate ? adapter.formatDate(row.dueDate) : "-"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{adapter.formatMoney(row.amountDueNow)}</span>
                  {hasDiscount && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-800"
                    >
                      {labels.prepare.discountBadge}
                    </Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
