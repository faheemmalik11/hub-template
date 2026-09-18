import { useState } from "react";
import {
  Banknote,
  ChevronRight,
  Building2,
  Car,
  FileText,
  Landmark,
  MoreHorizontal,
  Package,
  Plane,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  Users,
  Wrench,
} from "lucide-react";

import { useInfiniteRows } from "./use-infinite-rows";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  cn,
  formatDate,
  formatEUR,
  useTranslation,
} from "../adapter";
import type { BwaScopeItem } from "../adapter";

/**
 * Where a receipt is filed, as a path.
 *
 * Always the category; the sub-category only when the receipt actually carries one. Showing the
 * leaf alone was ambiguous — "Geschenke" and "Werbe- / Reisekosten" look like the same kind of
 * thing until you know one is a child of the other — and showing a bare "no sub-category" for the
 * majority answered a question nobody asked instead of naming where the money went.
 */
export interface Kategoriepfad {
  kategorie: string;
  /** Absent when the receipt is filed on the top-level category itself. */
  unterkategorie?: string;
}

export interface AufschluesselungZeile {
  key: string;
  label: string;
  /** Positive magnitude. The sign lives in the label ("costs"), not in the number. */
  amount: number;
  items: BwaScopeItem[];
}

export interface AufschluesselungGruppe {
  key: string;
  label: string;
  /**
   * Qualifier beside the heading, e.g. "by sub-category". The two groups do not list the same
   * LEVEL — one is DATEV lines, the other the sub-categories of a single line — and a reader
   * comparing them is owed that in the heading rather than left to infer it.
   */
  untertitel?: string;
  zeilen: AufschluesselungZeile[];
  /** Sum of the group's own lines, used for the share column and the footer. */
  summe: number;
  /**
   * Style for rows whose key is not a DATEV row key. `ZEILEN_STIL` is keyed by row key, so a group
   * listing sub-categories (whose keys are ids) would otherwise render every row in the grey
   * fallback and look unstyled.
   */
  stilKey?: string;
}

/**
 * An icon and a colour per DATEV cost line.
 *
 * Keyed by row key, so a category cannot silently pick up a neighbour's colour when the sort order
 * changes — the ranking here is by amount and moves month to month, and a palette assigned by
 * position would repaint the whole table every time the biggest cost changed.
 *
 * The tint is identity only. Nothing here means "good" or "bad": the biggest cost line is not a
 * warning, it is just the biggest, and colouring it red would say otherwise.
 */
// `bar` is spelled out rather than derived from `tile`: Tailwind scans source for complete class
// names, so a computed "bg-violet-100".replace("100","400") produces a class that was never
// generated and the bar renders transparent.
const ZEILEN_STIL: Record<string, { icon: typeof Plane; tile: string; text: string; bar: string }> =
  {
    advertising_travel: {
      icon: Plane,
      tile: "bg-violet-100",
      text: "text-violet-700",
      bar: "bg-violet-400",
    },
    vehicle: { icon: Car, tile: "bg-orange-100", text: "text-orange-700", bar: "bg-orange-400" },
    cogs_sold: {
      icon: ShoppingCart,
      tile: "bg-amber-100",
      text: "text-amber-700",
      bar: "bg-amber-400",
    },
    insurance: {
      icon: ShieldCheck,
      tile: "bg-emerald-100",
      text: "text-emerald-700",
      bar: "bg-emerald-400",
    },
    other_costs: {
      icon: MoreHorizontal,
      tile: "bg-slate-100",
      text: "text-slate-600",
      bar: "bg-slate-400",
    },
    depreciation: {
      icon: TrendingDown,
      tile: "bg-rose-100",
      text: "text-rose-700",
      bar: "bg-rose-400",
    },
    business_tax: {
      icon: Landmark,
      tile: "bg-teal-100",
      text: "text-teal-700",
      bar: "bg-teal-400",
    },
    occupancy: { icon: Building2, tile: "bg-sky-100", text: "text-sky-700", bar: "bg-sky-400" },
    repair_maintenance: {
      icon: Wrench,
      tile: "bg-fuchsia-100",
      text: "text-fuchsia-700",
      bar: "bg-fuchsia-400",
    },
    personnel: {
      icon: Users,
      tile: "bg-indigo-100",
      text: "text-indigo-700",
      bar: "bg-indigo-400",
    },
    cogs_material: {
      icon: Package,
      tile: "bg-cyan-100",
      text: "text-cyan-700",
      bar: "bg-cyan-400",
    },
  };
const STANDARD_STIL = {
  icon: Banknote,
  tile: "bg-muted",
  text: "text-muted-foreground",
  bar: "bg-muted-foreground/40",
};

/**
 * The row highlight, carried by the CELLS rather than the row.
 *
 * A background on the <tr> spans the table edge to edge and cannot take a border radius, so the
 * first and last values sat flush against the ends of the band. On the cells it can round its ends,
 * and the outer cells' own padding keeps the content clear of them.
 */
const HOVER = "transition-colors group-hover:bg-muted/60";

/** Rows before the entries table starts loading more, and how many it appends each time. */
const ERSTE_SEITE = 12;
const NACHLADEN = 25;

/**
 * The entries behind one category, as a scrolling table.
 *
 * Paged rather than complete: a real month of a real company puts hundreds of receipts on a single
 * cost line, and rendering all of them the moment somebody clicks a chevron would freeze the pane.
 * The sentinel row appends the next batch as it comes into view.
 */
export function EintraegeTabelle({
  items,
  kategorieFuer,
  onOpenBeleg,
  onOpenManualBooking,
}: {
  items: BwaScopeItem[];
  kategorieFuer?: (item: BwaScopeItem) => Kategoriepfad | null;
  onOpenBeleg: (id: string) => void;
  onOpenManualBooking: () => void;
}) {
  const { t } = useTranslation();
  const { sichtbar, sentinel, hatMehr, rest } = useInfiniteRows(items, ERSTE_SEITE, NACHLADEN);

  return (
    <div className="max-h-[28rem] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pl-3 pr-3 font-normal">
              {t("auswertungen.aufschluesselung.spalteBeleg")}
            </th>
            {kategorieFuer && (
              <th className="py-2 pr-2 font-normal">{t("auswertungen.filter.labelKategorie")}</th>
            )}
            <th className="py-2 pr-2 font-normal">
              {t("auswertungen.aufschluesselung.spalteDatum")}
            </th>
            <th className="py-2 pl-2 pr-3 text-right font-normal">
              {t("auswertungen.aufschluesselung.spalteBetrag")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, sichtbar).map((item, idx) => {
            const clickable = !!item.belegId || !!item.manualBookingSourceId;
            const pfad = kategorieFuer?.(item) ?? null;
            const open = () => {
              if (item.belegId) onOpenBeleg(item.belegId);
              else if (item.manualBookingSourceId) onOpenManualBooking();
            };
            return (
              <tr
                // idx is always part of the key: ONE recurring manual booking expands to one item
                // per month, all sharing the same source_id.
                key={`${item.belegId ?? item.outgoingInvoiceId ?? item.manualBookingSourceId ?? "item"}-${idx}`}
                className={cn(
                  "border-t border-border/60",
                  clickable && "cursor-pointer hover:bg-muted/60",
                )}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? open : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open();
                        }
                      }
                    : undefined
                }
              >
                <td className="py-2.5 pl-3 pr-3 text-foreground">{item.label}</td>
                {kategorieFuer && (
                  <td className="py-2 pr-2">
                    {/* The fine category the receipt actually carries. The row above it is the DATEV
                        LINE, which is a coarser bucket — "Advertising / travel" can hold several
                        distinct categories, and without this the reader cannot tell which. */}
                    {!pfad ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
                        <span>{pfad.kategorie}</span>
                        {pfad.unterkategorie && (
                          <>
                            <ChevronRight aria-hidden className="size-3 shrink-0 opacity-60" />
                            <span className="text-foreground">{pfad.unterkategorie}</span>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                )}
                <td className="py-2 pr-2 text-muted-foreground">
                  {item.date ? formatDate(item.date) : "—"}
                </td>
                <td className="py-2.5 pl-2 pr-3 text-right tabular-nums text-foreground">
                  {formatEUR(item.amount)}
                </td>
              </tr>
            );
          })}
          {hatMehr && (
            <tr ref={sentinel as React.RefObject<HTMLTableRowElement>}>
              <td colSpan={kategorieFuer ? 4 : 3} className="py-2 text-sm text-muted-foreground">
                {t("auswertungen.belegListe.weitere", { count: rest })}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Column widths, shared by a group's rows table and its separate totals table.
 *
 * They have to be a <colgroup> rather than per-cell classes because the totals are no longer in the
 * rows table's own <tfoot>: a tfoot sits directly under the last row, so the short group's total
 * floated near the top while the long group's sat ten rows down. Two tables let the total be pushed
 * to the bottom of the grid cell; explicit widths are what keeps their columns in line.
 */
function Spalten() {
  return (
    <colgroup>
      <col />
      <col className="w-28 sm:w-32" />
      <col className="w-16 sm:w-48" />
      <col className="w-14 sm:w-20" />
    </colgroup>
  );
}

/**
 * One group's categories, as a table.
 *
 * Both groups render this, side by side, rather than one of them hiding behind a tab. Materials &
 * goods is a single DATEV line — a tab holding one row that always read "100 %" of itself was a
 * click to reach a foregone conclusion, and it left half the section empty while it was closed.
 * Side by side, the two are also directly comparable, which is the actual question ("how much of
 * what we spend is materials?").
 */
function GruppenTabelle({
  gruppe,
  gesamtkosten,
  laden,
  onOeffnen,
}: {
  gruppe: AufschluesselungGruppe;
  /** Denominator for the share column: ALL costs, both groups. */
  gesamtkosten: number;
  laden?: boolean;
  onOeffnen: (zeile: AufschluesselungZeile) => void;
}) {
  const { t } = useTranslation();
  const anzahlGesamt = gruppe.zeilen.reduce((n, z) => n + z.items.length, 0);

  return (
    // Full height + mt-auto on the totals: both groups' totals then land on one line at the bottom
    // of the grid, however many rows each has.
    <div className="flex h-full min-w-0 flex-col">
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-foreground">
        {gruppe.label}
        {gruppe.untertitel && (
          <span className="text-sm font-normal text-muted-foreground">{gruppe.untertitel}</span>
        )}
      </h3>
      <table className="mt-2 w-full text-sm">
        <Spalten />
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pl-3 pr-2 font-normal">
              {t("auswertungen.aufschluesselung.spalteKategorie")}
            </th>
            <th className="py-2 pl-2 pr-3 text-right font-normal sm:pr-8">
              {t("auswertungen.spalte.betrag")}
            </th>
            <th className="py-2 pl-2 text-left font-normal">
              {t("auswertungen.aufschluesselung.spalteAnteil")}
            </th>
            <th className="py-2 pl-2 pr-3 text-right font-normal">
              {t("auswertungen.aufschluesselung.spalteAnzahl")}
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Placeholder rows ONLY where even the row list is unknown yet. The operating group's
              ten DATEV lines are known before any data arrives, so those rows render for real and
              just their figures wait, which is what stops the table changing height. */}
          {laden &&
            gruppe.zeilen.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`laden-${i}`} className="border-t border-border/60">
                <td className="py-2 pl-3 pr-2">
                  <span className="flex items-center gap-2">
                    <Skeleton className="hidden size-6 shrink-0 rounded-md sm:block" />
                    <Skeleton className="h-4 w-40" />
                  </span>
                </td>
                <td className="py-2 pl-2 pr-3 sm:pr-8">
                  <Skeleton className="ml-auto h-4 w-20" />
                </td>
                <td className="py-2 pl-2">
                  <span className="flex items-center gap-2.5">
                    <Skeleton className="hidden h-2.5 w-24 shrink-0 rounded-full sm:block" />
                    <Skeleton className="h-4 w-10 shrink-0" />
                  </span>
                </td>
                <td className="py-2 pl-2 pr-3">
                  <Skeleton className="ml-auto h-4 w-6" />
                </td>
              </tr>
            ))}
          {gruppe.zeilen.map((z) => {
            const anteil = gesamtkosten > 0 ? (z.amount / gesamtkosten) * 100 : null;
            const stil =
              ZEILEN_STIL[z.key] ??
              (gruppe.stilKey ? ZEILEN_STIL[gruppe.stilKey] : undefined) ??
              STANDARD_STIL;
            const Icon = stil.icon;
            // A row with nothing behind it opens nothing. Left clickable it would have offered a
            // dialog whose only content is "no entries", which is the row already telling you that.
            const anklickbar = !laden && z.items.length > 0;
            return (
              <tr
                key={z.key}
                role={anklickbar ? "button" : undefined}
                tabIndex={anklickbar ? 0 : undefined}
                onClick={anklickbar ? () => onOeffnen(z) : undefined}
                onKeyDown={
                  anklickbar
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOeffnen(z);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "group border-t border-border/60",
                  anklickbar ? "cursor-pointer" : "text-muted-foreground",
                )}
              >
                <td className={cn("py-2 pl-3 pr-2", anklickbar && HOVER, "rounded-l-md")}>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "hidden size-6 shrink-0 items-center justify-center rounded-md sm:flex",
                        stil.tile,
                        !anklickbar && "opacity-50",
                      )}
                    >
                      <Icon className={cn("size-3.5", stil.text)} />
                    </span>
                    <span className={cn("min-w-0", anklickbar && "text-foreground")}>
                      {z.label}
                    </span>
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 pl-2 pr-3 text-right font-medium tabular-nums sm:pr-8",
                    anklickbar && "text-foreground",
                    anklickbar && HOVER,
                  )}
                >
                  {formatEUR(z.amount)}
                </td>
                <td className={cn("py-2 pl-2 text-muted-foreground", anklickbar && HOVER)}>
                  {anteil == null ? (
                    "—"
                  ) : (
                    // Track left-aligned and the same width on every row, so the bars form one
                    // column the eye can run down. Right-aligned beside a percentage of varying
                    // width, each bar started at a different x and the ranking was unreadable.
                    // The number keeps a fixed box of its own so the digits still line up.
                    <span className="flex items-center gap-2.5">
                      <span className="hidden h-2.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                        <span
                          className={cn("block h-full rounded-full", stil.bar)}
                          // A floor of 1.5 %, or a category worth 0,4 % draws nothing at all and
                          // reads as missing rather than small.
                          style={{ width: `${Math.max(anteil, 1.5)}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums">
                        {anteil.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %
                      </span>
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    "py-2 pl-2 pr-3 text-right tabular-nums text-muted-foreground",
                    anklickbar && HOVER,
                    "rounded-r-md",
                  )}
                >
                  {z.items.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="mt-auto w-full text-sm">
        <Spalten />
        <tbody>
          <tr className="border-t border-foreground/25 font-medium">
            <td className="py-2 pl-3 pr-2 text-foreground">
              {t("auswertungen.aufschluesselung.summe", { gruppe: gruppe.label })}
            </td>
            <td className="py-2 pl-2 pr-3 text-right tabular-nums text-foreground sm:pr-8">
              {laden ? <Skeleton className="ml-auto h-4 w-24" /> : formatEUR(gruppe.summe)}
            </td>
            <td className="py-2 pl-2 text-muted-foreground">
              <span className="flex items-center gap-2.5">
                <span className="hidden w-24 shrink-0 sm:block" aria-hidden />
                <span className="w-14 shrink-0 text-right tabular-nums">
                  {gesamtkosten > 0
                    ? `${((gruppe.summe / gesamtkosten) * 100).toLocaleString("de-DE", {
                        maximumFractionDigits: 1,
                      })} %`
                    : "—"}
                </span>
              </span>
            </td>
            <td className="py-2 pl-2 pr-3 text-right tabular-nums text-muted-foreground">
              {anzahlGesamt}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * The cost side, as something you can walk into: every category on the page at once, and the
 * receipts behind one of them in a dialog.
 *
 * Replaces the DATEV calculation table that used to fill this section. That table answered "how
 * does the result arithmetic work"; this answers "where did the money go", which is the question
 * the client actually opens this screen with. The calculation itself has not gone anywhere — the
 * four cards above state revenue, gross profit, costs and result, and the CSV export still writes
 * the full 26-line skeleton line for line for comparison against a real BWA.
 *
 * The entries open in a dialog rather than a side pane. A pane cost half the section's width
 * permanently to something that is empty until a row is clicked, and it forced the two groups to
 * share the remaining half through tabs. In a dialog the entry table also gets the room its four
 * columns want, which the pane never had.
 *
 * No period control of its own: the period is set once at the top of the screen and scopes
 * everything, including this.
 */
export function Aufschluesselung({
  gruppen,
  hinweis,
  laden,
  kategorieFuer,
  onOpenBeleg,
  onOpenManualBooking,
}: {
  gruppen: AufschluesselungGruppe[];
  /** Still fetching: headings and columns render, the cells carry placeholders. */
  laden?: boolean;
  /** e.g. the "still need VAT deductibility" banner. Rendered above the tables. */
  hinweis?: React.ReactNode;
  /** The receipt's own category, shown per entry. Null where it carries none. */
  kategorieFuer?: (item: BwaScopeItem) => Kategoriepfad | null;
  onOpenBeleg: (id: string) => void;
  onOpenManualBooking: () => void;
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState<AufschluesselungZeile | null>(null);

  // Every share on this screen is measured against the SAME denominator: all costs, both groups.
  // Measured within one group instead, "Materials & goods" was a single row reading 100 %, which is
  // true of its own group and says nothing — the reader wants to know how big materials are against
  // everything they spend.
  const gesamtkosten = gruppen.reduce((n, g) => n + g.summe, 0);
  const stil = (offen && ZEILEN_STIL[offen.key]) || STANDARD_STIL;
  const OffenIcon = stil.icon;

  if (gruppen.length === 0 && !laden) return null;

  return (
    // mt-8 so the heading is not read as a caption on the chart panel that ends just above it.
    <section className="mt-8">
      {/* Heading and disclosures share one row. The cards used to sit on their own line beneath
          the subtitle, which pushed the tables a card's height down the page and left a wide empty
          band between this heading and the group headings it introduces. Beside it they use space
          that was empty anyway, and the tables start directly under the heading they belong to. */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t("auswertungen.tabelle.titel")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("auswertungen.aufschluesselung.untertitel")}
          </p>
        </div>
        {hinweis && <div className="min-w-0 lg:max-w-[60%]">{hinweis}</div>}
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {gruppen.map((g) => (
          <GruppenTabelle key={g.key} gruppe={g} gesamtkosten={gesamtkosten} onOeffnen={setOffen} />
        ))}
      </div>

      {/* Names the denominator. Without it a group footer reading "83,6 %" is a share of something
          the reader cannot see. */}
      {gruppen.length > 1 && (
        <p className="mt-4 flex items-baseline justify-end gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
          <span>{t("auswertungen.aufschluesselung.gesamtkosten")}</span>
          <span className="text-base font-semibold tabular-nums text-foreground">
            {formatEUR(gesamtkosten)}
          </span>
        </p>
      )}

      <Dialog open={!!offen} onOpenChange={(o) => !o && setOffen(null)}>
        <DialogContent className="max-w-3xl gap-0 p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="flex flex-wrap items-center gap-x-3 gap-y-2 pr-8 text-left">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  stil.tile,
                )}
              >
                <OffenIcon className={cn("size-4", stil.text)} />
              </span>
              <span className="text-base font-semibold text-foreground">{offen?.label}</span>
              <span
                className="text-xl font-semibold tabular-nums text-foreground"
                title={t("auswertungen.aufschluesselung.gesamtbetrag")}
              >
                {formatEUR(offen?.amount ?? 0)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-sm font-normal text-muted-foreground">
                <FileText className="size-3.5" />
                {t("auswertungen.aufschluesselung.anzahl", { count: offen?.items.length ?? 0 })}
              </span>
            </DialogTitle>
          </DialogHeader>

          {offen && offen.items.length > 0 ? (
            <EintraegeTabelle
              items={offen.items}
              kategorieFuer={kategorieFuer}
              onOpenBeleg={onOpenBeleg}
              onOpenManualBooking={onOpenManualBooking}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("auswertungen.aufschluesselung.keineEintraege")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
