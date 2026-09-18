import {
  PeriodPicker as DashboardPeriodPicker,
  type PeriodValue,
} from "@/components/dashboard/period-picker";
import type { OverviewPeriod } from "@/components/dashboard/periods";
import { dateLocale, formatDayShort } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export { useStoredPeriod } from "@/components/dashboard/period-picker";
export type { PeriodValue };

/** The dashboard core's picker wired to THIS app's translations and locale. Sections import from
 *  here so the core stays free of app i18n. */
export function PeriodPicker({
  value,
  onChange,
  className,
  contentClassName,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
  contentClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <DashboardPeriodPicker
      value={value}
      onChange={onChange}
      className={className}
      contentClassName={contentClassName}
      labelFor={(p: OverviewPeriod) => t(`home.zeitraumKurz.${p}`)}
      formatDay={formatDayShort}
      backLabel={t("home.zeitraumAktion.zurueck")}
      resetLabel={t("home.zeitraumAktion.reset")}
      calendarLocale={dateLocale()}
      rangeLabels={{
        placeholder: t("belege.list.filter.zeitraumWaehlen"),
        reset: t("belege.list.filter.zeitraumZuruecksetzen"),
        apply: t("belege.list.filter.zeitraumAnwenden"),
        previousMonth: t("belege.list.filter.monatZurueck"),
        nextMonth: t("belege.list.filter.monatVor"),
        pickSecond: t("belege.list.filter.zweitesDatum"),
      }}
    />
  );
}
