/**
 * The filter model behind FilterPopover, declared as data rather than as JSX.
 *
 * Declaring filters as a list is what keeps the popover, the active count and (where a screen has
 * them) the chips from ever disagreeing about what is set. That is the same reason the receipts
 * list moved to this shape. It is also the seam a sibling hub replaces: the field list is
 * repository-specific, the popover that renders it is not.
 *
 * Its own file so `filter-popover.tsx` exports nothing but a component (Fast Refresh).
 */

import type { DateRangePickerLabels } from "@/components/data-table/date-range-picker";

/** One choosable value inside a `select` filter. */
export interface FilterOption {
  value: string;
  label: string;
}

export type FilterField =
  | {
      kind: "select";
      key: string;
      label: string;
      value: string;
      /** The value that counts as "not filtering". Anything else makes the field active. */
      defaultValue: string;
      options: FilterOption[];
      onChange: (value: string) => void;
    }
  | {
      /**
       * A period, e.g. the sync log's Zeitraum: a list of presets ("Alle", "30 Tage", "Dieser
       * Monat", ...) where one option opens a calendar instead of applying itself.
       *
       * One FIELD, not two. "From" and "to" are halves of a single question, and as two independent
       * controls they counted twice on the trigger badge and produced two chips for one range. It
       * is also the same control the receipts and supplier screens already use, so a period means
       * the same thing and looks the same everywhere in the app.
       */
      kind: "zeitraum";
      key: string;
      /** The heading above the control, e.g. "Zeitraum". */
      label: string;
      /** The chosen preset. */
      value: string;
      /** The preset that counts as "not filtering", normally ZEITRAUM_ALLE. */
      defaultValue: string;
      onChange: (value: string) => void;
      options: FilterOption[];
      /** The custom bounds, ISO `yyyy-mm-dd` or "". Only meaningful under `customValue`. */
      von: string;
      bis: string;
      /** Both ends at once. Reset sends two empty strings. */
      onRangeApply: (von: string, bis: string) => void;
      /** The option that opens the calendar rather than applying itself. */
      customValue: string;
      /**
       * Wording and locale for the calendar, passed in rather than translated here so this file
       * keeps its one useful property: no imports beyond types, and no vocabulary of its own.
       */
      rangeLabels: DateRangePickerLabels;
      locale: string;
      backLabel: string;
      placeholder: string;
      /** Renders an applied bound on the trigger. */
      formatDay: (iso: string) => string;
    }
  | {
      kind: "toggle";
      key: string;
      /** The text beside the switch, e.g. "Ohne Adresse (16)". */
      label: string;
      /**
       * The heading above the control, e.g. "Adresse", the counterpart to a select's label.
       * Without one the field is a lone box next to a labelled dropdown and the two stop lining
       * up. Falls back to `label`.
       */
      fieldLabel?: string;
      value: boolean;
      onChange: (value: boolean) => void;
    };

/** How many fields are actually narrowing the list. Drives the badge on the trigger. */
export function countActiveFilters(fields: FilterField[]): number {
  return fields.filter((f) => {
    if (f.kind === "toggle") return f.value;
    if (f.kind === "zeitraum") return f.value !== f.defaultValue;
    return f.value !== f.defaultValue;
  }).length;
}

/** Put every field back to its neutral value. */
export function clearFilters(fields: FilterField[]): void {
  for (const f of fields) {
    if (f.kind === "toggle") f.onChange(false);
    else if (f.kind === "zeitraum") {
      f.onChange(f.defaultValue);
      f.onRangeApply("", "");
    } else f.onChange(f.defaultValue);
  }
}

/** One active filter, resolved to what a chip needs to show and how to switch it off. */
export interface AktiverFilter {
  key: string;
  /** The field's name, e.g. "Gesellschaft". */
  label: string;
  /** The chosen value's own label, e.g. "IMKO". Absent for a toggle, whose label says it all. */
  valueLabel?: string;
  clear: () => void;
}

/**
 * The active fields, resolved for display as chips.
 *
 * A select stores a value, not a label, so a chip built straight off `f.value` reads "IMKO-01"
 * where the dropdown said "Immonetz Kontor GmbH". Resolving through `options` here means the chip
 * and the control it mirrors can never disagree, which is the same reason the count lives in this
 * file rather than being recomputed by each screen.
 */
export function activeFilters(fields: FilterField[]): AktiverFilter[] {
  const out: AktiverFilter[] = [];
  for (const f of fields) {
    if (f.kind === "toggle") {
      if (f.value) out.push({ key: f.key, label: f.label, clear: () => f.onChange(false) });
      continue;
    }
    if (f.kind === "zeitraum") {
      if (f.value !== f.defaultValue) {
        // A custom range names its own dates; a preset is named by its option.
        const bereich = [f.von, f.bis].filter(Boolean).map(f.formatDay).join(" - ");
        out.push({
          key: f.key,
          label: f.label,
          valueLabel:
            (f.value === f.customValue && bereich) ||
            f.options.find((o) => o.value === f.value)?.label ||
            f.value,
          clear: () => {
            f.onChange(f.defaultValue);
            f.onRangeApply("", "");
          },
        });
      }
      continue;
    }
    if (f.value === f.defaultValue) continue;
    out.push({
      key: f.key,
      label: f.label,
      valueLabel: f.options.find((o) => o.value === f.value)?.label ?? f.value,
      clear: () => f.onChange(f.defaultValue),
    });
  }
  return out;
}
