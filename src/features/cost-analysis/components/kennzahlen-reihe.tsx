import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";

import { Erklaerung } from "./erklaerung";
import { cn, formatEUR, Skeleton, useTranslation } from "../adapter";

/**
 * Which way is up for a given figure.
 *
 * This exists because a delta is meaningless without it. Costs rising by 6.800 € and a result
 * rising by 6.800 € are the same arithmetic and opposite news, and the reference design this was
 * built from got exactly that wrong: it painted an operating result that had IMPROVED by 6.812 €
 * in red, because it applied cost semantics to every card. Direction is per-figure, so the
 * component cannot make that mistake on one card and not another.
 */
export type Kennzahlrichtung = "hoch_ist_gut" | "hoch_ist_schlecht";

/**
 * The card's tint. It encodes WHICH FIGURE this is, never whether the figure is good news.
 *
 * That split is the whole discipline here. The reference design tinted by identity and also
 * coloured its arrows by judgement, which is how a worsening loss ended up on a green ground under
 * a green arrow. Keeping the two on separate channels means a costs card stays rose even in a month
 * when costs fell, and the green arrow sitting on it is unambiguous: the card says "costs", the
 * arrow says "down, and that is good".
 */
export type Kennzahlton = "umsatz" | "rohertrag" | "kosten" | "ergebnis";

/**
 * Fill only — no outline. A tinted card already has an edge; drawing a border on it too is a second
 * line doing the first line's job, and four of them inside an outer bordered panel was three levels
 * of box for one row of numbers.
 */
const TON: Record<Kennzahlton, { karte: string; betont: string; kachel: string; symbol: string }> =
  {
    umsatz: {
      karte: "bg-emerald-50",
      betont: "bg-emerald-100/70",
      kachel: "bg-emerald-100",
      symbol: "text-emerald-700",
    },
    // Deliberately not a second green. The reference gave revenue and gross profit the same green,
    // so two different figures read as one repeated card.
    rohertrag: {
      karte: "bg-sky-50",
      betont: "bg-sky-100/70",
      kachel: "bg-sky-100",
      symbol: "text-sky-700",
    },
    kosten: {
      karte: "bg-rose-50",
      betont: "bg-rose-100/70",
      kachel: "bg-rose-100",
      symbol: "text-rose-700",
    },
    ergebnis: {
      karte: "bg-violet-50",
      betont: "bg-violet-100/70",
      kachel: "bg-violet-100",
      symbol: "text-violet-700",
    },
  };

export interface Kennzahlfeld {
  key: string;
  label: string;
  /**
   * One plain sentence, printed ON the card. It used to sit behind a dotted-underline popover,
   * which meant a reader had to already suspect they needed it. The figures are the whole point of
   * the screen; what they mean is not an optional extra.
   */
  beschreibung?: string;
  value: number;
  icon?: LucideIcon;
  /**
   * Share of revenue, as a percentage. `null` where it cannot be computed, which is not the same
   * as zero: with no revenue in scope there is no margin, and printing "0 %" or "∞" would both be
   * claims the data does not support.
   */
  marge?: number | null;
  margeLabel?: string;
  /** One sentence on what this card's percentage means, behind an ⓘ next to it. */
  margeErklaerung?: string;
  ton?: Kennzahlton;
  /** Prior-period delta in EUR, plus the period it is measured against. */
  vergleich?: { delta: number; label: string } | null;
  richtung?: Kennzahlrichtung;
  /** The figure the reader is meant to stop at. */
  emphasis?: boolean;
}

/** Is this delta good news? Depends entirely on the figure it belongs to. */
function istVerbesserung(delta: number, richtung: Kennzahlrichtung) {
  return richtung === "hoch_ist_schlecht" ? delta < 0 : delta > 0;
}

function Vergleichszeile({
  vergleich,
  richtung,
}: {
  vergleich: { delta: number; label: string };
  richtung: Kennzahlrichtung;
}) {
  const { t } = useTranslation();
  const { delta, label } = vergleich;

  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Minus className="size-3 shrink-0" />
        {t("auswertungen.summe.vergleichUnveraendert", { label })}
      </span>
    );
  }

  const gut = istVerbesserung(delta, richtung);
  const Pfeil = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    // Colour appears HERE and nowhere else on the card. The reference design tinted the whole card
    // by metric identity (revenue green, costs red) and then coloured the arrow by judgement, so a
    // worsening loss sat on a green ground with a green arrow. One colour system, one meaning.
    <span className={cn("flex items-center gap-1", gut ? "text-emerald-700" : "text-red-700")}>
      <Pfeil className="size-3 shrink-0" />
      <span className="tabular-nums">
        {delta > 0 ? "+" : ""}
        {formatEUR(delta)}
      </span>
      <span className="truncate text-muted-foreground">
        {t("auswertungen.summe.vergleichGegen", { label })}
      </span>
    </span>
  );
}

/**
 * The headline figures, as a row of tinted cards.
 *
 * Every card carries its own one-line meaning. No panel around the row and no outline on the cards:
 * the tint is the card. See `TON` on why, and `Vergleichszeile` on why judgement colour is confined
 * to the delta line.
 */
export function KennzahlenReihe({
  felder,
  keineDaten,
  laden,
  margenHinweis,
}: {
  felder: Kennzahlfeld[];
  /** Nothing in scope. Values render as "—" rather than as a confident 0,00 €. */
  keineDaten?: boolean;
  /**
   * Still fetching. The cards, their icons, names and descriptions are all known before any data
   * arrives, so they render immediately and only the FIGURES wait. Replacing the whole block with
   * one grey rectangle threw the page's structure away and rebuilt it a second later, which reads
   * as a page load rather than as numbers arriving.
   */
  laden?: boolean;
  /** Shown when margins had to be withheld, so "—" is explained rather than just printed. */
  margenHinweis?: { titel: string; text: string } | null;
}) {
  return (
    <section>
      {/* No heading and no "amounts are in EUR" line: the cards name themselves, the period is
          already stated by the chips above, and every figure on the screen carries its € sign. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {felder.map((f) => {
          const Icon = f.icon;
          const ton = f.ton ? TON[f.ton] : null;
          return (
            <div
              key={f.key}
              className={cn(
                "flex flex-col rounded-lg px-4 py-3",
                // The emphasised card steps up a shade rather than gaining an outline, so the one
                // figure the reader should stop at is heavier without introducing a line the other
                // three do not have.
                ton ? (f.emphasis ? ton.betont : ton.karte) : "border border-border bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                {Icon && (
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      ton ? ton.kachel : "bg-muted",
                    )}
                  >
                    <Icon className={cn("size-3.5", ton ? ton.symbol : "text-muted-foreground")} />
                  </span>
                )}
                <span className="text-base font-medium text-foreground">{f.label}</span>
              </div>

              {f.beschreibung && (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.beschreibung}
                </p>
              )}

              {/* Pushes the figure to the bottom, so four cards with descriptions of different
                  lengths still line their numbers up on one baseline. */}
              <div className="mt-3 flex-1" />

              {laden ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <div
                  className={cn(
                    "text-3xl tabular-nums tracking-tight text-foreground",
                    f.emphasis ? "font-semibold" : "font-medium",
                  )}
                >
                  {keineDaten ? "—" : formatEUR(f.value)}
                </div>
              )}

              {/* Always rendered, even when there is nothing to put in it. Revenue carries no
                  margin row, so without a reserved line its figure sat lower than the other three
                  and the four numbers no longer read as one row. */}
              <div className="mt-2.5 min-h-[2.75rem] space-y-1 text-sm">
                {laden ? (
                  <>
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-24" />
                  </>
                ) : (
                  <>
                    {!keineDaten && f.vergleich && (
                      <Vergleichszeile
                        vergleich={f.vergleich}
                        richtung={f.richtung ?? "hoch_ist_gut"}
                      />
                    )}
                    {!keineDaten && f.marge != null && f.margeLabel && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="font-medium tabular-nums text-foreground">
                          {f.marge.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %
                        </span>
                        <span>{f.margeLabel}</span>
                        {/* An ⓘ, not a dotted underline: underlining the percentage would read as
                            part of the figure. */}
                        <Erklaerung
                          als="icon"
                          label={f.margeLabel}
                          erklaerung={f.margeErklaerung}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {margenHinweis && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{margenHinweis.titel}</span>{" "}
            {margenHinweis.text}
          </p>
        </div>
      )}
    </section>
  );
}
