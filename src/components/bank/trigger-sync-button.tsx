import { RefreshCw } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useTriggerSync } from "@/lib/data/queries";
import { fehlerText } from "@/lib/data/format";
import type { BankConnection } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";

/**
 * "Jetzt synchronisieren", confirmed, and saying what it is about to do.
 *
 * This runs bank-sync for EVERY connection, and what that means depends on the mode the
 * connections are in: against a live consent it is a real call to the bank, and in mock mode it
 * writes fabricated accounts and transactions into the same tables the real ones live in. The
 * button used to give no indication of either, on a screen where the rows beside it distinguish
 * Live from Sandbox per connection.
 *
 * The mode is read off the connections rather than guessed, so the wording cannot disagree with
 * what the table says.
 */
export function TriggerSyncButton({
  connections,
  variant = "outline",
  size = "sm",
  className,
}: {
  connections: BankConnection[];
  /** Beside the health strip it is one control among several; on Banktransaktionen it is the
   *  page's main action. Same dialog, same wording, different emphasis. */
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}) {
  const { t } = useTranslation();
  const triggerSync = useTriggerSync();

  // With no connections at all there is no live consent to contact, so the mock wording applies.
  const nurSandbox = connections.length === 0 || connections.every((c) => c.is_sandbox);

  function syncNow() {
    triggerSync.mutate(undefined, {
      onSuccess: (res) =>
        toast.success(
          t("bankverbindungen.toast.syncDone", {
            neu: res.transactions_new ?? 0,
            vorschlaege: res.matches_candidate ?? 0,
          }),
        ),
      onError: (e) => toast.error(t("bankverbindungen.toast.syncFailed", { error: fehlerText(e) })),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={triggerSync.isPending}
          className={cn("gap-2", className)}
        >
          <RefreshCw className={cn("size-4", triggerSync.isPending && "animate-spin")} />
          {triggerSync.isPending ? t("bankverbindungen.syncing") : t("bankverbindungen.sync")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bankverbindungen.syncBestaetigen.titel")}</AlertDialogTitle>
          <AlertDialogDescription>
            {nurSandbox
              ? t("bankverbindungen.syncBestaetigen.textSandbox", { anzahl: connections.length })
              : t("bankverbindungen.syncBestaetigen.textLive", { anzahl: connections.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={triggerSync.isPending}>
            {t("bankverbindungen.syncBestaetigen.abbrechen")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              syncNow();
            }}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending
              ? t("bankverbindungen.syncing")
              : t("bankverbindungen.syncBestaetigen.starten")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
