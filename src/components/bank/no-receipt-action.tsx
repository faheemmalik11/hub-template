// Manual "no receipt expected" / "receipt expected after all" action for one bank transaction.
//
// WHY: the whitelist rules catch the recurring cases, but the briefing requires that receipt-less
// transactions are hideable at all — "otherwise the real missing receipt gets lost in the list"
// (Screen 10). This is the per-row escape hatch for whatever no rule covers.
//
// Writing goes through the security-definer RPCs from migration 0018, never a direct UPDATE: the
// client only holds SELECT on the Hub-owned bank_transactions, and the RPC additionally refuses to
// touch a reconciled payment. A manual hide leaves whitelist_rule_id NULL, which is what marks it as a
// human decision — rules never overwrite or release those.
import { EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClearNoReceipt, useSetNoReceipt } from "@/lib/data/queries";
import { OPOS_CATEGORIES } from "@/lib/data/opos";
import { useTranslation } from "@/lib/i18n";
import type { BankTransaction, OposCategory } from "@/lib/data/types";
import { fehlerText } from "@/lib/data/format";
import { cn } from "@/lib/utils";

export function NoReceiptAction({
  txn,
  variant = "icon",
  className,
}: {
  txn: BankTransaction;
  variant?: "icon" | "button";
  className?: string;
}) {
  const { t } = useTranslation();
  const set = useSetNoReceipt();
  const clear = useClearNoReceipt();
  const hidden = txn.matching_status === "ignoriert";

  // A reconciled transaction has its receipt — nothing to hide, and the RPC would refuse anyway.
  if (txn.matching_status === "zugeordnet") return null;

  function hide(reason: OposCategory) {
    set.mutate(
      { transactionId: txn.id, reason },
      {
        onSuccess: () => toast.success(t("noReceipt.toast.versteckt")),
        onError: (e) =>
          toast.error(
            t("noReceipt.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  if (hidden) {
    return (
      <Button
        variant={variant === "icon" ? "ghost" : "outline"}
        size={variant === "icon" ? "icon" : "default"}
        className={cn(variant === "button" && "gap-2", className)}
        disabled={clear.isPending}
        aria-label={t("noReceipt.action.wiederAufnehmen")}
        onClick={(e) => {
          e.stopPropagation();
          clear.mutate(txn.id, {
            onSuccess: () => toast.success(t("noReceipt.toast.wiederAufgenommen")),
            onError: (err) =>
              toast.error(
                t("noReceipt.toast.fehlgeschlagen", {
                  error: fehlerText(err),
                }),
              ),
          });
        }}
      >
        <Eye className="size-4" />
        {variant === "button" && t("noReceipt.action.wiederAufnehmen")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          variant={variant === "icon" ? "ghost" : "outline"}
          size={variant === "icon" ? "icon" : "default"}
          className={cn(variant === "button" && "gap-2", className)}
          disabled={set.isPending}
          aria-label={t("noReceipt.action.keinBeleg")}
        >
          <EyeOff className="size-4" />
          {variant === "button" && t("noReceipt.action.keinBeleg")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>{t("noReceipt.action.grundWaehlen")}</DropdownMenuLabel>
        {OPOS_CATEGORIES.map((c) => (
          <DropdownMenuItem key={c} onClick={() => hide(c)}>
            {t(`oposWhitelist.category.${c}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
