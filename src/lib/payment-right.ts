import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { PERMISSIONS } from "@/config/permissions";

/**
 * May the signed-in account move an invoice's payment state?
 *
 * Confirming a bank match is the same money statement as "Bezahlt (manuell)": once the confirmed
 * matches cover the invoice, migration 0024's trigger stamps paid_at and the invoice is settled.
 * Unlinking one takes that payment back. Both therefore ask the permission the payment controls on
 * the invoice ask -- before this existed, the bank screens were the way around them.
 *
 * The SIGNED-IN account, not the "Handelnd als" identity: the database checks the session on every
 * write (trg_enforce_match_payment_permission), so a screen that asked anything else would offer a
 * button the write then refuses.
 */
export function usePaymentRight(): { mayPay: boolean; reason: string | undefined } {
  const { can } = useAuth();
  const { t } = useTranslation();
  const mayPay = can(PERMISSIONS.paymentsWrite);
  return { mayPay, reason: mayPay ? undefined : t("bank.matches.keineZahlBerechtigung") };
}
