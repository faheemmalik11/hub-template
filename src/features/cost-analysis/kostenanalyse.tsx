import { useMemo, useState } from "react";
import { Download, Info, Layers, PieChart, Receipt, TriangleAlert, Wallet } from "lucide-react";

import { buildBwaReport, OPERATING_COST_KEYS } from "./bwa-report";
import { Erklaerung } from "./components/erklaerung";
import { Aufschluesselung } from "./components/aufschluesselung";
import { BasisUmschalter } from "./components/basis-umschalter";
import { HinweisKarte } from "./components/hinweis-karte";
import { KennzahlenReihe } from "./components/kennzahlen-reihe";
import { UmsatzKostenVerlauf, type VerlaufPunkt } from "./components/verlauf";
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
  ZeitraumPicker,
  buildBwaCsv,
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
  useBwaCategories,
  useBwaScope,
  useGesellschaften,
  useObjekte,
  useTranslation,
} from "./adapter";
import type { BwaAmountBasis, BwaExportRow, BwaScopeItem, FilterField } from "./adapter";

const ALLE = "alle";

/** Stable empty options for a Hub that declares no extra dimension. */
const KEINE_OPTIONEN = (_search: CostAnalysisSearch) => [] as { value: string; label: string }[];

// The amount a row contributes, with the sign it actually contributes it in. `-0` is normalized
// away, otherwise every empty cost line renders as "-0,00 €".
function signedAmount(rowKey: string, amount: number): number {
  if (amount === 0) return 0;
  return signForRowKey(rowKey) * amount;
}

export function Kostenanalyse({
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

  const gesellschaftenQ = useGesellschaften();
  const objekteQ = useObjekte();
  const categoriesQ = useBwaCategories();
  const bankAccountsQ = useBankAccounts();

  // The filters live in the URL, not in component state, so a narrowed view survives a reload and
  // can be handed to someone else as a link. `replace` on every change: adjusting a filter is
  // refining one view, not navigating, and pushing each keystroke would bury the previous page
  // under a dozen history entries.
  const fGesellschaft = search.gesellschaft ?? ALLE;
  const fObjekt = search.objekt ?? ALLE;
  const fKategorie = search.kategorie ?? ALLE;
  const fKonto = search.konto ?? ALLE;
  const fZusatz = search.zusatz ?? ALLE;
  // Last 30 days, not all time. Unfiltered, the screen reads every matched receipt the Hub has
  // ever had, which is both the slowest thing it can do and rarely the question being asked. The
  // same default the Overview uses, from the same constant.
  const zeitraum = search.zeitraum ?? OVERVIEW_PERIOD_DEFAULT;
  const von = search.von ?? "";
  const bis = search.bis ?? "";
  // Net is the standard; gross is the deliberate exception, so only gross appears in the URL.
  const basis: BwaAmountBasis = search.basis === "gross" ? "gross" : "net";
  const setSearch = onSearchChange;
  const setFGesellschaft = (v: string) => setSearch({ gesellschaft: v });
  const setFObjekt = (v: string) => setSearch({ objekt: v });
  const setFKategorie = (v: string) => setSearch({ kategorie: v });
  const setFKonto = (v: string) => setSearch({ konto: v });
  // Leaving the custom range clears its dates, so a stale von/bis cannot outlive the option that
  // produced it and reappear when someone picks "Individueller Zeitraum" again.
  const setZeitraum = (v: string) =>
    setSearch(v === "benutzerdefiniert" ? { zeitraum: v } : { zeitraum: v, von: "", bis: "" });
  // Default ON. Unfiltered, 18 of the 26 DATEV lines are 0,00 €, so the three that carry anything
  // were spread across a table of mostly empty rows. The full skeleton stays one click away because
  // the client reads it line for line against his own BWA.
  const [nurMitBetrag] = useState(true);

  const gesellschaften = useMemo(() => gesellschaftenQ.data ?? [], [gesellschaftenQ.data]);

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
  const range = overviewPeriodRange(isOverviewPeriod(zeitraum) ? zeitraum : ALLE, new Date(), {
    von,
    bis,
  });

  // Everything from "matched receipt" through the computed P&L skeleton lives in one shared hook
  // (src/lib/data/use-bwa-scope.ts) now, so this page and the dashboard's Gross Profit tile can
  // never silently disagree — see that file's own header for why that matters here specifically.
  const companyCodesFilter = useMemo(
    () =>
      fGesellschaft === ALLE
        ? null
        : (config.companyGroups?.find((g) => g.key === fGesellschaft)?.codes ?? [fGesellschaft]),
    [fGesellschaft, config.companyGroups],
  );
  // Spread, not a declared key: each Hub's useBwaScope declares its own filter shape, and only the
  // Hub supplying the dimension knows which field its hook understands.
  const zusatzScope = config.zusatzDimension?.scopeFilter(fZusatz === ALLE ? null : fZusatz) ?? {};
  // Called unconditionally: `config` is fixed for a given Hub, so the branch never changes between
  // renders, and a Hub without the dimension supplies the constant-empty fallback.
  const zusatzOptionen = (config.zusatzDimension?.useOptions ?? KEINE_OPTIONEN)(search);

  const bwa = useBwaScope({
    companyCodes: companyCodesFilter,
    propertyCode: fObjekt === ALLE ? null : fObjekt,
    categoryId: fKategorie === ALLE ? null : fKategorie,
    accountId: fKonto === ALLE ? null : fKonto,
    ...zusatzScope,
    von: range.von,
    bis: range.bis,
    basis,
  });
  // Prior-period comparison. The hook is already parameterized by scope, so the comparison is the
  // SAME computation over the preceding period rather than a second, approximate implementation.
  // With no comparable predecessor ("Alle Perioden") the compare scope is deliberately given the
  // primary range, so its React Query keys dedupe against the primary and nothing extra is fetched;
  // `vergleich` being null is what suppresses the column.
  // The equally long window ending the day before this one starts. "All time" has no predecessor,
  // which is what suppresses the comparison column and the cards' deltas.
  const vergleich = (() => {
    const r = previousPeriodRange(range);
    if (!r.von || !r.bis) return null;
    return { von: r.von, bis: r.bis, label: `${formatDate(r.von)} - ${formatDate(r.bis)}` };
  })();
  const bwaVergleich = useBwaScope({
    companyCodes: companyCodesFilter,
    propertyCode: fObjekt === ALLE ? null : fObjekt,
    categoryId: fKategorie === ALLE ? null : fKategorie,
    accountId: fKonto === ALLE ? null : fKonto,
    ...zusatzScope,
    von: vergleich ? vergleich.von : range.von,
    bis: vergleich ? vergleich.bis : range.bis,
    basis,
  });
  const vergleichRowByKey = bwaVergleich.rowByKey;
  const zeigeVergleich = !!vergleich && !bwaVergleich.isLoading && !bwaVergleich.isError;

  const { combined, computed, rowByKey } = bwa;
  const hatDaten = combined.length > 0;

  // Row -> (fine) category -> its items — the drilldown hierarchy (line -> category -> receipt).
  // Every revenue item shares the same "__none" bucket key (they carry no fine category), which
  // SkeletonRow labels distinctly from an actually-uncategorized cost item — see its own comment.
  const drilldown = useMemo(() => {
    const byRow = new Map<string, Map<string, BwaScopeItem[]>>();
    for (const item of combined) {
      const code = item.outgoingInvoiceId
        ? "REVENUE"
        : coarseCategoryCode(item.categoryId, categoriesById);
      const rowKey = rowKeyForCategoryCode(code);
      const byCat = byRow.get(rowKey) ?? new Map<string, BwaScopeItem[]>();
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
  const aufschluesselungGruppen = useMemo(() => {
    const baue = (keys: readonly string[], label: string, key: string) => {
      const zeilen = keys
        .map((rowKey) => ({
          key: rowKey,
          label: t(`auswertungen.zeile.${rowKey}`),
          amount: Math.abs(rowByKey.get(rowKey)?.amount ?? 0),
          items: [...(drilldown.get(rowKey)?.values() ?? [])].flat(),
        }))
        // Every line of the group, including the ones at 0,00 €. An absent row and a row at zero
        // say different things — "we spent nothing on this" is an answer, whereas a category that
        // silently vanishes when it empties leaves the reader unsure whether it was ever there.
        // Zero rows sort to the bottom on their own, being zero.
        .sort((a, b) => b.amount - a.amount);
      return { key, label, zeilen, summe: zeilen.reduce((n, z) => n + z.amount, 0) };
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
    const materialZeilen = (() => {
      const proKategorie = drilldown.get("cogs_material");
      const zeilen = [...(proKategorie?.entries() ?? [])].map(([catId, items]) => {
        const cat = categoriesById.get(catId);
        return {
          key: catId,
          // A receipt sitting on the top-level category itself has no finer name to show.
          label:
            cat && cat.parent_id ? cat.name : t("auswertungen.aufschluesselung.direktAufKategorie"),
          amount: Math.abs(items.reduce((n, i) => n + i.amount, 0)),
          items,
        };
      });
      // Sub-categories nobody used yet, at 0,00 €, on the same reasoning as the empty cost lines.
      const belegt = new Set(zeilen.map((z) => z.key));
      const material = coarseCategories.find((c) => c.code === "COGS_MATERIAL");
      const leer = material
        ? (categoriesQ.data ?? [])
            .filter((c) => c.parent_id === material.id && c.is_active && !belegt.has(c.id))
            .map((c) => ({ key: c.id, label: c.name, amount: 0, items: [] as BwaScopeItem[] }))
        : [];
      return [...zeilen, ...leer].sort((a, b) => b.amount - a.amount);
    })();

    return [
      baue(OPERATING_COST_KEYS, t("auswertungen.aufschluesselung.betriebskosten"), "betrieb"),
      {
        key: "material",
        label: t("auswertungen.aufschluesselung.material"),
        untertitel: t("auswertungen.aufschluesselung.materialUntertitel"),
        zeilen: materialZeilen,
        summe: materialZeilen.reduce((n, z) => n + z.amount, 0),
        // The rows are category ids, so they carry the DATEV line's own colour rather than falling
        // back to grey.
        stilKey: "cogs_material",
      },
    ].filter((g) => g.zeilen.length > 0);
  }, [rowByKey, drilldown, categoriesById, coarseCategories, categoriesQ.data, t]);

  // Memoized because the entries table resets its paging when the array IDENTITY changes. Rebuilt inline
  // on every render, this list handed it a new array each time and the "load more" counter could
  // never get past the first page.
  const ohneKategorieItems = useMemo(
    () =>
      [...(drilldown.get(UNASSIGNED_ROW_KEY)?.values() ?? [])]
        .flat()
        .sort((a, b) => b.amount - a.amount),
    [drilldown],
  );

  // A saved grouping is offered only when EVERY code in it is actually present here. Listed
  // unconditionally, a Hub that does not have those companies showed an option that matched nothing
  // and silently emptied the page when picked.
  const verfuegbareGruppen = (config.companyGroups ?? []).filter((gruppe) =>
    gruppe.codes.every((code) => gesellschaften.some((g) => g.code === code)),
  );
  const companyOptions = [
    { value: ALLE, label: t("auswertungen.filter.alleGesellschaften") },
    ...verfuegbareGruppen.map((gruppe) => ({ value: gruppe.key, label: t(gruppe.labelKey) })),
    ...gesellschaften.map((g) => ({ value: g.code, label: `${g.code} · ${g.name}` })),
  ];
  const propertyOptions = [
    { value: ALLE, label: t("auswertungen.filter.alleObjekte") },
    ...(objekteQ.data ?? []).map((o) => ({
      value: o.code,
      label: o.name ? `${o.code} · ${o.name}` : o.code,
    })),
  ];
  const categoryOptions = [
    { value: ALLE, label: t("auswertungen.filter.alleKategorien") },
    ...coarseCategories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const accountOptions = [
    { value: ALLE, label: t("auswertungen.filter.alleKonten") },
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
  const kategoriePfadFuer = (item: BwaScopeItem) => {
    const cat = item.categoryId ? categoriesById.get(item.categoryId) : undefined;
    if (!cat) return null;
    const parent = cat.parent_id ? categoriesById.get(cat.parent_id) : undefined;
    return parent ? { kategorie: parent.name, unterkategorie: cat.name } : { kategorie: cat.name };
  };

  /** An option's display label, for anything that has a stored value and needs the words back. */
  const optionLabel = (value: string, options: { value: string; label: string }[]) =>
    options.find((o) => o.value === value)?.label ?? value;

  function exportCsv() {
    const rows: BwaExportRow[] = computed.rows.map((row) => ({
      key: row.key,
      label: t(`auswertungen.zeile.${row.key}`),
      kind: row.kind,
      amount: row.kind === "line" ? signedAmount(row.key, row.amount) : row.amount,
      compareAmount: zeigeVergleich
        ? row.kind === "line"
          ? signedAmount(row.key, vergleichRowByKey.get(row.key)?.amount ?? 0)
          : (vergleichRowByKey.get(row.key)?.amount ?? 0)
        : null,
    }));
    const csv = buildBwaCsv(rows, {
      filters: [
        {
          label: t("auswertungen.export.filterGesellschaft"),
          value: optionLabel(fGesellschaft, companyOptions),
        },
        {
          label: t("auswertungen.export.filterObjekt"),
          value: optionLabel(fObjekt, propertyOptions),
        },
        {
          label: t("auswertungen.export.filterKategorie"),
          value: optionLabel(fKategorie, categoryOptions),
        },
        { label: t("auswertungen.export.filterKonto"), value: optionLabel(fKonto, accountOptions) },
        {
          label: t("auswertungen.export.filterZeitraum"),
          value: optionLabel(zeitraum, periodOptions),
        },
      ],
      generatedAt: new Date(),
      compareLabel: zeigeVergleich ? (vergleich?.label ?? null) : null,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`kostenanalyse-${stamp}.csv`, csv);
  }

  // Both flags come from the hook that actually computes the figures, never from a hand-picked
  // subset of this page's own queries. The previous version gated loading on four of the nine
  // queries and error-handled exactly one of them, so the page rendered a complete, confident,
  // WRONG P&L while revenue and manual bookings were still in flight (measured at ~3.5s locally),
  // and silently swallowed a failure in any of the other eight into a plausible-looking total.
  if (bwa.isError) {
    return <ErrorState error={bwa.error} onRetry={() => bwa.refetch()} />;
  }

  const isLoading = bwa.isLoading;

  // Presentation grouping only. Every figure below is read off `computed`, which the shared hook
  // produced from the DATEV skeleton; nothing here recomputes an amount. See bwa-report.ts.
  const report = buildBwaReport(computed, {
    alleZeilen: !nurMitBetrag,
    compareAmountFor: (key) => (zeigeVergleich ? (vergleichRowByKey.get(key)?.amount ?? 0) : 0),
  });

  // Time buckets, built from `combined` — the very items the table and the totals are made of,
  // classified with the same two helpers the drilldown uses. No new accounting: an item lands in a
  // bucket by its own booking date and in a series by the skeleton row it already belongs to.
  const verlauf = (() => {
    const daten = combined
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
    if (daten.length === 0) return { punkte: [] as VerlaufPunkt[] };

    // Day buckets for a short window, months otherwise. A month bucket over a two-week period puts
    // everything in one bar; a day bucket over four years makes 1500 of them.
    const tage = daten.map((d) => d.item.date!).sort();
    const spanne =
      (Date.parse(`${tage[tage.length - 1]}T00:00:00Z`) - Date.parse(`${tage[0]}T00:00:00Z`)) /
      86_400_000;
    const proTag = Number.isFinite(spanne) && spanne <= 62;

    const buckets = new Map<string, VerlaufPunkt>();
    for (const { item, rowKey } of daten) {
      const k = proTag ? item.date!.slice(0, 10) : item.date!.slice(0, 7);
      let b = buckets.get(k);
      if (!b) {
        b = {
          key: k,
          label: proTag ? formatDayShort(k) : formatMonthShort(k),
          umsatz: 0,
          kosten: 0,
          ergebnis: 0,
        };
        buckets.set(k, b);
      }
      if (rowKey === "revenue") {
        b.umsatz += item.amount;
      } else if (signForRowKey(rowKey) === -1) {
        b.kosten += item.amount;
      }
      // Items that are neither revenue nor a cost line (uncategorized, not-in-P&L) are deliberately
      // in no series: they reach no result line, so putting them in a result trend would be a claim
      // the P&L itself does not make. They stay visible as footnotes under the table.
    }
    for (const b of buckets.values()) b.ergebnis = b.umsatz - b.kosten;

    const punkte = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { punkte };
  })();

  // The two buckets that are real money and reach NO line of the P&L: receipts with no category,
  // and ones deliberately kept out of it. They are not results, so they sit under the table as
  // footnotes rather than competing with the three figures at the top.
  // The uncategorized receipts themselves, not just their total. `computed.unassignedItems` carries
  // only ids and amounts; the drilldown map already holds the same items with their issuer and date,
  // so the list is built from that rather than from a second lookup.
  // Only the deliberate exclusion stays a footnote. Money with no category is not a footnote: it is
  // missing from every figure above, and it has its own section with a way to fix it.
  const zusatzZeilen = [{ key: NOT_PNL_ROW_KEY, amount: computed.excludedNotPnlAmount }].filter(
    (r) => r.amount !== 0,
  );

  // One Filter button holding all five, the same grouped-filters pattern the receipts and
  // suppliers lists use. Five loose comboboxes across the top pushed the figures below the fold and
  // gave the page two competing headers.
  const filterFelder: FilterField[] = [
    {
      kind: "select",
      key: "gesellschaft",
      label: t("auswertungen.filter.labelGesellschaft"),
      value: fGesellschaft,
      defaultValue: ALLE,
      options: companyOptions,
      onChange: setFGesellschaft,
    },
    {
      kind: "select",
      key: "objekt",
      label: t("auswertungen.filter.labelObjekt"),
      value: fObjekt,
      defaultValue: ALLE,
      options: propertyOptions,
      onChange: setFObjekt,
    },
    {
      kind: "select",
      key: "kategorie",
      label: t("auswertungen.filter.labelKategorie"),
      value: fKategorie,
      defaultValue: ALLE,
      options: categoryOptions,
      onChange: setFKategorie,
    },
    {
      kind: "select",
      key: "konto",
      label: t("auswertungen.filter.labelKonto"),
      value: fKonto,
      defaultValue: ALLE,
      options: accountOptions,
      onChange: setFKonto,
    },
    ...(config.zusatzDimension
      ? [
          {
            kind: "select" as const,
            key: config.zusatzDimension.key,
            label: t(config.zusatzDimension.labelKey),
            value: fZusatz,
            defaultValue: ALLE,
            options: [
              { value: ALLE, label: t(config.zusatzDimension.alleLabelKey) },
              ...zusatzOptionen,
            ],
            onChange: (v: string) => setSearch({ zusatz: v }),
          },
        ]
      : []),
  ];

  // Straight off the skeleton's own subtotal, like every other figure on this screen.
  const rohertrag = rowByKey.get("gross_profit")?.amount ?? 0;
  // A share of revenue. Null when there is no revenue: not 0 %, not infinity, no margin at all.
  const marge = (wert: number) => (report.revenue > 0 ? (wert / report.revenue) * 100 : null);

  // The prior period run through the SAME grouping, so a card's delta is the difference between two
  // identically-built figures rather than this screen's number minus something reconstructed by
  // hand. The hook is already fetched for the table's comparison columns; this adds no request.
  const vergleichReport = zeigeVergleich
    ? buildBwaReport(bwaVergleich.computed, { alleZeilen: false })
    : null;
  const rohertragVergleich = zeigeVergleich
    ? (vergleichRowByKey.get("gross_profit")?.amount ?? 0)
    : 0;

  /** A card's delta, or null when there is no comparable predecessor to measure against. */
  const delta = (jetzt: number, vorher: number) =>
    vergleichReport && vergleich ? { delta: jetzt - vorher, label: vergleich.label } : null;

  /**
   * The percentage, restated with the actual euro figures behind it.
   *
   * A generic worked example ("71 % means 71 € of every 100 €") teaches the arithmetic but leaves
   * the reader to apply it to their own numbers. Naming the two amounts that produced THIS
   * percentage answers the question they actually have. Undefined when there is no margin to
   * explain, which is what keeps the ⓘ off cards that show no percentage.
   */
  const margeErklaerung = (wert: number, key: string) => {
    const m = marge(wert);
    if (m == null) return undefined;
    return t(key, {
      umsatz: formatEUR(report.revenue),
      wert: formatEUR(wert),
      prozent: m.toLocaleString("de-DE", { maximumFractionDigits: 1 }),
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
            {t("auswertungen.title")}
          </h1>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("auswertungen.infoLabel")}
                className="inline-flex cursor-pointer items-center text-muted-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Info className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(26rem,90vw)] p-3">
              <p className="text-sm leading-relaxed text-foreground">
                {t("auswertungen.subtitle")}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("auswertungen.disclosure")}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {/* Order is deliberate: how the amounts are counted, then the export of exactly that, then
            the filters. The basis switch changes every figure on screen, so it reads first; Filter
            sits last because its own state is spelled out by the chips underneath rather than by
            its position. */}
        <div className="flex flex-wrap items-center gap-2">
          <BasisUmschalter
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
            disabled={isLoading || !hatDaten}
          >
            <Download className="size-4" />
            {t("auswertungen.export.csv")}
          </Button>
          <FilterPopover
            fields={filterFelder}
            labels={{
              button: t("auswertungen.filter.button"),
              title: t("auswertungen.filter.title"),
              reset: t("auswertungen.filter.zuruecksetzen"),
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
        <span className="text-sm text-muted-foreground">
          {t("auswertungen.filter.labelZeitraum")}
        </span>
        <ZeitraumPicker
          value={zeitraum}
          onValueChange={setZeitraum}
          options={periodOptions}
          // The picker defaults this to "individuell"; this screen speaks the Overview's
          // vocabulary, where the custom option is "benutzerdefiniert". Without it the option
          // selects like any other preset and the calendar never opens.
          customValue="benutzerdefiniert"
          von={von}
          bis={bis}
          onRangeApply={(vonNeu, bisNeu) => setSearch({ von: vonNeu, bis: bisNeu })}
          locale={dateLocale()}
          formatDay={(iso) => formatDate(iso)}
          backLabel={t("home.zeitraumAktion.zurueck")}
          ariaLabel={t("auswertungen.filter.labelZeitraum")}
          className="w-full sm:w-[210px]"
          rangeLabels={{
            placeholder: t("belege.list.filter.zeitraumWaehlen"),
            reset: t("belege.list.filter.zeitraumZuruecksetzen"),
            apply: t("belege.list.filter.zeitraumAnwenden"),
            previousMonth: t("belege.list.filter.monatZurueck"),
            nextMonth: t("belege.list.filter.monatVor"),
            pickSecond: t("belege.list.filter.zweitesDatum"),
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
          fields={filterFelder}
          extra={[
            {
              key: "zeitraum",
              label:
                range.von && range.bis
                  ? t("auswertungen.filter.zeitraumBereich", {
                      von: formatDate(range.von),
                      bis: formatDate(range.bis),
                    })
                  : t("auswertungen.filter.zeitraumOhneGrenze"),
              // Shown only when the period actually narrows something. Keying this off the period
              // NAME was wrong: picking "Custom range" sets the name immediately, but until two
              // dates are chosen it resolves to no bounds at all — so the chip read "All periods"
              // and still offered an ✕ that cleared nothing. The resolved range is the honest test.
              clear: range.von || range.bis ? () => setZeitraum(ALLE) : undefined,
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
        {bwa.revenueSuppressedByFilter && !isLoading && (
          <p className="mt-6 flex items-start gap-2 text-base text-amber-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("auswertungen.umsatzDurchFilterAusgeblendet", {
              count: bwa.revenueExcludedByDimensionFilter,
            })}
          </p>
        )}

        {/* Question one: what is my result. A margin is only a margin when there is revenue to
              measure it against — with none in scope the share line is left empty rather than
              printing 0 % or a division by zero. */}
        <div data-tour="analysis-figures" className="mt-6">
          <KennzahlenReihe
            laden={isLoading}
            // Explains the dashes rather than leaving four of them unaccounted for. Only raised
            // when margins were actually withheld, so it disappears the moment revenue exists.
            margenHinweis={
              !isLoading && report.revenue === 0
                ? {
                    titel: t("auswertungen.summe.margenHinweisTitel"),
                    text: t("auswertungen.summe.margenHinweisText"),
                  }
                : null
            }
            felder={[
              {
                key: "umsatz",
                label: t("auswertungen.summe.umsatz"),
                beschreibung: t("auswertungen.summe.erklaerungUmsatz"),
                icon: Wallet,
                ton: "umsatz" as const,
                value: report.revenue,
                // No margin row: revenue as a share of revenue is 100 % by definition, so the
                // card would print either a truism or, worse, a "—" implying something failed.
                vergleich: delta(report.revenue, vergleichReport?.revenue ?? 0),
              },
              {
                key: "rohertrag",
                label: t("auswertungen.zeile.gross_profit"),
                beschreibung: t("auswertungen.zeileHinweis.gross_profit"),
                icon: Layers,
                ton: "rohertrag" as const,
                value: rohertrag,
                marge: marge(rohertrag),
                margeLabel: t("auswertungen.summe.marge"),
                margeErklaerung: margeErklaerung(rohertrag, "auswertungen.summe.margeErklaerung"),
                vergleich: delta(rohertrag, rohertragVergleich),
              },
              {
                key: "kosten",
                label: t("auswertungen.summe.gesamtkosten"),
                beschreibung: t("auswertungen.summe.erklaerungGesamtkosten"),
                icon: Receipt,
                ton: "kosten" as const,
                // A positive magnitude. The label already says these are costs, so printing
                // "-37.688,98 €" under the word "Gesamtkosten" is a double negative that reads
                // as money gained. The subtraction is shown where it belongs, in the report.
                value: report.totalCosts,
                marge: marge(report.totalCosts),
                margeLabel: t("auswertungen.summe.vomUmsatz"),
                margeErklaerung: margeErklaerung(
                  report.totalCosts,
                  "auswertungen.summe.kostenanteilErklaerung",
                ),
                vergleich: delta(report.totalCosts, vergleichReport?.totalCosts ?? 0),
                // The one figure on this screen where a rise is bad news.
                richtung: "hoch_ist_schlecht",
              },
              {
                key: "ergebnis",
                label: t("auswertungen.summe.betriebsergebnis"),
                beschreibung: t("auswertungen.summe.erklaerungBetriebsergebnis"),
                icon: PieChart,
                ton: "ergebnis" as const,
                value: report.operatingResult,
                marge: marge(report.operatingResult),
                margeLabel: t("auswertungen.summe.marge"),
                margeErklaerung: margeErklaerung(
                  report.operatingResult,
                  "auswertungen.summe.margeErklaerung",
                ),
                vergleich: delta(report.operatingResult, vergleichReport?.operatingResult ?? 0),
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
              <span className="text-base font-medium text-foreground">
                {t("auswertungen.kpi.ust")}
              </span>
              <span className="text-base font-semibold tabular-nums text-foreground">
                {formatEUR(bwa.vatAmountTotal)}
              </span>
            </div>
            {/* Fixed height whether or not there is a split to show. It used to appear only once
                the totals were non-zero, so the card gained a line the moment the data landed and
                shoved everything below it down. */}
            <div className="mt-1 min-h-[1.25rem]">
              {isLoading ? (
                <Skeleton className="h-4 w-96 max-w-full" />
              ) : (
                (bwa.vatDeductibleTotal !== 0 || bwa.vatNondeductibleTotal !== 0) && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("auswertungen.kpi.ustAufteilung", {
                      deductible: formatEUR(bwa.vatDeductibleTotal),
                      nondeductible: formatEUR(bwa.vatNondeductibleTotal),
                    })}
                  </p>
                )
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("auswertungen.kpi.ustHinweisLang")}
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
                  {t("auswertungen.chart.verlaufTitel")}
                </h2>
                <Skeleton className="mt-3 h-[280px] w-full rounded-lg" />
              </section>
            ) : (
              verlauf && (
                // A tinted panel, unlike every other block on this page: the chart answers a
                // different question from the tables around it, and on a white page it read as
                // part of whatever sat above it. Tint only, no border, since the figure already
                // carries its own axes and frame.
                <section className="mt-8 rounded-xl bg-muted/30 p-4">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {t("auswertungen.chart.verlaufTitel")}
                  </h2>
                  <div className="mt-3">
                    <UmsatzKostenVerlauf punkte={verlauf.punkte} />
                  </div>
                </section>
              )
            )}

            {/* Question three: what makes them up. The unresolved-VAT flag rides along as the
                  section's own banner: it is about these very receipts, and it used to sit as a
                  grey sentence in the footnotes below, where it was read as trivia rather than as
                  something to do. */}
            <div data-tour="analysis-breakdown">
              <Aufschluesselung
                laden={isLoading}
                hinweis={
                  // No min-h any more: these sit beside the section heading now, which sets the row
                  // height on its own, so an empty row is not being reserved for them.
                  <div className="flex flex-wrap items-start gap-3 lg:justify-end">
                    <HinweisKarte
                      icon={TriangleAlert}
                      karteText={t("auswertungen.ustUngeklaert.karte", {
                        count: bwa.vatUnresolvedCount,
                        amount: formatEUR(bwa.vatUnresolvedAmount),
                      })}
                      titel={t("auswertungen.ustUngeklaert.titel")}
                      hinweis={t("auswertungen.ustUngeklaert.hinweis")}
                      amount={bwa.vatUnresolvedAmount}
                      items={bwa.vatUnresolvedItems}
                      kategorieFuer={kategoriePfadFuer}
                      onOpenBeleg={(id) => config.onOpenBeleg(id, "ust")}
                      onOpenManualBooking={() => config.onOpenManualBooking?.()}
                    />
                    <HinweisKarte
                      icon={TriangleAlert}
                      karteText={t("auswertungen.ohneKategorie.warnung", {
                        count: ohneKategorieItems.length,
                        amount: formatEUR(computed.unassignedAmount),
                      })}
                      titel={t("auswertungen.ohneKategorie.titel")}
                      hinweis={t("auswertungen.ohneKategorie.hinweis", {
                        count: ohneKategorieItems.length,
                      })}
                      amount={computed.unassignedAmount}
                      items={ohneKategorieItems}
                      // No category column: these receipts have none, which is the whole point of
                      // the card. A column of dashes would restate it once per row.
                      onOpenBeleg={(id) => config.onOpenBeleg(id, "kategorie")}
                      onOpenManualBooking={() => config.onOpenManualBooking?.()}
                    />
                  </div>
                }
                gruppen={aufschluesselungGruppen}
                kategorieFuer={kategoriePfadFuer}
                onOpenBeleg={config.onOpenBeleg}
                onOpenManualBooking={() => config.onOpenManualBooking?.()}
              />
            </div>

            {zusatzZeilen.length > 0 && (
              <section className="mt-8 border-t border-border pt-4">
                <ul className="space-y-3">
                  {zusatzZeilen.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                    >
                      <span className="text-base text-foreground">
                        <Erklaerung
                          label={t(`auswertungen.zeile.${row.key}`)}
                          erklaerung={t(`auswertungen.zeileHinweis.${row.key}`, {
                            defaultValue: "",
                          })}
                        />
                        <span className="ml-2 text-sm text-amber-700">
                          {t("auswertungen.tabelle.nichtImErgebnis")}
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
            {(bwa.notBucketedCount + bwa.revenueNotBucketedCount > 0 ||
              bwa.manualExcludedByAccountFilter + bwa.revenueExcludedByDimensionFilter > 0 ||
              bwa.revenueNetUnknownCount > 0 ||
              bwa.vatUnresolvedCount > 0 ||
              bwa.costNetUnknownCount > 0) && (
              <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                {bwa.notBucketedCount + bwa.revenueNotBucketedCount > 0 && (
                  <p>
                    {t("auswertungen.nichtEingeteilt", {
                      count: bwa.notBucketedCount + bwa.revenueNotBucketedCount,
                    })}
                  </p>
                )}
                {bwa.manualExcludedByAccountFilter + bwa.revenueExcludedByDimensionFilter > 0 && (
                  <p>
                    {t("auswertungen.kontoAusschluss", {
                      count:
                        bwa.manualExcludedByAccountFilter + bwa.revenueExcludedByDimensionFilter,
                    })}
                  </p>
                )}
                {bwa.revenueNetUnknownCount > 0 && (
                  <p>
                    {t("auswertungen.ausgangNettoUngeklaert", {
                      count: bwa.revenueNetUnknownCount,
                    })}
                  </p>
                )}
                {bwa.costNetUnknownCount > 0 && (
                  <p>
                    {t("auswertungen.kostenNettoUngeklaert", { count: bwa.costNetUnknownCount })}
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
