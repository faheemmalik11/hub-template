import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import type {
  PaymentFileAdapter,
  PaymentFileItemRow,
  PaymentFileRow,
} from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

function statusLabel(status: PaymentFileRow["status"], labels: PaymentFileLabels): string {
  if (status === "draft") return labels.review.statusDraft;
  if (status === "generated") return labels.review.statusGenerated;
  if (status === "downloaded") return labels.review.statusDownloaded;
  return labels.review.statusDiscarded;
}

export interface ReviewTableProps {
  file: PaymentFileRow;
  items: PaymentFileItemRow[];
  adapter: PaymentFileAdapter;
  labels: PaymentFileLabels;
  onDownload: () => void;
  onDiscard: () => void;
  downloading: boolean;
}

export function ReviewTable({
  file,
  items,
  adapter,
  labels,
  onDownload,
  onDiscard,
  downloading,
}: ReviewTableProps) {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labels.review.colRecipient}</TableHead>
            <TableHead>{labels.review.colIban}</TableHead>
            <TableHead>{labels.review.colAmount}</TableHead>
            <TableHead>{labels.review.colStatus}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => adapter.openDocument(item.documentId)}
                >
                  {item.recipientName}
                </button>
              </TableCell>
              <TableCell>{item.iban}</TableCell>
              <TableCell>{adapter.formatMoney(item.amount)}</TableCell>
              <TableCell>
                {item.skippedReason ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
                    {labels.review.skippedReason(item.skippedReason)}
                  </Badge>
                ) : (
                  <Badge variant="outline">{statusLabel(file.status, labels)}</Badge>
                )}
              </TableCell>
              <TableCell>
                {!item.skippedReason && file.status === "downloaded" && (
                  <MarkPaidButton
                    labels={labels}
                    onConfirm={() => void adapter.confirmPaid(item.documentId)}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {file.status === "discarded" ? (
        <p className="text-sm text-muted-foreground">{labels.review.discardedNotice}</p>
      ) : (
        <div className="flex gap-2">
          <Button disabled={downloading} onClick={onDownload}>
            {labels.review.downloadFile}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">{labels.review.discard}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.review.discardConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{labels.review.discardConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.review.discardConfirmCancel}</AlertDialogCancel>
                <AlertDialogAction onClick={onDiscard}>
                  {labels.review.discardConfirmConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

export function MarkPaidButton({
  labels,
  onConfirm,
}: {
  labels: PaymentFileLabels;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          {labels.markPaid}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.markPaidConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{labels.markPaidConfirmBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.markPaidConfirmCancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{labels.markPaidConfirmConfirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
