import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBankAccountPurgePreview, useExcludeBankAccount } from "@/data";
import type { BankAccount } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { fehlerText } from "@/lib/data/format";

/**
 * "Konto entfernen" — the answer to an account the bank delivers but that does not belong in the
 * books (a private account sharing the same online banking, a duplicate left behind by an
 * interrupted webform).
 *
 * Not a plain delete: the bank keeps sending every product the access covers, hourly, so the row
 * stays as the tombstone bank-sync matches against (excluded_at, migration 20260815120000) while
 * its movements are purged. Admin-only server-side; the trigger is hidden for everyone else rather
 * than letting them run into a 403.
 */
export function RemoveBankAccountDialog({ account }: { account: BankAccount }) {
  const { t } = useTranslation();
  const exclude = useExcludeBankAccount();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // Only counted while the dialog is actually open -- a question asked on demand, not a number
  // every row on the table should be paying for.
  const vorschau = useBankAccountPurgePreview(account.id, open);

  function confirm() {
    exclude.mutate(
      { accountId: account.id, reason: reason.trim() || null },
      {
        onSuccess: (res) => {
          // The server returns purgedTransactions, purgedMatches AND purgedFiles; the toast used to
          // name only the first, dropping the two counts that say how much invoice reconciliation
          // and how many attached receipt files were just destroyed -- the expensive half to redo.
          const teile = [
            t("bankkonten.entfernen.toastUmsaetze", { anzahl: res.purgedTransactions }),
          ];
          if (res.purgedMatches > 0) {
            teile.push(t("bankkonten.entfernen.toastZuordnungen", { anzahl: res.purgedMatches }));
          }
          if (res.purgedFiles > 0) {
            teile.push(t("bankkonten.entfernen.toastDateien", { anzahl: res.purgedFiles }));
          }
          toast.success(t("bankkonten.entfernen.toastOk"), {
            description: res.purgedTransactions > 0 ? teile.join(" · ") : undefined,
          });
          setOpen(false);
          setReason("");
        },
        onError: (e) =>
          toast.error(
            t("bankkonten.entfernen.toastFehler", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={t("bankkonten.entfernen.button")}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("bankkonten.entfernen.titel", { konto: account.account_name ?? "—" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("bankkonten.entfernen.beschreibung")}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* What this click actually costs, in numbers, before it happens. */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          {vorschau.isLoading ? (
            <span className="text-muted-foreground">{t("bankkonten.entfernen.zaehle")}</span>
          ) : vorschau.isError ? (
            // A failed count must not read as "nothing to lose".
            <span className="text-muted-foreground">
              {t("bankkonten.entfernen.zaehlenFehlgeschlagen")}
            </span>
          ) : vorschau.data && vorschau.data.transactions > 0 ? (
            <span className="text-foreground">
              {t("bankkonten.entfernen.vorschau", {
                umsaetze: vorschau.data.transactions,
                zuordnungen: vorschau.data.matches,
                dateien: vorschau.data.files,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("bankkonten.entfernen.vorschauLeer")}</span>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bank-account-remove-reason">{t("bankkonten.entfernen.grund")}</Label>
          <Input
            id="bank-account-remove-reason"
            value={reason}
            placeholder={t("bankkonten.entfernen.grundPlatzhalter")}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={exclude.isPending}>
            {t("bankkonten.entfernen.abbrechen")}
          </AlertDialogCancel>
          {/* asChild would let the dialog close on click before the mutation resolves. */}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={exclude.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {exclude.isPending
              ? t("bankkonten.entfernen.laeuft")
              : t("bankkonten.entfernen.bestaetigen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
