import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, cn, useTranslation } from "../adapter";
import type { BwaAmountBasis } from "../adapter";

/**
 * Net or gross, and what that actually means.
 *
 * The toggle itself is unchanged in behaviour; what it was missing was any way to find out what it
 * does. "Net | Gross" with no label sat next to the period picker looking like a display preference,
 * when it silently rewrites every figure on the screen — net books an invoice at its net amount plus
 * whatever input tax cannot be reclaimed, gross books it exactly as billed. That is the difference
 * between two very different readings of the same month, and it was unexplained.
 *
 * So: a group label saying what the switch applies to, and one ⓘ defining both options side by side.
 * Two separate per-option popovers were the alternative and are worse — the reader wants the
 * comparison, not two halves of it fetched one at a time.
 *
 * A Popover, not a Tooltip, for the reason given in `erklaerung.tsx`: Radix tooltips never open on
 * tap, which would put this out of reach on a phone.
 */
export function BasisUmschalter({
  basis,
  onChange,
  className,
}: {
  basis: BwaAmountBasis;
  onChange: (basis: BwaAmountBasis) => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground">{t("auswertungen.basis.gruppe")}</span>

      <div
        role="radiogroup"
        aria-label={t("auswertungen.basis.label")}
        className="inline-flex h-9 shrink-0 items-center rounded-md border border-border p-0.5"
      >
        {(["net", "gross"] as const).map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={basis === b}
            onClick={() => onChange(b)}
            className={cn(
              "cursor-pointer rounded px-2.5 py-1 text-sm transition-colors",
              basis === b
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`auswertungen.basis.${b}`)}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("auswertungen.basis.erklaerungTitel")}
            className="inline-flex cursor-pointer items-center text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Info className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(24rem,90vw)] p-3">
          <p className="text-sm font-medium text-foreground">
            {t("auswertungen.basis.erklaerungTitel")}
          </p>
          <dl className="mt-2 space-y-2">
            {(["net", "gross"] as const).map((b) => (
              <div key={b}>
                <dt className="text-sm font-medium text-foreground">
                  {t(`auswertungen.basis.${b}`)}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  {t(
                    b === "net"
                      ? "auswertungen.basis.erklaerungNetto"
                      : "auswertungen.basis.erklaerungBrutto",
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  );
}
