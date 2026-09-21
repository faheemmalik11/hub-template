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
import { useTriggerSync } from "@/data";
import { errorText } from "@/lib/data/format";
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
  const onlySandbox = connections.length === 0 || connections.every((c) => c.is_sandbox);

  function syncNow() {
    triggerSync.mutate(undefined, {
      onSuccess: (res) =>
        toast.success(
          t("bankConnections.toast.syncDone", {
            added: res.transactions_new ?? 0,
            suggestions: res.matches_candidate ?? 0,
          }),
        ),
      onError: (e) => toast.error(t("bankConnections.toast.syncFailed", { error: errorText(e) })),
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
          {triggerSync.isPending ? t("bankConnections.syncing") : t("bankConnections.sync")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bankConnections.syncBestaetigen.titel")}</AlertDialogTitle>
          <AlertDialogDescription>
            {onlySandbox
              ? t("bankConnections.syncBestaetigen.textSandbox", { count: connections.length })
              : t("bankConnections.syncBestaetigen.textLive", { count: connections.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={triggerSync.isPending}>
            {t("bankConnections.syncBestaetigen.abbrechen")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              syncNow();
            }}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending
              ? t("bankConnections.syncing")
              : t("bankConnections.syncBestaetigen.starten")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
