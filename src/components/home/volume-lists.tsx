import { useMemo } from "react";

import { DashboardPanel } from "@/components/dashboard/panel";
import {
  RankedBars,
  RankedBarsSkeleton,
  type RankedBarRow,
} from "@/components/dashboard/ranked-bars";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { formatEURCompact, GESELLSCHAFT_OHNE, overviewPeriodRange } from "@/lib/data/format";
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
  const [zeitraum, setZeitraum] = useStoredPeriod("suppliers");
  const range = useMemo(
    () =>
      overviewPeriodRange(zeitraum.period, new Date(), { von: zeitraum.von, bis: zeitraum.bis }),
    [zeitraum],
  );
  const invoicesQ = useOverviewInvoices(range.von, range.bis);

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
          ? { to: "/lieferanten/$id", params: { id: v.supplierId } }
          : issuer
            ? { to: "/eingangsrechnungen", search: { q: issuer } }
            : undefined,
      }));
    return { rows, total };
  }, [invoicesQ.data, t]);

  if (!invoicesQ.isLoading && rows.length === 0) return null;

  return (
    <DashboardPanel
      title={t("home.top.title", { count: rows.length })}
      titleExtra={t("home.rank.total", { sum: formatEURCompact(total) })}
      headerRight={<PeriodPicker value={zeitraum} onChange={setZeitraum} />}
      className="overflow-hidden"
    >
      {invoicesQ.isLoading ? <RankedBarsSkeleton /> : <RankedBars rows={rows} />}
    </DashboardPanel>
  );
}

export function CompanyVolume() {
  const { t } = useTranslation();
  const [zeitraum, setZeitraum] = useStoredPeriod("companies");
  const range = useMemo(
    () =>
      overviewPeriodRange(zeitraum.period, new Date(), { von: zeitraum.von, bis: zeitraum.bis }),
    [zeitraum],
  );
  const invoicesQ = useOverviewInvoices(range.von, range.bis);

  const { rows, total } = useMemo(() => {
    const data = invoicesQ.data ?? [];
    const byCompany = new Map<string, number>();
    for (const r of data) {
      let key = (r.company_code ?? "").trim();
      // NZO is the catch-all "assigned to none" code; to the reader it is the same bucket as a
      // missing company, and the invoice list's "ohne Gesellschaft" filter treats it that way too.
      if (key === GESELLSCHAFT_OHNE) key = "";
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
          to: "/eingangsrechnungen",
          search: { gesellschaft: code || GESELLSCHAFT_OHNE },
        },
      }));
    return { rows, total };
  }, [invoicesQ.data, t]);

  if (!invoicesQ.isLoading && rows.length === 0) return null;

  return (
    <DashboardPanel
      title={t("home.companies.title", { count: rows.length })}
      titleExtra={t("home.rank.total", { sum: formatEURCompact(total) })}
      headerRight={<PeriodPicker value={zeitraum} onChange={setZeitraum} />}
      className="overflow-hidden"
    >
      {invoicesQ.isLoading ? <RankedBarsSkeleton /> : <RankedBars rows={rows} />}
    </DashboardPanel>
  );
}
