import { useMemo } from "react";

import { overviewPeriodRange, useStoredPeriod, type PeriodValue } from "../../components/dashboard";
import type { PeriodRange } from "../../adapters/overview";
import { useTourPlaceholderData } from "../../components/tour";

export interface WidgetData<T> {
  period: PeriodValue;
  setPeriod: (value: PeriodValue) => void;
  range: PeriodRange;
  data: T;
  loading: boolean;
  error?: boolean;
  showingSample: boolean;
}

export interface WidgetSource<T> {
  storageKey: string;
  read: (range: PeriodRange) => { data: T; loading: boolean; error?: boolean };
  readSample: (range: PeriodRange) => { data: T; loading: boolean; error?: boolean };
  isEmpty: (data: T) => boolean;
}

export function useWidgetData<T>({
  storageKey,
  read,
  readSample,
  isEmpty,
}: WidgetSource<T>): WidgetData<T> {
  const [period, setPeriod] = useStoredPeriod(storageKey);
  const range = useMemo(() => overviewPeriodRange(period.period, new Date(), period), [period]);

  const real = read(range);
  const sample = readSample(range);
  const wantsSample = useTourPlaceholderData();
  const showingSample = wantsSample && !real.loading && isEmpty(real.data);
  const shown = showingSample ? sample : real;

  return {
    period,
    setPeriod,
    range,
    data: shown.data,
    loading: shown.loading,
    error: shown.error,
    showingSample,
  };
}

export function useStaticWidgetData<T>({
  read,
  readSample,
  isEmpty,
}: Omit<WidgetSource<T>, "storageKey" | "read" | "readSample"> & {
  read: () => { data: T; loading: boolean; error?: boolean };
  readSample: () => { data: T; loading: boolean; error?: boolean };
}): Omit<WidgetData<T>, "period" | "setPeriod" | "range"> {
  const real = read();
  const sample = readSample();
  const wantsSample = useTourPlaceholderData();
  const showingSample = wantsSample && !real.loading && isEmpty(real.data);
  const shown = showingSample ? sample : real;
  return {
    data: shown.data,
    loading: shown.loading,
    error: shown.error,
    showingSample,
  };
}
