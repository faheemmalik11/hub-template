import {
  MoneyCardsRow,
  englishPeriodLabels,
  overviewPeriodRange,
  readStoredPeriod,
  writeStoredPeriod,
  type MoneyCardSpec,
  type PeriodLabels,
  type PeriodValue,
} from "../../components/dashboard";
import { useState, useMemo } from "react";
import type { MoneyFigure, OverviewAdapter, PeriodRange } from "../../adapters/overview";
import { useTourPlaceholderData } from "../../components/tour";

export interface MoneyCardsWidgetProps {
  adapter: OverviewAdapter;
  sampleAdapter?: OverviewAdapter;
  cards: MoneyCardSpec[];
  periodLabels?: PeriodLabels;
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: {} as Record<string, MoneyFigure>, loading: false };

export function MoneyCardsWidget({
  adapter,
  sampleAdapter,
  cards,
  periodLabels = englishPeriodLabels,
  onShowingSample,
}: MoneyCardsWidgetProps) {
  const [periods, setPeriod] = useMoneyCardPeriods(cards);
  const ranges = useMemo(() => {
    const byCard: Record<string, PeriodRange> = {};
    for (const card of cards) {
      byCard[card.key] = overviewPeriodRange(
        periods[card.key].period,
        new Date(),
        periods[card.key],
      );
    }
    return byCard;
  }, [cards, periods]);

  const real = (adapter.useMoneyFigures ?? (() => NOTHING))(ranges);
  const sample = ((sampleAdapter ?? adapter).useMoneyFigures ?? (() => NOTHING))(ranges);

  const wantsSample = useTourPlaceholderData();
  const isEmpty = Object.values(real.data).every((figure) => !figure.loading && figure.value === 0);
  const showingSample = wantsSample && isEmpty;
  onShowingSample?.(showingSample);
  const shown = showingSample ? sample : real;

  return (
    <MoneyCardsRow
      cards={cards}
      figures={shown.data}
      periods={periods}
      onPeriodChange={setPeriod}
      periodLabels={periodLabels}
      formatMoney={adapter.formatMoney}
      formatDay={adapter.formatDay}
    />
  );
}

function useMoneyCardPeriods(
  cards: MoneyCardSpec[],
): [Record<string, PeriodValue>, (cardKey: string, value: PeriodValue) => void] {
  const [periods, setPeriods] = useState<Record<string, PeriodValue>>(() => {
    const initial: Record<string, PeriodValue> = {};
    for (const card of cards) initial[card.key] = readStoredPeriod(`card.${card.key}`);
    return initial;
  });
  const setPeriod = (cardKey: string, value: PeriodValue) => {
    setPeriods((current) => ({ ...current, [cardKey]: value }));
    writeStoredPeriod(`card.${cardKey}`, value);
  };
  return [periods, setPeriod];
}
