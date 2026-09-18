import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useSetBankAccountActive } from "@/lib/data/queries";
import type { BankAccount } from "@/lib/data/types";
import { fehlerText } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

/**
 * On/off for a single bank account.
 *
 * WHY A SWITCH AND NOT A DELETE. A provider-fed account cannot be deleted. BANKSapi documents only
 * two DELETEs -- `/customer/v2/bankzugaenge` (every access) and
 * `/customer/v2/bankzugaenge/{access-id}` (one bank) -- and nothing per account, so the account
 * cannot be detached at the source and the next hourly sync upserts it straight back. A button
 * whose effect undoes itself within the hour is worse than no button.
 *
 * Off means: the row stays, every movement already imported stays, and bank-sync stops fetching new
 * ones (migration 20260902160000; the skip is in the per-account transaction loop, and the run logs
 * `accounts_inactive_skipped` so a missing account is never silently missing). Reversible.
 *
 * Distinct from "Konto entfernen" beside it, which is the violent option: that purges the movements
 * and their invoice matches and receipt files, and keeps the product off the feed for good.
 *
 * A Switch rather than an icon button because it shows STATE AT REST. An icon can only ever show
 * the action, so an account that is off would look identical to one that is on. This codebase
 * already expresses active/inactive as a Switch on exclusion rules and assignment rules, so a third
 * idiom for the same idea would be the odd one out.
 */
export function AccountActiveSwitch({ account }: { account: BankAccount }) {
  const { t } = useTranslation();
  const setActive = useSetBankAccountActive();
  // Only an explicit false counts as off. A null or undefined on an older row means "never set",
  // which is on.
  const aktiv = account.is_active !== false;

  return (
    <Switch
      checked={aktiv}
      disabled={setActive.isPending}
      aria-label={t("bankkonten.aktiv.label")}
      title={aktiv ? t("bankkonten.aktiv.ausschalten") : t("bankkonten.aktiv.einschalten")}
      onCheckedChange={(v) =>
        setActive.mutate(
          { accountId: account.id, isActive: v },
          {
            onSuccess: () =>
              toast.success(
                v ? t("bankkonten.aktiv.toastAn") : t("bankkonten.aktiv.toastAus"),
                v ? undefined : { description: t("bankkonten.aktiv.toastAusHinweis") },
              ),
            onError: (e) =>
              toast.error(t("bankkonten.aktiv.toastFehler", { error: fehlerText(e) })),
          },
        )
      }
    />
  );
}
