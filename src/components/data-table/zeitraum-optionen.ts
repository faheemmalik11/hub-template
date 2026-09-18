import { useMemo } from "react";

import {
  isOverviewPeriod,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  overviewPeriodRange,
} from "@/components/dashboard/periods";
import type { PeriodRange } from "@/components/dashboard/periods";
import { zeitraumToRange } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

/**
 * The one period list every ZeitraumPicker offers.
 *
 * Before this, each screen built its own: the Kostenanalyse offered nine fixed presets, while the
 * company, supplier and receipts screens derived a month row, a quarter row and a year row from
 * whatever their own query had returned. So the same control had a different vocabulary on almost
 * every screen, the lists grew without bound as data accumulated, and two screens could disagree
 * about what "this year" even was.
 *
 * A derived list also can't be trusted where the rows are paged server-side, which is why the bank
 * transactions screen had to offer only two options. Calendar presets are computed from today's
 * date, so they are correct regardless of what has been fetched.
 */
export const ZEITRAUM_ALLE = "alle";
/**
 * The custom-range option's value.
 *
 * `ZeitraumPicker` defaults `customValue` to "individuell"; this vocabulary is the Overview's, so
 * every call site passes this explicitly. Without it the option selects like any other preset and
 * the calendar never opens.
 */
export const ZEITRAUM_INDIVIDUELL = "benutzerdefiniert";
export const ZEITRAUM_DEFAULT = OVERVIEW_PERIOD_DEFAULT;

/**
 * The options in display order: entire period, custom range, then the presets.
 *
 * `alleValue` overrides what "entire period" is called. Screens that keep their period in the URL
 * already have a sentinel for "no filter on this axis" -- the receipts list uses one `__alle` for
 * its period, company, property and status filters alike, and its reset button, its active-filter
 * check and its chip all test against it. Renaming the period's version of that value would make
 * the default read as an active filter on every one of them.
 */
export function useZeitraumOptionen(alleValue: string = ZEITRAUM_ALLE) {
  const { t } = useTranslation();
  return useMemo(
    () =>
      OVERVIEW_PERIODS.map((p) => ({
        value: p === ZEITRAUM_ALLE ? alleValue : p,
        label: t(`home.zeitraumKurz.${p}`),
      })),
    [t, alleValue],
  );
}

/**
 * The date range a picker value stands for.
 *
 * Legacy values are still resolved on purpose. The screens that used to derive their own list put
 * the choice in the URL, so bookmarked links carrying `monat-2025-03`, `quartal-2025-1`, `jahr-2024`
 * or `individuell` exist in the wild; falling through to `zeitraumToRange` means such a link keeps
 * meaning what it meant instead of silently widening to the entire period.
 */
export function zeitraumBereich(zeitraum: string, von: string, bis: string): PeriodRange {
  if (zeitraum === ZEITRAUM_INDIVIDUELL) return { von: von || null, bis: bis || null };
  if (isOverviewPeriod(zeitraum)) return overviewPeriodRange(zeitraum, new Date(), { von, bis });
  return zeitraumToRange(zeitraum, von, bis);
}
