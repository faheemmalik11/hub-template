import { BWA_SKELETON, Popover, PopoverContent, PopoverTrigger, useTranslation } from "../adapter";

/** The two buckets that are not P&L lines but do appear under the report. */
const EXTRA_KEYS = ["unassigned", "not_pnl"] as const;

/**
 * What every line of the report means, in one place.
 *
 * The rows themselves are plain text on purpose: an explanation affordance on each of them turned
 * the report into a list of links, which is what the redesign set out to remove. But the DATEV
 * wording still has to be decodable by somebody who does not read a BWA for a living, so the whole
 * glossary sits behind one link in the section heading instead of twenty-six dotted underlines.
 *
 * Built from BWA_SKELETON, so it lists exactly the lines the report can show, in the order the
 * report shows them, and cannot drift out of step with it.
 */
export function ZeilenGlossar() {
  const { t } = useTranslation();
  const keys = [...BWA_SKELETON.map((r) => r.key), ...EXTRA_KEYS];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("auswertungen.glossar.oeffnen")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-[min(32rem,90vw)] overflow-y-auto p-4"
      >
        <h3 className="text-base font-semibold text-foreground">
          {t("auswertungen.glossar.titel")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("auswertungen.glossar.untertitel")}</p>
        <dl className="mt-3 space-y-2.5">
          {keys.map((k) => {
            const erklaerung = t(`auswertungen.zeileHinweis.${k}`, { defaultValue: "" });
            if (!erklaerung) return null;
            return (
              <div key={k}>
                <dt className="text-sm font-medium text-foreground">
                  {t(`auswertungen.zeile.${k}`)}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{erklaerung}</dd>
              </div>
            );
          })}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
