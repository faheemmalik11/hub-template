import { useMemo } from "react";

import { DashboardPanel } from "@/components/dashboard/panel";
import {
  RankedBars,
  RankedBarsSkeleton,
  type RankedBarRow,
} from "@/components/dashboard/ranked-bars";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import {
  formatEUR,
  formatEURCompact,
  COMPANY_WITHOUT,
  overviewPeriodRange,
} from "@/lib/data/format";
import { useOverviewInvoices } from "@/data";
import { useTranslation } from "@/lib/i18n";

/**
 * The two ranked panels of the overview: top suppliers and spending by company. Both read the
 * SAME rows the money cards and the trend chart read (one request, shared by query key),
 * aggregated two different ways. A supplier row links to that supplier's own page when the
 * invoices carry a supplier_id; a company row links to the invoice list filtered to it.
 */

export function TopSuppliers() {
  const { t } = useTranslation();
  const [period, setPeriod] = useStoredPeriod("suppliers");
  const range = useMemo(
    () =>
      overviewPeriodRange(period.period, new Date(), {
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    [period],
  );
  const invoicesQ = useOverviewInvoices(range.fromDate, range.toDate);

  const { rows, total } = useMemo(() => {
    const data = invoicesQ.data ?? [];
    const byIssuer = new Map<string, { sum: number; supplierId: string | null }>();
    for (const r of data) {
      const key = (r.issuer ?? "").trim();
      const entry = byIssuer.get(key) ?? { sum: 0, supplierId: null };
      entry.sum += r.amount_gross ?? 0;
      entry.supplierId ??= r.supplier_id;
      byIssuer.set(key, entry);
    }
    const total = data.reduce((s, r) => s + (r.amount_gross ?? 0), 0);
    const absTotal = data.reduce((s, r) => s + Math.abs(r.amount_gross ?? 0), 0);
    const rows: RankedBarRow[] = [...byIssuer.entries()]
      .sort((a, b) => b[1].sum - a[1].sum)
      .slice(0, 5)
      .map(([issuer, v]) => ({
        key: issuer || "__none",
        label: issuer || t("home.top.unbekannt"),
        valueText: formatEURCompact(v.sum),
        sharePct: absTotal > 0 ? (Math.abs(v.sum) / absTotal) * 100 : 0,
        link: v.supplierId
          ? { to: "/suppliers/$id", params: { id: v.supplierId } }
          : issuer
            ? { to: "/incoming-invoices", search: { q: issuer } }
            : undefined,
      }));
    return { rows, total };
  }, [invoicesQ.data, t]);

  return (
    <DashboardPanel
      title={t("home.top.title", { count: RANKED_ROWS })}
      titleExtra={t("home.rank.total", { sum: formatEURCompact(total) })}
      headerRight={<PeriodPicker value={period} onChange={setPeriod} />}
      className="overflow-hidden"
    >
      {invoicesQ.isLoading ? (
        <RankedBarsSkeleton />
      ) : (
        <RankedBars rows={rows.length > 0 ? rows : [emptyRow(t)]} />
      )}
    </DashboardPanel>
  );
}

const RANKED_ROWS = 5;

function emptyRow(t: (key: string) => string): RankedBarRow {
  return { key: "__empty", label: t("home.rank.empty"), valueText: formatEUR(0), sharePct: 0 };
}

export function CompanyVolume() {
  const { t } = useTranslation();
  const [period, setPeriod] = useStoredPeriod("companies");
  const range = useMemo(
    () =>
      overviewPeriodRange(period.period, new Date(), {
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    [period],
  );
  const invoicesQ = useOverviewInvoices(range.fromDate, range.toDate);

  const { rows, total } = useMemo(() => {
    const data = invoicesQ.data ?? [];
    const byCompany = new Map<string, number>();
    for (const r of data) {
      let key = (r.company_code ?? "").trim();
      // NZO is the catch-all "assigned to none" code; to the reader it is the same bucket as a
      // missing company, and the invoice list's "ohne Gesellschaft" filter treats it that way too.
      if (key === COMPANY_WITHOUT) key = "";
      byCompany.set(key, (byCompany.get(key) ?? 0) + (r.amount_gross ?? 0));
    }
    const total = data.reduce((s, r) => s + (r.amount_gross ?? 0), 0);
    const absTotal = data.reduce((s, r) => s + Math.abs(r.amount_gross ?? 0), 0);
    const rows: RankedBarRow[] = [...byCompany.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, sum]) => ({
        key: code || "__none",
        label: code || t("home.companies.ohne"),
        valueText: formatEURCompact(sum),
        sharePct: absTotal > 0 ? (Math.abs(sum) / absTotal) * 100 : 0,
        link: {
          to: "/incoming-invoices",
          search: { company: code || COMPANY_WITHOUT },
        },
      }));
    return { rows, total };
  }, [invoicesQ.data, t]);

  return (
    <DashboardPanel
      title={t("home.companies.title", { count: RANKED_ROWS })}
      titleExtra={t("home.rank.total", { sum: formatEURCompact(total) })}
      headerRight={<PeriodPicker value={period} onChange={setPeriod} />}
      className="overflow-hidden"
    >
      {invoicesQ.isLoading ? (
        <RankedBarsSkeleton />
      ) : (
        <RankedBars rows={rows.length > 0 ? rows : [emptyRow(t)]} />
      )}
    </DashboardPanel>
  );
}
