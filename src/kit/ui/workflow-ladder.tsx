import type { ComponentType, ReactNode } from "react";
import { ArrowDown } from "lucide-react";

import { cn } from "../lib/class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export interface WorkflowLadderLinkProps {
  to: string;
  className?: string;
  "aria-label"?: string;
  children?: ReactNode;
}

/**
 * A router's link, supplied by the project. The kit does not know which router is in use.
 *
 * It MUST forward its ref to the rendered anchor, so write the adapter with `forwardRef`. The
 * link is the tooltip's trigger, and Radix clones it to attach a ref of its own; a plain function
 * component drops that, costing the tooltip its anchor and logging "Function components cannot be
 * given refs". The ref stays out of this type: a project whose React types are a different copy
 * from the kit's could not pass its `forwardRef` link into a type that names the kit's `Ref`.
 */
export type WorkflowLadderLinkComponent = ComponentType<WorkflowLadderLinkProps>;

/**
 * What the circle does when someone points at it.
 *
 * - `action` moves the record to this step. It is the one the reader is being invited to take, so
 *   it also gets the arrow above it.
 * - `correction` sets this step directly, ignoring the chain. For an administrator.
 * - `link` cannot be set here at all, but another screen produces it.
 * - `blocked` is a step ahead this person cannot take, and says why.
 * - `plain` is everything else: a step already passed, or one simply not reachable yet.
 */
export type WorkflowStepInteraction =
  | { kind: "plain" }
  | { kind: "action"; hint: string; onSelect: () => void }
  | { kind: "correction"; hint: string; onSelect: () => void }
  | { kind: "link"; to: string; linkLabel: string; reason?: string }
  | { kind: "blocked"; reason: string };

export interface WorkflowLadderStep {
  /** Stable key. */
  id: string;
  label: string;
  /** Already passed, or the one the record sits on. Draws a filled circle. */
  reached: boolean;
  current: boolean;
  /**
   * This step lies between where the record is and the step it can be moved to.
   *
   * Draws the connector leaving it as a dotted line. Every segment along that run is marked, not
   * only the first: an approval that lands two nodes along would otherwise point at a circle
   * nobody can click.
   */
  onPath?: boolean;
  interaction: WorkflowStepInteraction;
  /** How long the record has sat here. Rendered under the label of the current step only. */
  since?: string;
  /** A mark beside the label, e.g. an open query holding this step up. */
  note?: {
    icon: ComponentType<{ className?: string }>;
    /** The whole tooltip, and the accessible/click label. One line: this is a mark, not a place to read a comment. */
    label: string;
    /** Where the click goes, e.g. into the history tab that has the full story. */
    onClick: () => void;
  };
}

/**
 * Which classes a walked step wears.
 *
 * Not a kit decision: on a hub whose brand IS a green, walked steps keep the brand colour, and a
 * second green beside it would read as two mismatched greens. Brand stays the colour of the
 * clickable next step either way.
 */
export interface WorkflowLadderTheme {
  /** Border and fill of a reached circle. */
  circle: string;
  /** The extra outline marking where the record actually is. */
  currentRing: string;
  /** The connector between two reached steps. */
  line: string;
}

const CIRCLE = "relative grid size-7 shrink-0 place-items-center rounded-full border-2";
// A 20px circle has to stay small to sit on a line. The thing you aim at does not, so every
// interactive circle carries an invisible inset-2 pad around it.
const HIT_AREA = "before:absolute before:-inset-2 before:content-['']";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/**
 * A record's lifecycle as one line, where the line is also the control.
 *
 * Every step, its state and its behaviour are decided by the caller and passed in, so this knows
 * nothing about approvals, permissions or what any step means. It draws circles, connectors and
 * labels, and calls back when one is chosen.
 */
export function WorkflowLadder({
  steps,
  theme,
  ariaLabel,
  LinkComponent,
  disabled = false,
  className,
}: {
  steps: WorkflowLadderStep[];
  theme: WorkflowLadderTheme;
  /** Names the whole bar for a screen reader. */
  ariaLabel: string;
  /** Required only when a step uses the `link` interaction. */
  LinkComponent?: WorkflowLadderLinkComponent;
  /** Turns off every control while a write is in flight. */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ol
      // The horizontal padding is half a label's width: the first and last labels are centred on
      // circles sitting at the very ends, so without it they would hang off the card.
      className={cn("flex w-full items-start px-2 sm:px-[4.5rem]", className)}
      aria-label={ariaLabel}
    >
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const nextReached = !last && steps[index + 1].reached;
        return (
          <li
            key={step.id}
            aria-current={step.current ? "step" : undefined}
            className={cn("flex min-w-0 flex-col", last ? "shrink-0" : "flex-1")}
          >
            {/* Reserved whether or not an arrow sits in it, so the row of circles keeps one
                baseline as the available step moves along the chain. */}
            <div className="flex h-4 w-7 items-end justify-center">
              {step.interaction.kind === "action" && (
                <ArrowDown
                  className="size-3.5 animate-bounce text-brand motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </div>

            <div className="flex items-center">
              <StepCircle
                step={step}
                theme={theme}
                disabled={disabled}
                LinkComponent={LinkComponent}
              />
              {!last && (
                <span
                  className={cn(
                    "mx-1 flex-1 border-t-2",
                    nextReached
                      ? theme.line
                      : // The dotted path-ahead stays brand: it marks where a CLICK can take the
                        // record, which is what brand means on this bar.
                        step.onPath
                        ? "border-dotted border-brand"
                        : "border-border",
                  )}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Centred on its own circle. `left-3.5` is that circle's centre, and the half-width
                translate hangs the fixed-width block off that point, so every label sits under the
                thing it names rather than starting at it.

                Absolutely positioned on purpose: a 9rem block in normal flow would fight the flex
                track it sits in and stretch its own step. Out of flow it cannot, which is why the
                wrapper reserves the height instead. */}
            <div className="relative mt-2 h-0 sm:h-20">
              <div
                className={cn(
                  "absolute left-3.5 hidden w-36 -translate-x-1/2 text-center text-base leading-tight sm:block",
                  step.current
                    ? "font-medium text-foreground"
                    : step.interaction.kind === "action"
                      ? "font-medium text-brand-dark"
                      : "text-muted-foreground",
                )}
              >
                <div className="break-words">
                  {step.label}
                  {step.current && step.note && <StepNote note={step.note} />}
                </div>
                {step.current && step.since && (
                  <div className="truncate text-sm text-muted-foreground">{step.since}</div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepCircle({
  step,
  theme,
  disabled,
  LinkComponent,
}: {
  step: WorkflowLadderStep;
  theme: WorkflowLadderTheme;
  disabled: boolean;
  LinkComponent?: WorkflowLadderLinkComponent;
}) {
  const { interaction, label } = step;
  // Done is a filled circle, not yet done an empty one.
  const restingFill = step.reached ? theme.circle : "border-border bg-background";

  if (interaction.kind === "action") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={interaction.onSelect}
            aria-label={interaction.hint}
            className={cn(
              CIRCLE,
              HIT_AREA,
              FOCUS,
              "cursor-pointer border-brand bg-background transition-colors hover:bg-brand focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top">{interaction.hint}</TooltipContent>
      </Tooltip>
    );
  }

  if (interaction.kind === "correction") {
    // Keeps the ladder's own reached/unreached fill rather than turning into a row of buttons.
    // This is still the chain, it is just all reachable now, so it adds only what says
    // "clickable": a pointer, a hover ring and the same oversized hit area.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={interaction.onSelect}
            aria-label={`${label}: ${interaction.hint}`}
            className={cn(
              CIRCLE,
              HIT_AREA,
              FOCUS,
              "cursor-pointer transition hover:ring-2 hover:ring-brand/40 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
              restingFill,
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="font-medium">{label}</div>
          <div className="mt-1 text-sm opacity-80">{interaction.hint}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (interaction.kind === "link" && LinkComponent) {
    // A dead circle over a blocked step that HAS somewhere to go is a wasted click. This one
    // navigates, and the tooltip says both what sets the step and where the click leads.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <LinkComponent
            to={interaction.to}
            aria-label={`${label}: ${interaction.linkLabel}`}
            className={cn(
              CIRCLE,
              HIT_AREA,
              FOCUS,
              "cursor-pointer border-border bg-background transition-colors hover:border-brand hover:bg-brand/20 focus-visible:ring-brand",
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="font-medium">{label}</div>
          {interaction.reason && <div className="text-sm opacity-80">{interaction.reason}</div>}
          <div className="mt-1 text-sm font-medium">{interaction.linkLabel}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (interaction.kind === "blocked") {
    // Not a disabled button: a disabled button swallows its own hover events in every browser, so
    // the reason would never appear. A focusable span keeps the cursor, the tooltip and the
    // keyboard route to the same explanation.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="note"
            aria-label={`${label}: ${interaction.reason}`}
            className={cn(
              CIRCLE,
              HIT_AREA,
              FOCUS,
              "cursor-not-allowed border-border bg-background focus-visible:ring-muted-foreground/40",
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="font-medium">{label}</div>
          <div className="text-sm opacity-80">{interaction.reason}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span
      className={cn(
        CIRCLE,
        "cursor-default",
        restingFill,
        // Where the record IS: the same fill with one extra outline around it. Static, because it
        // marks a place rather than raising an alarm.
        step.current && theme.currentRing,
      )}
      aria-hidden="true"
    />
  );
}

function StepNote({ note }: { note: NonNullable<WorkflowLadderStep["note"]> }) {
  const Icon = note.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={note.onClick}
          aria-label={note.label}
          className="ml-1 inline-flex cursor-pointer align-text-bottom text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[18rem]">
        {note.label}
      </TooltipContent>
    </Tooltip>
  );
}
