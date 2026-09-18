/**
 * The workflow history rendered as a timeline. Portable — repo differences live in ./config and
 * the data assembly stays with the page (it owns the queries); this component only draws.
 */
import { ArrowUp, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatDauer } from "@/lib/data/format";
import type { BelegVerlauf } from "@/lib/data/types";

import { verlaufKommentar } from "./verlauf";
import { RUECKFRAGE_ANKER } from "@/features/invoice-detail/config";

/**
 * The workflow history as a timeline: one node per move, connected by a dashed line that ends in
 * an arrow pointing at the next node.
 *
 * The dashes and the arrow are doing real work, not decoration. Read downwards, the right-hand
 * state of each row is the left-hand state of the next, so the column is the actual path the
 * invoice took -- and a chain drawn as a chain is legible in a way that a numbered list of events
 * never was, because the numbers only ever said "these are in order", not "this became that".
 */
export function WorkflowVerlaufListe({
  zeilen,
  eingegangenAm,
  emptyText,
  t,
}: {
  zeilen: {
    v: BelegVerlauf;
    von: string;
    nach: string;
    zusatz: string | null;
    ms: number;
  }[];
  /**
   * When the invoice arrived, for the row the rail always ends on.
   *
   * The graph used to close on a small hollow dot with no label: "the state it started in",
   * which the reader had to infer. Every history starts the same way and the date is the one
   * fact about it worth having, so it is a row like any other now.
   */
  eingegangenAm?: string | null;
  emptyText: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (zeilen.length === 0) {
    return <p className="text-base text-muted-foreground">{emptyText}</p>;
  }
  // Built oldest-first (the pairs only exist in chronological order), shown newest-first:
  // the latest move is what a reader opens this card for, so it sits on top, and the rail's arrows
  // point UP -- each move feeds the newer state above it, so the drawing agrees with the reading.
  const anzeige = [...zeilen].reverse();
  return (
    <ol>
      {anzeige.map(({ v, nach, zusatz, ms }, i) => {
        const neueste = i === 0;
        const dauer = formatDauer(ms);
        // Only worth showing when it differs from the account that clicked: on an account whose
        // own name matches an approver the two are the same person and repeating it is noise.
        const handelndAls = (v.data as { handelnd_als?: string | null } | null)?.handelnd_als;
        const kommentar = verlaufKommentar(v);
        const schlecht = v.type === "ablehnung" || v.type === "zahlung_fehlgeschlagen";
        // Orange for a question, red for a move that failed, violet for everything else.
        const chipTon = schlecht
          ? "bg-red-100 text-red-800"
          : v.type === "rueckfrage"
            ? "bg-orange-100 text-orange-800"
            : "bg-violet-100 text-violet-800";
        return (
          <li
            key={v.id}
            // Anchor for the header's query badge/mark: while a query is open, this row
            // is always the newest one, since nothing can happen after it until answered.
            id={neueste && v.type === "rueckfrage" ? RUECKFRAGE_ANKER : undefined}
            className="flex gap-2"
          >
            {/* The time gutter, left of the rail: how long the segment below this node lasted --
                the wait between the two events its connector joins -- in short form, centred on
                the connector. It used to be a sentence inside the row ("17 hours"), where it read
                as a property of one event; it is a property of the gap BETWEEN two, and the rail
                is where the gap is drawn. The gutter also indents the whole timeline, giving the
                card breathing room on the left. */}
            <div className="flex w-12 shrink-0 flex-col items-end pr-1">
              <span className="mt-1 h-3.5 shrink-0" aria-hidden="true" />
              {dauer.value > 0 && (
                <span className="flex flex-1 items-center whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {t(`belege.detail.workflow.dauerKurz.${dauer.unit}`, { count: dauer.value })}
                </span>
              )}
            </div>
            {/* The rail. Every node is FILLED -- everything in a history has already happened,
                which is the same rule the ladder uses for its reached steps -- and the newest one
                carries a darker outline, marking the state the invoice is in now. The connector
                is a deliberately quiet line with the arrowhead at its top, directly under the
                node it feeds: the older move below produced the newer state above. The oldest row
                closes the graph with a stub down to a small hollow dot -- the invoice arriving --
                so its own waiting time has a segment to sit beside like every other. */}
            <div className="flex w-5 shrink-0 flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-3.5 shrink-0 rounded-full",
                  // Brand for a query too: the orange chip on the row already marks it, and a
                  // warning-coloured node made a routine question read like a failure. Red stays
                  // reserved for the moves that ARE failures (rejection, failed payment).
                  schlecht ? "bg-red-500" : "bg-brand",
                  neueste && "ring-2 ring-brand/60 ring-offset-2 ring-offset-card",
                )}
              />
              <ArrowUp
                className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              {/* One length for every connector, the oldest included. It used to end on a short
                  stub, which made the bottom segment visibly shorter than the rest and read as
                  the timeline being cut off rather than finished. The arrival row below is what
                  the rail now ends on. */}
              <span className="-mt-1 mb-1 w-0 flex-1 border-l-2 border-muted-foreground/20" />
            </div>
            <div className="min-w-0 pb-5">
              {/* The state the invoice REACHED, and the qualifier chip beside it on one line.
                  The row used to spell out the move as "reached <- came from"; the rail already
                  draws where it came from, one node below, so the words repeated the picture. */}
              <div className="w-full flex items-center gap-2">
                <p className="text-base font-medium text-foreground">{nach}</p>
                <p className="mt-0.5 flex min-h-6 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {/* Every qualifier is a chip, and any text behind it lives in the tooltip.
                      A rejection used to print its reason as an extra line under the row, which
                      made that one row a line taller than its neighbours and, because the row
                      height is what sets the connector length, gave the rail one long segment in
                      the middle of a set of short ones. A reason can run to sentences; the chip
                      says one exists and hover (or focus) reads it, exactly as the query does. */}
                  {zusatz &&
                    (kommentar ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className={cn(
                              "chip-has-reason inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                              chipTon,
                            )}
                          >
                            {zusatz}
                            {/* A visible cue that the chip carries text. Without it the tooltip was
                                undiscoverable: nothing on the row said there was a reason to read. */}
                            <Info className="size-3 shrink-0 opacity-70" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[18rem]">
                          {kommentar}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", chipTon)}>
                        {zusatz}
                      </span>
                    ))}
                  {/* A comment with no qualifier to hang on gets a chip of its own, so it is
                      reachable without adding a line to the row. */}
                  {!zusatz && kommentar && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          className={cn(
                            "chip-has-reason inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                            chipTon,
                          )}
                        >
                          {t("belege.detail.workflow.grund")}
                          {/* A visible cue that the chip carries text. Without it the tooltip was
                              undiscoverable: nothing on the row said there was a reason to read. */}
                          <Info className="size-3 shrink-0 opacity-70" aria-hidden />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[18rem]">
                        {kommentar}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </p>
              </div>

              <p className="mt-0.5 text-sm text-muted-foreground">
                {v.actor ?? t("belege.detail.actorSystem")}
                {handelndAls &&
                  ` · ${t("belege.detail.workflow.handelndAls", { name: handelndAls })}`}{" "}
                · {formatDateTime(v.created_at)}
              </p>
            </div>
          </li>
        );
      })}
      {/* Arrival, always the last row and always the same shape as the others.
          Every history starts here, so the rail ends on a labelled node with the date rather than
          on an unexplained hollow dot. No arrow and no connector below it: there is nothing older
          for one to point at. */}
      {eingegangenAm && (
        <li className="flex gap-2">
          <div className="w-12 shrink-0" aria-hidden="true" />
          <div className="flex w-5 shrink-0 flex-col items-center">
            <span className="mt-1 size-3.5 shrink-0 rounded-full bg-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">
              {t("belege.detail.historie.eingegangen")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatDateTime(eingegangenAm)}</p>
          </div>
        </li>
      )}
    </ol>
  );
}
