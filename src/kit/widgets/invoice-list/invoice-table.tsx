import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { cn } from "../../lib/class-names";
import type { InvoiceListRow } from "../../adapters/invoice-list";
import type { InvoiceColumn } from "./columns";

export interface InvoiceTableProps {
  rows: InvoiceListRow[];
  columns: InvoiceColumn[];
  emptyText: string;
  onOpen: (id: string) => void;
  minWidth?: string;
  className?: string;
}

export function InvoiceTable({
  rows,
  columns,
  emptyText,
  onOpen,
  minWidth = "min-w-[1100px]",
  className,
}: InvoiceTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden overflow-x-auto rounded-xl border border-border bg-card",
        className,
      )}
    >
      <Table className={minWidth}>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {columns.map((column) => (
              <TableHead key={column.key} className={column.headerClassName}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row.id)}>
              {columns.map((column) => (
                <TableCell key={column.key} className={column.cellClassName}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-12 text-center text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
