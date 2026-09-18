import { Lock } from "lucide-react";

import { usePaymentRight } from "@/lib/payment-right";
import { cn } from "@/lib/utils";

/**
 * Says out loud why the match buttons on this screen are dead.
 *
 * A disabled button explains nothing, and a title tooltip on one does not reliably open at all --
 * so without this, somebody who may not book payments sees a screen of greyed controls and reads
 * it as the app being broken. It renders nothing for anybody who may pay.
 */
export function PaymentRightNotice({ className }: { className?: string }) {
  const { mayPay, reason } = usePaymentRight();
  if (mayPay) return null;

  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{reason}</span>
    </p>
  );
}
