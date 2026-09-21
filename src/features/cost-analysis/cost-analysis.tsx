import { useMemo, useState } from "react";
import { Download, Info, Layers, PieChart, Receipt, TriangleAlert, Wallet } from "lucide-react";

import { buildCostAnalysisReport, OPERATING_COST_KEYS } from "./bwa-report";
import { Explanation } from "./components/explanation";
import { Breakdown } from "./components/breakdown";
import { BasisToggle } from "./components/basis-switch";
import { HintCard } from "./components/hint-card";
import { MetricsRow } from "./components/metrics-row";
import { RevenueCostHistory, type HistoryPoint } from "./components/history";
import type { CostAnalysisConfig, CostAnalysisSearch } from "./config";
import {
  Button,
  ErrorState,
  FilterPills,
  FilterPopover,
  NOT_PNL_ROW_KEY,
  OVERVIEW_PERIOD_DEFAULT,
  OVERVIEW_PERIODS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  UNASSIGNED_ROW_KEY,
  PeriodPicker,
  buildCostAnalysisCsv,
  coarseCategoryCode,
  dateLocale,
  downloadCsv,
  formatDate,
  formatDayShort,
  formatEUR,
  formatIBAN,
  formatMonthShort,
  isOverviewPeriod,
  overviewPeriodRange,
  previousPeriodRange,
  rowKeyForCategoryCode,
  signForRowKey,
  useBankAccounts,
  useCostAnalysisCategories,
  useCostAnalysisScope,
  useCompanies,
  useProperties,
  useTranslation,
} from "./adapter";
import type {
  CostAnalysisAmountBasis,
  CostAnalysisExportRow,
  CostAnalysisScopeItem,
  FilterField,
} from "./adapter";

const ALL = "alle";

/** Stable empty options for a Hub that declares no extra dimension. */
const NO_OPTIONS = (_search: CostAnalysisSearch) => [] as { value: string; label: string }[];

// The amount a row contributes, with the sign it actually contributes it in. `-0` is normalized
// away, otherwise every empty cost line renders as "-0,00 €".
function signedAmount(rowKey: string, amount: number): number {
  if (amount === 0) return 0;
  return signForRowKey(rowKey) * amount;
}

export function CostAnalysis({
  config,
  search,
  onSearchChange,
}: {
  config: CostAnalysisConfig;
  /** Current URL state, read by the Hub's own typed `Route.useSearch()`. */
  search: CostAnalysisSearch;
  /**
   * Apply a partial change to that state. Handed in rather than taken from `Route` inside here,
   * because `Route.useSearch()` binds a component to ONE route id and the four Hubs do not agree
   * on theirs. The screen therefore knows what the filters ARE without knowing where they live.
   */
  onSearchChange: (patch: Partial<CostAnalysisSearch>) => void;
}) {
  const { t } = useTranslation();

  const companiesQ = useCompanies();
  const propertiesQ = useProperties();
  const categoriesQ = useCostAnalysisCategories();
  const bankAccountsQ = useBankAccounts();

  // The filters live in the URL, not in component state, so a narrowed view survives a reload and
  // can be handed to someone else as a link. `replace` on every change: adjusting a filter is
  // refining one view, not navigating, and pushing each keystroke would bury the previous page
  // under a dozen history entries.
  const fCompany = search.company ?? ALL;
  const fProperty = search.property ?? ALL;
  const fCategory = search.category ?? ALL;
  const fAccount = search.account ?? ALL;
  const fExtra = search.extra ?? ALL;
  // Last 30 days, not all time. Unfiltered, the screen reads every matched receipt the Hub has
  // ever had, which is both the slowest thing it can do and rarely the question being asked. The
  // same default the Overview uses, from the same constant.
  const period = search.period ?? OVERVIEW_PERIOD_DEFAULT;
  const fromDate = search.fromDate ?? "";
  const toDate = search.toDate ?? "";
  // Net is the standard; gross is the deliberate exception, so only gross appears in the URL.
  const basis: CostAnalysisAmountBasis = search.basis === "gross" ? "gross" : "net";
  const setSearch = onSearchChange;
  const setFCompany = (v: string) => setSearch({ company: v });
  const setFProperty = (v: string) => setSearch({ property: v });
  const setFCategory = (v: string) => setSearch({ category: v });
  const setFAccount = (v: string) => setSearch({ account: v });
  // Leaving the custom range clears its dates, so a stale von/bis cannot outlive the option that
  // produced it and reappear when someone picks "Individueller Zeitraum" again.
  const setPeriod = (v: string) =>
    setSearch(v === "benutzerdefiniert" ? { period: v } : { period: v, fromDate: "", toDate: "" });
  // Default ON. Unfiltered, 18 of the 26 DATEV lines are 0,00 €, so the three that carry anything
  // were spread across a table of mostly empty rows. The full skeleton stays one click away because
  // the client reads it line for line against his own BWA.
  const [onlyMitAmount] = useState(true);

  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);

  const categoriesById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );
  const coarseCategories = useMemo(
    () =>
      (categoriesQ.data ?? [])
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQ.data],
  );
  const bankAccounts = bankAccountsQ.data ?? [];

  // One implementation of "what dates does this period mean", shared with the Overview, so the two
  // screens cannot disagree about what "last 6 months" covers.
  const range = overviewPeriodRange(isOverviewPeriod(period) ? period : ALL, new Date(), {
    fromDate,
    toDate,
  });

  // Everything from "matched receipt" through the computed P&L skeleton lives in one shared hook
  // (src/lib/data/use-bwa-scope.ts) now, so this page and the dashboard's Gross Profit tile can
  // never silently disagree — see that file's own header for why that matters here specifically.
  const companyCodesFilter = useMemo(
    () =>
      fCompany === ALL
        ? null
        : (config.companyGroups?.find((g) => g.key === fCompany)?.codes ?? [fCompany]),
    [fCompany, config.companyGroups],
  );
  // Spread, not a declared key: each Hub's useBwaScope declares its own filter shape, and only the
  // Hub supplying the dimension knows which field its hook understands.
  const extraScope = config.extraDimension?.scopeFilter(fExtra === ALL ? null : fExtra) ?? {};
  // Called unconditionally: `config` is fixed for a given Hub, so the branch never changes between
  // renders, and a Hub without the dimension supplies the constant-empty fallback.
  const extraOptions = (config.extraDimension?.useOptions ?? NO_OPTIONS)(search);

  const costAnalysis = useCostAnalysisScope({
    companyCodes: companyCodesFilter,
    propertyCode: fProperty === ALL ? null : fProperty,
    categoryId: fCategory === ALL ? null : fCategory,
    accountId: fAccount === ALL ? null : fAccount,
    ...extraScope,
    fromDate: range.fromDate,
    toDate: range.toDate,
    basis,
  });
  // Prior-period comparison. The hook is already parameterized by scope, so the comparison is the
  // SAME computation over the preceding period rather than a second, approximate implementation.
  // With no comparable predecessor ("Alle Perioden") the compare scope is deliberately given the
  // primary range, so its React Query keys dedupe against the primary and nothing extra is fetched;
  // `vergleich` being null is what suppresses the column.
  // The equally long window ending the day before this one starts. "All time" has no predecessor,
  // which is what suppresses the comparison column and the cards' deltas.
  const comparison = (() => {
    const r = previousPeriodRange(range);
    if (!r.fromDate || !r.toDate) return null;
    return {
      fromDate: r.fromDate,
      toDate: r.toDate,
      label: `${formatDate(r.fromDate)} - ${formatDate(r.toDate)}`,
    };
  })();
  const costAnalysisComparison = useCostAnalysisScope({
    companyCodes: companyCodesFilter,
    propertyCode: fProperty === ALL ? null : fProperty,
    categoryId: fCategory === ALL ? null : fCategory,
    accountId: fAccount === ALL ? null : fAccount,
    ...extraScope,
    fromDate: comparison ? comparison.fromDate : range.fromDate,
    toDate: comparison ? comparison.toDate : range.toDate,
    basis,
  });
  const comparisonRowByKey = costAnalysisComparison.rowByKey;
  const showComparison =
    !!comparison && !costAnalysisComparison.isLoading && !costAnalysisComparison.isError;

  const { combined, computed, rowByKey } = costAnalysis;
  const hatData = combined.length > 0;

  // Row -> (fine) category -> its items — the drilldown hierarchy (line -> category -> receipt).
  // Every revenue item shares the same "__none" bucket key (they carry no fine category), which
  // SkeletonRow labels distinctly from an actually-uncategorized cost item — see its own comment.
  const drilldown = useMemo(() => {
    const byRow = new Map<string, Map<string, CostAnalysisScopeItem[]>>();
    for (const item of combined) {
      const code = item.outgoingInvoiceId
        ? "REVENUE"
        : coarseCategoryCode(item.categoryId, categoriesById);
      const rowKey = rowKeyForCategoryCode(code);
      const byCat = byRow.get(rowKey) ?? new Map<string, CostAnalysisScopeItem[]>();
      const catKey = item.categoryId ?? "__none";
      const list = byCat.get(catKey) ?? [];
      list.push(item);
      byCat.set(catKey, list);
      byRow.set(rowKey, byCat);
    }
    return byRow;
  }, [combined, categoriesById]);

  /**
   * The cost side regrouped for the breakdown explorer: one entry per DATEV cost line, carrying the
   * receipts behind it.
   *
   * Amounts come off the skeleton rows and are flipped to a positive magnitude — the table's own
   * label says these are costs, so a column of negatives there would be the same double negative
   * the Gesamtkosten card used to print. Items come from the drilldown map the old table already
   * used, flattened past its fine-category level: the explorer's unit is the DATEV line, and the
   * fine category is what the entry rows themselves show.
   */
  const breakdownGroups = useMemo(() => {
    const build = (keys: readonly string[], label: string, key: string) => {
      const rows = keys
        .map((rowKey) => ({
          key: rowKey,
          label: t(`reports.zeile.${rowKey}`),
          amount: Math.abs(rowByKey.get(rowKey)?.amount ?? 0),
          items: [...(drilldown.get(rowKey)?.values() ?? [])].flat(),
        }))
        // Every line of the group, including the ones at 0,00 €. An absent row and a row at zero
        // say different things — "we spent nothing on this" is an answer, whereas a category that
        // silently vanishes when it empties leaves the reader unsure whether it was ever there.
        // Zero rows sort to the bottom on their own, being zero.
        .sort((a, b) => b.amount - a.amount);
      return { key, label, rows, total: rows.reduce((n, z) => n + z.amount, 0) };
    };

    /**
     * Materials & goods, broken down one level FINER than the other group.
     *
     * DIRECT_COST_KEYS is a single DATEV line, so built like the operating costs this group was one
     * row plus a total restating it — half the section spent saying one number twice. Its
     * sub-categories are the only structure it has, so they are the rows here.
     *
     * The two tables therefore show different levels, which is a real cost and is why the group's
     * heading says so. It buys a table that can actually be explored: "Wareneinkauf vs Bauleistung
     * § 13b" is a question about this business, "Materialaufwand vs itself" is not.
     *
     * `drilldown` already groups by fine category, so the rows come out of the same structure the
     * dialogs read and cannot disagree with them. Receipts filed on the top-level category land in
     * their own bucket rather than being hidden or silently reassigned to a child.
     */
    const materialRows = (() => {
      const proCategory = drilldown.get("cogs_material");
      const rows = [...(proCategory?.entries() ?? [])].map(([catId, items]) => {
        const cat = categoriesById.get(catId);
        return {
          key: catId,
          // A receipt sitting on the top-level category itself has no finer name to show.
          label: cat && cat.parent_id ? cat.name : t("reports.aufschluesselung.direktAufKategorie"),
          amount: Math.abs(items.reduce((n, i) => n + i.amount, 0)),
          items,
        };
      });
      // Sub-categories nobody used yet, at 0,00 €, on the same reasoning as the empty cost lines.
      const occupied = new Set(rows.map((z) => z.key));
      const material = coarseCategories.find((c) => c.code === "COGS_MATERIAL");
      const leer = material
        ? (categoriesQ.data ?? [])
            .filter((c) => c.parent_id === material.id && c.is_active && !occupied.has(c.id))
            .map((c) => ({
              key: c.id,
              label: c.name,
              amount: 0,
              items: [] as CostAnalysisScopeItem[],
            }))
        : [];
      return [...rows, ...leer].sort((a, b) => b.amount - a.amount);
    })();

    return [
      build(OPERATING_COST_KEYS, t("reports.aufschluesselung.betriebskosten"), "betrieb"),
      {
        key: "material",
        label: t("reports.aufschluesselung.material"),
        subtitle: t("reports.aufschluesselung.materialUntertitel"),
        rows: materialRows,
        total: materialRows.reduce((n, z) => n + z.amount, 0),
        // The rows are category ids, so they carry the DATEV line's own colour rather than falling
        // back to grey.
        styleKey: "cogs_material",
      },
    ].filter((g) => g.rows.length > 0);
  }, [rowByKey, drilldown, categoriesById, coarseCategories, categoriesQ.data, t]);

  // Memoized because the entries table resets its paging when the array IDENTITY changes. Rebuilt inline
  // on every render, this list handed it a new array each time and the "load more" counter could
  // never get past the first page.
  const withoutCategoryItems = useMemo(
    () =>
      [...(drilldown.get(UNASSIGNED_ROW_KEY)?.values() ?? [])]
        .flat()
        .sort((a, b) => b.amount - a.amount),
    [drilldown],
  );

  // A saved grouping is offered only when EVERY code in it is actually present here. Listed
  // unconditionally, a Hub that does not have those companies showed an option that matched nothing
  // and silently emptied the page when picked.
  const availableGroups = (config.companyGroups ?? []).filter((group) =>
    group.codes.every((code) => companies.some((g) => g.code === code)),
  );
  const companyOptions = [
    { value: ALL, label: t("reports.filter.alleGesellschaften") },
    ...availableGroups.map((group) => ({ value: group.key, label: t(group.labelKey) })),
    ...companies.map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` })),
  ];
  const propertyOptions = [
    { value: ALL, label: t("reports.filter.alleObjekte") },
    ...(propertiesQ.data ?? []).map((o) => ({
      value: o.code,
      label: o.name ? `${o.code} · ${o.name}` : o.code,
    })),
  ];
  const categoryOptions = [
    { value: ALL, label: t("reports.filter.alleKategorien") },
    ...coarseCategories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const accountOptions = [
    { value: ALL, label: t("reports.filter.alleKonten") },
    // Every bank account (Bankkonten section), not just ones with an existing confirmed match —
    // filtering to only "used" accounts hid accounts with no matched activity YET from the
    // filter entirely, when the point of the filter is to let someone check exactly that.
    ...bankAccounts.map((a) => ({
      value: a.id,
      label: a.account_name ? `${a.account_name} · ${formatIBAN(a.iban)}` : formatIBAN(a.iban),
    })),
  ];
  // "Vormonat"/"Vorjahr" are no longer their own entries. They resolved to the same value as the
  // concrete option for that period ("Vorjahr" and "Jahr 2025" were both `jahr-2025`), so the list
  // held the same option twice, the checkmark rendered on both rows, and picking "Jahr 2025" made
  // the trigger read "Vorjahr" — Combobox resolves its label with the FIRST value match. They are
  // now a suffix on the concrete option, which also keeps a saved CSV export self-describing:
  // "Zeitraum: 2025 (Vorjahr)" still says which year it was a year later.
  // The SAME nine periods the Overview offers, in the same order, from the same constant. They used
  // to be derived from the data — every month, quarter and year that had a matched receipt — which
  // grew without bound and answered a question this screen does not ask. An evaluation is read
  // against a comparable predecessor ("this month against last month", "last year"), not by
  // scrolling to an arbitrary month; the invoice list is where you go to find one document.
  const periodOptions = OVERVIEW_PERIODS.map((p) => ({
    value: p,
    label: t(`home.zeitraumKurz.${p}`),
  }));

  // The export stays the FULL DATEV skeleton, all 26 lines in Form 01 order, not the grouped
  // reading order the table now shows. The screen was regrouped so a non-accountant can read it;
  // the export exists so the client can lay it beside his real BWA line for line, and those are
  // different jobs. Same filter state, same signs, same t() labels, plus the comparison column
  // when one is active, so nothing about a line's identity or value differs between the two.
  /**
   * Where a receipt is filed: the top-level category, plus the sub-category when it has one.
   *
   * Resolved through the parent link rather than printed from the receipt's own category alone,
   * because that leaf could be either level and the two are indistinguishable as bare names.
   * `name` in both languages, matching the category dropdown above.
   */
  const categoryPathFor = (item: CostAnalysisScopeItem) => {
    const cat = item.categoryId ? categoriesById.get(item.categoryId) : undefined;
    if (!cat) return null;
    const parent = cat.parent_id ? categoriesById.get(cat.parent_id) : undefined;
    return parent ? { category: parent.name, subcategory: cat.name } : { category: cat.name };
  };

  /** An option's display label, for anything that has a stored value and needs the words back. */
  const optionLabel = (value: string, options: { value: string; label: string }[]) =>
    options.find((o) => o.value === value)?.label ?? value;

  function exportCsv() {
    const rows: CostAnalysisExportRow[] = computed.rows.map((row) => ({
      key: row.key,
      label: t(`reports.zeile.${row.key}`),
      kind: row.kind,
      amount: row.kind === "line" ? signedAmount(row.key, row.amount) : row.amount,
      compareAmount: showComparison
        ? row.kind === "line"
          ? signedAmount(row.key, comparisonRowByKey.get(row.key)?.amount ?? 0)
          : (comparisonRowByKey.get(row.key)?.amount ?? 0)
        : null,
    }));
    const csv = buildCostAnalysisCsv(rows, {
      filters: [
        {
          label: t("reports.export.filterGesellschaft"),
          value: optionLabel(fCompany, companyOptions),
        },
        {
          label: t("reports.export.filterObjekt"),
          value: optionLabel(fProperty, propertyOptions),
        },
        {
          label: t("reports.export.filterKategorie"),
          value: optionLabel(fCategory, categoryOptions),
        },
        { label: t("reports.export.filterKonto"), value: optionLabel(fAccount, accountOptions) },
        {
          label: t("reports.export.filterZeitraum"),
          value: optionLabel(period, periodOptions),
        },
      ],
      generatedAt: new Date(),
      compareLabel: showComparison ? (comparison?.label ?? null) : null,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`kostenanalyse-${stamp}.csv`, csv);
  }

  // Both flags come from the hook that actually computes the figures, never from a hand-picked
  // subset of this page's own queries. The previous version gated loading on four of the nine
  // queries and error-handled exactly one of them, so the page rendered a complete, confident,
  // WRONG P&L while revenue and manual bookings were still in flight (measured at ~3.5s locally),
  // and silently swallowed a failure in any of the other eight into a plausible-looking total.
  if (costAnalysis.isError) {
    return <ErrorState error={costAnalysis.error} onRetry={() => costAnalysis.refetch()} />;
  }

  const isLoading = costAnalysis.isLoading;

  // Presentation grouping only. Every figure below is read off `computed`, which the shared hook
  // produced from the DATEV skeleton; nothing here recomputes an amount. See bwa-report.ts.
  const report = buildCostAnalysisReport(computed, {
    allRows: !onlyMitAmount,
    compareAmountFor: (key) => (showComparison ? (comparisonRowByKey.get(key)?.amount ?? 0) : 0),
  });

  // Time buckets, built from `combined` — the very items the table and the totals are made of,
  // classified with the same two helpers the drilldown uses. No new accounting: an item lands in a
  // bucket by its own booking date and in a series by the skeleton row it already belongs to.
  const historyEntries = (() => {
    const data = combined
      .map((item) => {
        const code = item.outgoingInvoiceId
          ? "REVENUE"
          : coarseCategoryCode(item.categoryId, categoriesById);
        return { item, rowKey: rowKeyForCategoryCode(code) };
      })
      .filter((x) => !!x.item.date);

    // An empty period still gets a chart, with its axes and legend, rather than the section
    // disappearing. Recharts renders the grid from an empty series, which reads as "nothing
    // here" instead of as a missing feature.
    if (data.length === 0) return { points: [] as HistoryPoint[] };

    // Day buckets for a short window, months otherwise. A month bucket over a two-week period puts
    // everything in one bar; a day bucket over four years makes 1500 of them.
    const days = data.map((d) => d.item.date!).sort();
    const range =
      (Date.parse(`${days[days.length - 1]}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`)) /
      86_400_000;
    const proTag = Number.isFinite(range) && range <= 62;

    const buckets = new Map<string, HistoryPoint>();
    for (const { item, rowKey } of data) {
      const k = proTag ? item.date!.slice(0, 10) : item.date!.slice(0, 7);
      let b = buckets.get(k);
      if (!b) {
        b = {
          key: k,
          label: proTag ? formatDayShort(k) : formatMonthShort(k),
          revenue: 0,
          cost: 0,
          result: 0,
        };
        buckets.set(k, b);
      }
      if (rowKey === "revenue") {
        b.revenue += item.amount;
      } else if (signForRowKey(rowKey) === -1) {
        b.cost += item.amount;
      }
      // Items that are neither revenue nor a cost line (uncategorized, not-in-P&L) are deliberately
      // in no series: they reach no result line, so putting them in a result trend would be a claim
      // the P&L itself does not make. They stay visible as footnotes under the table.
    }
    for (const b of buckets.values()) b.result = b.revenue - b.cost;

    const points = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { points };
  })();

  // The two buckets that are real money and reach NO line of the P&L: receipts with no category,
  // and ones deliberately kept out of it. They are not results, so they sit under the table as
  // footnotes rather than competing with the three figures at the top.
  // The uncategorized receipts themselves, not just their total. `computed.unassignedItems` carries
  // only ids and amounts; the drilldown map already holds the same items with their issuer and date,
  // so the list is built from that rather than from a second lookup.
  // Only the deliberate exclusion stays a footnote. Money with no category is not a footnote: it is
  // missing from every figure above, and it has its own section with a way to fix it.
  const extraRows = [{ key: NOT_PNL_ROW_KEY, amount: computed.excludedNotPnlAmount }].filter(
    (r) => r.amount !== 0,
  );

  // One Filter button holding all five, the same grouped-filters pattern the receipts and
  // suppliers lists use. Five loose comboboxes across the top pushed the figures below the fold and
  // gave the page two competing headers.
  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "gesellschaft",
      label: t("reports.filter.labelGesellschaft"),
      value: fCompany,
      defaultValue: ALL,
      options: companyOptions,
      onChange: setFCompany,
    },
    {
      kind: "select",
      key: "objekt",
      label: t("reports.filter.labelObjekt"),
      value: fProperty,
      defaultValue: ALL,
      options: propertyOptions,
      onChange: setFProperty,
    },
    {
      kind: "select",
      key: "kategorie",
      label: t("reports.filter.labelKategorie"),
      value: fCategory,
      defaultValue: ALL,
      options: categoryOptions,
      onChange: setFCategory,
    },
    {
      kind: "select",
      key: "konto",
      label: t("reports.filter.labelKonto"),
      value: fAccount,
      defaultValue: ALL,
      options: accountOptions,
      onChange: setFAccount,
    },
    ...(config.extraDimension
      ? [
          {
            kind: "select" as const,
            key: config.extraDimension.key,
            label: t(config.extraDimension.labelKey),
            value: fExtra,
            defaultValue: ALL,
            options: [{ value: ALL, label: t(config.extraDimension.allLabelKey) }, ...extraOptions],
            onChange: (v: string) => setSearch({ extra: v }),
          },
        ]
      : []),
  ];

  // Straight off the skeleton's own subtotal, like every other figure on this screen.
  const grossProfit = rowByKey.get("gross_profit")?.amount ?? 0;
  // A share of revenue. Null when there is no revenue: not 0 %, not infinity, no margin at all.
  const marge = (value: number) => (report.revenue > 0 ? (value / report.revenue) * 100 : null);

  // The prior period run through the SAME grouping, so a card's delta is the difference between two
  // identically-built figures rather than this screen's number minus something reconstructed by
  // hand. The hook is already fetched for the table's comparison columns; this adds no request.
  const comparisonReport = showComparison
    ? buildCostAnalysisReport(costAnalysisComparison.computed, { allRows: false })
    : null;
  const grossProfitComparison = showComparison
    ? (comparisonRowByKey.get("gross_profit")?.amount ?? 0)
    : 0;

  /** A card's delta, or null when there is no comparable predecessor to measure against. */
  const delta = (now: number, before: number) =>
    comparisonReport && comparison ? { delta: now - before, label: comparison.label } : null;

  /**
   * The percentage, restated with the actual euro figures behind it.
   *
   * A generic worked example ("71 % means 71 € of every 100 €") teaches the arithmetic but leaves
   * the reader to apply it to their own numbers. Naming the two amounts that produced THIS
   * percentage answers the question they actually have. Undefined when there is no margin to
   * explain, which is what keeps the ⓘ off cards that show no percentage.
   */
  const margeExplanation = (value: number, key: string) => {
    const m = marge(value);
    if (m == null) return undefined;
    return t(key, {
      revenue: formatEUR(report.revenue),
      value: formatEUR(value),
      percent: m.toLocaleString("de-DE", { maximumFractionDigits: 1 }),
    });
  };

  return (
    // The cost bars take the app's own brand ramp rather than a colour picked for this page, so
    // the one strong mark on the screen is the same one the logo and the nav already use.
    <div style={{ "--kosten-akzent": "var(--brand)" } as React.CSSProperties}>
      <header
        data-tour="analysis-header"
        className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"
      >
        {/* The two paragraphs that used to sit here — what the screen shows, and the caveat that
            these are not an audited BWA — are both things you read once and never again. As
            standing text they pushed the actual figures down the page on every visit. Behind one ⓘ
            they stay one click away for the first-time reader and cost nothing to everyone else. */}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("reports.title")}
          </h1>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("reports.infoLabel")}
                className="inline-flex cursor-pointer items-center text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Info className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(26rem,90vw)] p-3">
              <p className="text-sm leading-relaxed text-foreground">{t("reports.subtitle")}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("reports.disclosure")}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {/* Order is deliberate: how the amounts are counted, then the export of exactly that, then
            the filters. The basis switch changes every figure on screen, so it reads first; Filter
            sits last because its own state is spelled out by the chips underneath rather than by
            its position. */}
        <div className="flex flex-wrap items-center gap-2">
          <BasisToggle
            basis={basis}
            onChange={(b) => setSearch({ basis: b === "gross" ? "gross" : "" })}
          />
          {/* Disabled until there is something to export. An empty CSV is worse than no button,
              because it looks like the export ran and the period was genuinely empty. */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportCsv}
            disabled={isLoading || !hatData}
          >
            <Download className="size-4" />
            {t("reports.export.csv")}
          </Button>
          <FilterPopover
            fields={filterFields}
            labels={{
              button: t("reports.filter.button"),
              title: t("reports.filter.title"),
              reset: t("reports.filter.zuruecksetzen"),
            }}
          />
        </div>
      </header>

      {/* The period sits WITH the chips rather than inside the filter popover: every figure on the
          screen is scoped by it, so it has to be visible and changeable without opening anything.
          The other four dimensions stay behind Filter, where their chips report them. */}
      <div
        data-tour="analysis-filters"
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <span className="text-sm text-muted-foreground">{t("reports.filter.labelZeitraum")}</span>
        <PeriodPicker
          value={period}
          onValueChange={setPeriod}
          options={periodOptions}
          // The picker defaults this to "individuell"; this screen speaks the Overview's
          // vocabulary, where the custom option is "benutzerdefiniert". Without it the option
          // selects like any other preset and the calendar never opens.
          customValue="benutzerdefiniert"
          fromDate={fromDate}
          toDate={toDate}
          onRangeApply={(fromDateNew, toDateNew) =>
            setSearch({ fromDate: fromDateNew, toDate: toDateNew })
          }
          locale={dateLocale()}
          formatDay={(iso) => formatDate(iso)}
          backLabel={t("home.zeitraumAktion.zurueck")}
          ariaLabel={t("reports.filter.labelZeitraum")}
          className="w-full sm:w-[210px]"
          rangeLabels={{
            placeholder: t("documents.list.filter.zeitraumWaehlen"),
            reset: t("documents.list.filter.zeitraumZuruecksetzen"),
            apply: t("documents.list.filter.zeitraumAnwenden"),
            previousMonth: t("documents.list.filter.monatZurueck"),
            nextMonth: t("documents.list.filter.monatVor"),
            pickSecond: t("documents.list.filter.zweitesDatum"),
          }}
        />
        {/* One row of chips, the resolved dates among them. They were a bare run of muted text
            sitting beside a pill, which read as two different kinds of thing when both are just
            "what is currently in scope". No clear button on this one: the period is never off, and
            the picker beside it is how you change it.

            "Alle Perioden" is the one option that cannot show dates, so it says so in words. The
            chip carries no label prefix — the picker in front of it already says "Period", and
            repeating it would state the same fact twice in the same row. */}
        <FilterPills
          fields={filterFields}
          extra={[
            {
              key: "zeitraum",
              label:
                range.fromDate && range.toDate
                  ? t("reports.filter.zeitraumBereich", {
                      fromDate: formatDate(range.fromDate),
                      toDate: formatDate(range.toDate),
                    })
                  : t("reports.filter.zeitraumOhneGrenze"),
              // Shown only when the period actually narrows something. Keying this off the period
              // NAME was wrong: picking "Custom range" sets the name immediately, but until two
              // dates are chosen it resolves to no bounds at all — so the chip read "All periods"
              // and still offered an ✕ that cleared nothing. The resolved range is the honest test.
              clear: range.fromDate || range.toDate ? () => setPeriod(ALL) : undefined,
            },
          ]}
        />
      </div>

      {/* No page-level skeleton. Everything that is known before the data arrives (the cards, their
          names and descriptions, the column headers, the section headings) renders immediately, and
          only the FIGURES carry placeholders. Swapping the whole page for one grey rectangle threw
          the structure away and rebuilt it a second later, which reads as a page load rather than as
          numbers arriving. */}
      <>
        {/* Outgoing invoices carry no property and no matched-account lookup, so either of those
              two filters removes ALL revenue from the scope, and every figure that nets revenue
              against costs becomes cost-only while keeping a name that promises otherwise. */}
        {costAnalysis.revenueSuppressedByFilter && !isLoading && (
          <p className="mt-6 flex items-start gap-2 text-base text-amber-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("reports.umsatzDurchFilterAusgeblendet", {
              count: costAnalysis.revenueExcludedByDimensionFilter,
            })}
          </p>
        )}

        {/* Question one: what is my result. A margin is only a margin when there is revenue to
              measure it against — with none in scope the share line is left empty rather than
              printing 0 % or a division by zero. */}
        <div data-tour="analysis-figures" className="mt-6">
          <MetricsRow
            laden={isLoading}
            // Explains the dashes rather than leaving four of them unaccounted for. Only raised
            // when margins were actually withheld, so it disappears the moment revenue exists.
            marginsHint={
              !isLoading && report.revenue === 0
                ? {
                    title: t("reports.summe.margenHinweisTitel"),
                    text: t("reports.summe.margenHinweisText"),
                  }
                : null
            }
            fields={[
              {
                key: "revenue",
                label: t("reports.summe.umsatz"),
                description: t("reports.summe.erklaerungUmsatz"),
                icon: Wallet,
                ton: "revenue" as const,
                value: report.revenue,
                // No margin row: revenue as a share of revenue is 100 % by definition, so the
                // card would print either a truism or, worse, a "—" implying something failed.
                comparison: delta(report.revenue, comparisonReport?.revenue ?? 0),
              },
              {
                key: "grossProfit",
                label: t("reports.zeile.gross_profit"),
                description: t("reports.zeileHinweis.gross_profit"),
                icon: Layers,
                ton: "grossProfit" as const,
                value: grossProfit,
                marge: marge(grossProfit),
                margeLabel: t("reports.summe.marge"),
                margeExplanation: margeExplanation(grossProfit, "reports.summe.margeErklaerung"),
                comparison: delta(grossProfit, grossProfitComparison),
              },
              {
                key: "cost",
                label: t("reports.summe.gesamtkosten"),
                description: t("reports.summe.erklaerungGesamtkosten"),
                icon: Receipt,
                ton: "cost" as const,
                // A positive magnitude. The label already says these are costs, so printing
                // "-37.688,98 €" under the word "Gesamtkosten" is a double negative that reads
                // as money gained. The subtraction is shown where it belongs, in the report.
                value: report.totalCosts,
                marge: marge(report.totalCosts),
                margeLabel: t("reports.summe.vomUmsatz"),
                margeExplanation: margeExplanation(
                  report.totalCosts,
                  "reports.summe.kostenanteilErklaerung",
                ),
                comparison: delta(report.totalCosts, comparisonReport?.totalCosts ?? 0),
                // The one figure on this screen where a rise is bad news.
                direction: "upIsBad",
              },
              {
                key: "result",
                label: t("reports.summe.betriebsergebnis"),
                description: t("reports.summe.erklaerungBetriebsergebnis"),
                icon: PieChart,
                ton: "result" as const,
                value: report.operatingResult,
                marge: marge(report.operatingResult),
                margeLabel: t("reports.summe.marge"),
                margeExplanation: margeExplanation(
                  report.operatingResult,
                  "reports.summe.margeErklaerung",
                ),
                comparison: delta(report.operatingResult, comparisonReport?.operatingResult ?? 0),
                emphasis: true,
              },
            ]}
          />
        </div>

        {/* Rule 1 of the briefing: the VAT total is reported SEPARATELY as a metric (the tax
              liability) and never mixed into a cost line. It sits under the cards rather than
              beside them, because it is not a result. */}
        {/* Present from the first paint, with its figures waiting. Gated on hatDaten alone it
            was absent until the queries resolved and then appeared, pushing the page down. */}
        {
          // Was one run of four inline fragments: label, amount, "5.067,28 € deductible ·
          // 0,00 € non-deductible", "Pass-through item, not included in the costs". Every part of
          // that is accurate and none of it says what the reader needs — which half of the money
          // comes back, which half does not, and why the figure is sitting outside the result at
          // all. Same three facts, in sentences.
          <div className="mt-4 rounded-lg bg-muted/60 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-medium text-foreground">{t("reports.kpi.ust")}</span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatEUR(costAnalysis.vatAmountTotal)}
              </span>
            </div>
            {/* Fixed height whether or not there is a split to show. It used to appear only once
                the totals were non-zero, so the card gained a line the moment the data landed and
                shoved everything below it down. */}
            <div className="mt-1 min-h-[1.25rem]">
              {isLoading ? (
                <Skeleton className="h-4 w-96 max-w-full" />
              ) : (
                (costAnalysis.vatDeductibleTotal !== 0 ||
                  costAnalysis.vatNondeductibleTotal !== 0) && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("reports.kpi.ustAufteilung", {
                      deductible: formatEUR(costAnalysis.vatDeductibleTotal),
                      nondeductible: formatEUR(costAnalysis.vatNondeductibleTotal),
                    })}
                  </p>
                )
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("reports.kpi.ustHinweisLang")}
            </p>
          </div>
        }

        {/* No empty state. A period with nothing in it is a RESULT, not an error, and the screen
            says so better by showing the same cards, the same tables and the same chart reading
            0,00 € than by replacing all of them with a sentence. Swapping layouts on the value of
            the data also meant the page changed shape as you moved between periods, which made a
            quiet month look like something had gone wrong. */}
        <>
          <>
            {/* Question two: where are the costs going. Both panels render whenever there is
                  data, including for a single period. They used to be dropped below two time
                  buckets in favour of a flat share list, which meant picking one month made both
                  charts disappear and read as a bug rather than as a deliberate substitution. A
                  one-period bar is still a cost breakdown; the line chart marks its single point
                  with dots instead of drawing a line through nothing. */}
            {isLoading ? (
              <section className="mt-8 rounded-xl bg-muted/30 p-4">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  {t("reports.chart.verlaufTitel")}
                </h2>
                <Skeleton className="mt-3 h-[280px] w-full rounded-lg" />
              </section>
            ) : (
              historyEntries && (
                // A tinted panel, unlike every other block on this page: the chart answers a
                // different question from the tables around it, and on a white page it read as
                // part of whatever sat above it. Tint only, no border, since the figure already
                // carries its own axes and frame.
                <section className="mt-8 rounded-xl bg-muted/30 p-4">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {t("reports.chart.verlaufTitel")}
                  </h2>
                  <div className="mt-3">
                    <RevenueCostHistory points={historyEntries.points} />
                  </div>
                </section>
              )
            )}

            {/* Question three: what makes them up. The unresolved-VAT flag rides along as the
                  section's own banner: it is about these very receipts, and it used to sit as a
                  grey sentence in the footnotes below, where it was read as trivia rather than as
                  something to do. */}
            <div data-tour="analysis-breakdown">
              <Breakdown
                laden={isLoading}
                hint={
                  // No min-h any more: these sit beside the section heading now, which sets the row
                  // height on its own, so an empty row is not being reserved for them.
                  <div className="flex flex-wrap items-start gap-3 lg:justify-end">
                    <HintCard
                      icon={TriangleAlert}
                      cardText={t("reports.ustUngeklaert.karte", {
                        count: costAnalysis.vatUnresolvedCount,
                        amount: formatEUR(costAnalysis.vatUnresolvedAmount),
                      })}
                      title={t("reports.ustUngeklaert.titel")}
                      hint={t("reports.ustUngeklaert.hinweis")}
                      amount={costAnalysis.vatUnresolvedAmount}
                      items={costAnalysis.vatUnresolvedItems}
                      categoryFor={categoryPathFor}
                      onOpenDocument={(id) => config.onOpenDocument(id, "ust")}
                      onOpenManualBooking={() => config.onOpenManualBooking?.()}
                    />
                    <HintCard
                      icon={TriangleAlert}
                      cardText={t("reports.ohneKategorie.warnung", {
                        count: withoutCategoryItems.length,
                        amount: formatEUR(computed.unassignedAmount),
                      })}
                      title={t("reports.ohneKategorie.titel")}
                      hint={t("reports.ohneKategorie.hinweis", {
                        count: withoutCategoryItems.length,
                      })}
                      amount={computed.unassignedAmount}
                      items={withoutCategoryItems}
                      // No category column: these receipts have none, which is the whole point of
                      // the card. A column of dashes would restate it once per row.
                      onOpenDocument={(id) => config.onOpenDocument(id, "kategorie")}
                      onOpenManualBooking={() => config.onOpenManualBooking?.()}
                    />
                  </div>
                }
                groups={breakdownGroups}
                categoryFor={categoryPathFor}
                onOpenDocument={config.onOpenDocument}
                onOpenManualBooking={() => config.onOpenManualBooking?.()}
              />
            </div>

            {extraRows.length > 0 && (
              <section className="mt-8 border-t border-border pt-4">
                <ul className="space-y-3">
                  {extraRows.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                    >
                      <span className="text-base text-foreground">
                        <Explanation
                          label={t(`reports.zeile.${row.key}`)}
                          explanation={t(`reports.zeileHinweis.${row.key}`, {
                            defaultValue: "",
                          })}
                        />
                        <span className="ml-2 text-sm text-amber-700">
                          {t("reports.tabelle.nichtImErgebnis")}
                        </span>
                      </span>
                      <span className="text-base tabular-nums text-foreground">
                        {formatEUR(row.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Everything the figures above could not account for. Small, last, and never
                  silently dropped. */}
            {(costAnalysis.notBucketedCount + costAnalysis.revenueNotBucketedCount > 0 ||
              costAnalysis.manualExcludedByAccountFilter +
                costAnalysis.revenueExcludedByDimensionFilter >
                0 ||
              costAnalysis.revenueNetUnknownCount > 0 ||
              costAnalysis.vatUnresolvedCount > 0 ||
              costAnalysis.costNetUnknownCount > 0) && (
              <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                {costAnalysis.notBucketedCount + costAnalysis.revenueNotBucketedCount > 0 && (
                  <p>
                    {t("reports.nichtEingeteilt", {
                      count: costAnalysis.notBucketedCount + costAnalysis.revenueNotBucketedCount,
                    })}
                  </p>
                )}
                {costAnalysis.manualExcludedByAccountFilter +
                  costAnalysis.revenueExcludedByDimensionFilter >
                  0 && (
                  <p>
                    {t("reports.kontoAusschluss", {
                      count:
                        costAnalysis.manualExcludedByAccountFilter +
                        costAnalysis.revenueExcludedByDimensionFilter,
                    })}
                  </p>
                )}
                {costAnalysis.revenueNetUnknownCount > 0 && (
                  <p>
                    {t("reports.ausgangNettoUngeklaert", {
                      count: costAnalysis.revenueNetUnknownCount,
                    })}
                  </p>
                )}
                {costAnalysis.costNetUnknownCount > 0 && (
                  <p>
                    {t("reports.kostenNettoUngeklaert", {
                      count: costAnalysis.costNetUnknownCount,
                    })}
                  </p>
                )}
              </div>
            )}
          </>
        </>
      </>
    </div>
  );
}
