import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
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
import { useDisconnectBank, useDisconnectPreview } from "@/data";
import { fehlerText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

/**
 * Detach a whole bank, behind a typed confirmation.
 *
 * WHY TYPED AND NOT JUST CONFIRMED. Nothing is deleted from the database here, but one thing IS
 * irreversible: the BANKSapi access. Getting the bank back means a new webform and a new SCA with
 * the account holder, which cannot be done from this screen or on this person's own initiative. A
 * second click in the same place as the first is not a decision; typing a word is.
 *
 * WHY THE COUNTS ARE FETCHED. "Hides the accounts and their transactions" is a description; "2
 * accounts, 2.084 movements, 47 log entries" is a decision. The preview runs when the dialog opens
 * and is deliberately uncached, so it states what is true now rather than when the page loaded.
 */
export function DisconnectBankDialog({
  connectionId,
  bank,
}: {
  connectionId: string;
  bank: string;
}) {
  const { t } = useTranslation();
  const disconnect = useDisconnectBank();
  const [open, setOpen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const vorschau = useDisconnectPreview(connectionId, open);

  // A fresh dialog every time. Leaving the word typed in would turn the second use into one click,
  // which is the whole thing this control is trying not to be.
  useEffect(() => {
    if (open) setEingabe("");
  }, [open]);

  const wort = t("bankkonten.trennen.wort");
  // Case-sensitive on purpose. The label shows the word in capitals, so typing it in capitals is
  // what was asked for; accepting "remove" would make the caps decorative. Still trimmed, because
  // a trailing space from a paste is not a different answer.
  const passt = eingabe.trim() === wort;
  const p = vorschau.data;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {/* The row this sits on folds the group when clicked, so the press must not do both. */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-danger"
          disabled={disconnect.isPending}
          onClick={(e) => e.stopPropagation()}
        >
          {disconnect.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Unlink className="size-3.5" />
          )}
          {t("bankkonten.trennen.button")}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bankkonten.trennen.titel", { bank })}</AlertDialogTitle>
          <AlertDialogDescription>{t("bankkonten.trennen.text")}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertTriangle className="size-4 shrink-0" />
              {t("bankkonten.trennen.wirdEntfernt")}
            </p>
            {vorschau.isLoading ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("bankkonten.trennen.zaehle")}
              </p>
            ) : vorschau.isError ? (
              // A failed count must not read as "nothing to lose". The action stays available,
              // because refusing to disconnect because a COUNT failed would be the wrong refusal.
              <p className="mt-1.5 text-sm text-danger">
                {t("bankkonten.trennen.zaehlenFehlgeschlagen")}
              </p>
            ) : (
              p && (
                <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
                  <li>{t("bankkonten.trennen.postenZugang")}</li>
                  <li>{t("bankkonten.trennen.postenKonten", { anzahl: p.konten })}</li>
                  <li>{t("bankkonten.trennen.postenUmsaetze", { anzahl: p.umsaetze })}</li>
                  <li>{t("bankkonten.trennen.postenProtokoll", { anzahl: p.protokoll })}</li>
                </ul>
              )
            )}
          </div>

          {/* Only when movements on this bank back an invoice match. They are not destroyed and the
              invoices stay paid, but the movement behind the mark stops being readable until the
              bank is reconnected, which is worth saying rather than leaving to be discovered. */}
          {p && p.umsaetzeZugeordnet > 0 && (
            <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2.5">
              <p className="text-sm font-medium text-warning">
                {t("bankkonten.trennen.zugeordnet", { anzahl: p.umsaetzeZugeordnet })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("bankkonten.trennen.zugeordnetHinweis")}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="trennen-bestaetigung">{t("bankkonten.trennen.tippen", { wort })}</Label>
            <Input
              id="trennen-bestaetigung"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              placeholder={wort}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={disconnect.isPending}>
            {t("bankkonten.trennen.abbrechen")}
          </AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: the action element closes the dialog on click,
              which would dismiss it while the request is still in flight and while the typed word
              is the only thing standing between a stray Enter and a deleted bank access. */}
          <Button
            variant="destructive"
            disabled={!passt || disconnect.isPending}
            onClick={() =>
              disconnect.mutate(
                { connectionId },
                {
                  onSuccess: (res) => {
                    setOpen(false);
                    toast.success(t("bankkonten.trennen.toastOk", { bank }), {
                      description: t("bankkonten.trennen.toastOkHinweis", {
                        konten: res.accountsHidden ?? 0,
                        umsaetze: res.transactionsHidden ?? 0,
                      }),
                    });
                  },
                  onError: (e) =>
                    toast.error(t("bankkonten.trennen.toastFehler", { error: fehlerText(e) })),
                },
              )
            }
          >
            {disconnect.isPending
              ? t("bankkonten.trennen.laeuft")
              : t("bankkonten.trennen.bestaetigen")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
