import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { BRAND, pageTitle } from "@/lib/brand";
import { overviewPeriodRange } from "@/lib/data/format";
import { DashboardAlertStrip } from "@/components/home/dashboard-alert-strip";
import { DashboardPanel } from "@/components/dashboard/panel";
import { MoneyCards } from "@/components/home/money-cards";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { BankCard } from "@/components/home/bank-card";
import { OpenItemsCard } from "@/components/home/open-items-card";
import { PipelineStages } from "@/components/home/pipeline-stages";
import { ProcessingCard } from "@/components/home/processing-card";
import { CompanyVolume, TopSuppliers } from "@/components/home/volume-lists";
import { VolumeChart } from "@/components/home/volume-chart";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: pageTitle("Übersicht") }, { name: "description", content: BRAND.description }],
  }),
  component: Index,
});

function Index() {
  const { t } = useTranslation();
  // Every section owns its period and remembers it across reloads (see useStoredPeriod). This one
  // belongs to the trend chart; the cards, the stages and the ranked panels each carry their own.
  const [zeitraum, setZeitraum] = useStoredPeriod("chart");
  const range = useMemo(
    () =>
      overviewPeriodRange(zeitraum.period, new Date(), { von: zeitraum.von, bis: zeitraum.bis }),
    [zeitraum],
  );

  return (
    <div>
      {/* Setup checklist while it's incomplete, general alerts once it's done. Never both.
          Pipeline errors ride along as the "fehler" item, so the old red banner is retired. */}
      <DashboardAlertStrip />

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2" data-tour="overview-money-cards">
          <MoneyCards />
        </section>

        <div data-tour="overview-trend-chart" className="min-w-0">
          <DashboardPanel
            title={t("home.chart.title")}
            headerRight={<PeriodPicker value={zeitraum} onChange={setZeitraum} />}
            className="overflow-hidden"
          >
            <div className="mt-2">
              <VolumeChart von={range.von} bis={range.bis} />
            </div>
          </DashboardPanel>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2" data-tour="overview-stages">
          <PipelineStages />
        </div>
        <div data-tour="overview-top-suppliers" className="min-w-0">
          <TopSuppliers />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>div>*]:h-full">
        <div data-tour="overview-processing">
          <ProcessingCard />
        </div>
        <div data-tour="overview-company-volume">
          <CompanyVolume />
        </div>
        <div data-tour="overview-open-items">
          <OpenItemsCard />
        </div>
        <div data-tour="overview-bank">
          <BankCard />
        </div>
      </div>
    </div>
  );
}
