import type { ReactNode } from "react";

/**
 * The property fields the shared screens read.
 *
 * Deliberately NOT the Hub's own `Objekt` type. The Hubs model a property differently: Immonetz
 * carries an archive, an ownership type, a review date and a Drive folder on the row, Stäy carries
 * none of them. Declaring the common core as required and the rest as optional means one screen
 * can serve both, and a Hub's own `Objekt` satisfies this structurally without any mapping.
 *
 * Every optional field is paired with a flag on `PropertiesConfig`. The flag, not the value, is
 * what the screens branch on: a Hub whose table has no `deleted_at` must not render an Archive
 * button that would silently write nothing, and `undefined` alone cannot tell "this Hub has no
 * archive" apart from "this property is not archived".
 */
export interface ObjektDaten {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
  vat_status: string | null;
  created_at: string;
  updated_at: string;
  ownership_type?: "own" | "client" | null;
  reviewed_at?: string | null;
  deleted_at?: string | null;
  delete_reason?: string | null;
  drive_folder_url?: string | null;
}

/**
 * One company a property belongs to.
 *
 * `id` is optional because not every Hub resolves the relation through a company row it can link
 * to — where it is absent the chip is rendered without a link rather than pointing at nothing.
 */
export interface ObjektGesellschaft {
  id?: string;
  code: string;
  name: string;
}

/**
 * One recorded "this property belongs to that company" row.
 *
 * `bereich` is the business line the assignment runs through. Immonetz maps a property to a company
 * ONCE PER BUSINESS LINE (BEDO27 is PNPR's for long-term rental and IMKO's for short-term), so an
 * assignment there is meaningless without saying which line it belongs to. The other Hubs assign a
 * property straight to companies and pass `null`, which renders the row without the line.
 */
export interface ObjektZuordnung {
  id: string;
  gesellschaft: ObjektGesellschaft | null;
  bereich: { code: string; name: string } | null;
  /**
   * The cost-centre number the tax adviser books this property under IN THIS COMPANY.
   *
   * On the assignment rather than the property because the same building carries a different
   * number in each company's books. Null where the pairing has no number recorded, which is a
   * master-data gap; undefined in a Hub that does not number cost centres at all, which renders
   * nothing. The two are deliberately different states.
   */
  kostenstelle?: number | null;
}

/** What `useObjektGesellschaften()` hands both screens, whichever way a Hub models the relation. */
export interface ObjektGesellschaftenIndex {
  /**
   * Whether the underlying queries have settled.
   *
   * Separate from the property list on purpose: the list gates the table, and a property row that
   * renders before this resolves must show a skeleton in its company column, not an empty one. An
   * absent company and a company that has not arrived yet are different statements.
   */
  bereit: boolean;
  /** property id -> the distinct companies it belongs to, sorted by code. */
  byProperty: Map<string, ObjektGesellschaft[]>;
  /** property id -> one entry per assignment, for the detail page. Not deduplicated. */
  zuordnungenByProperty: Map<string, ObjektZuordnung[]>;
}

/**
 * The repository-specific half of the Objekte screens.
 *
 * Everything here is either a route target or a slot for markup only one Hub has. The screens
 * themselves never import from `@/…` and never touch the typed route tree, which is what lets the
 * folder be copied rather than adapted — see `PORTING.md`.
 */
export interface PropertiesConfig {
  // -- Navigation. Callbacks, not route paths: the feature stays free of the router's typed tree.
  oeffneObjekt: (code: string) => void;
  oeffneListe: () => void;
  oeffneBeleg: (belegId: string) => void;
  /**
   * The list screen with its create dialog open on `code`.
   *
   * This is what the detail page's "not in the master data" state offers. It used to describe the
   * route in prose and leave the reader to find it.
   */
  oeffneNeu: (code: string) => void;
  /** Consumes the `?neu=` deep link after the create dialog has taken it. */
  verwerfeNeuParam: () => void;
  oeffneGesellschaft?: (gesellschaftId: string) => void;
  oeffneBereich?: (bereichCode: string, zuordnungId: string) => void;

  // -- Which optional parts of a property this Hub has. Each one hides a whole set of controls
  // rather than rendering them against a column that does not exist. See `ObjektDaten`.

  /**
   * The periodic master-data review (`properties.reviewed_at`).
   *
   * Off hides the review badge, the review filter and the detail banner outright rather than
   * showing controls for a workflow the Hub does not run.
   */
  stammdatenPruefung: boolean;
  /**
   * Archiving (`properties.deleted_at` / `delete_reason`).
   *
   * Off hides the status filter, the archived badge, the archive/restore actions and the archived
   * banner. Without the column there is nothing to archive to and nothing to restore from.
   */
  archivierung: boolean;
  /** Eigenbestand vs. Fremdverwaltung (`properties.ownership_type`). */
  eigentum: boolean;
  /** The Drive folder link (`properties.drive_folder_url`). */
  driveOrdner: boolean;

  /**
   * The property's company assignments, editable, for Hubs that own the relation on this screen.
   *
   * When absent the detail page renders the assignments read-only and shows `zuordnungHinweis`
   * underneath — Immonetz's arrangement, where the Geschäftsbereiche screen owns the edit and two
   * screens half-managing one relation is exactly the failure being avoided.
   */
  zuordnungEditor?: (objekt: ObjektDaten) => ReactNode;
  /** Said under a read-only assignment list: where the edit actually lives. */
  zuordnungHinweis?: ReactNode;
  /**
   * A control in the assignment card's header, beside its title, such as Stäy's "Gesellschaft
   * hinzufügen". Absent in a Hub whose assignments are not edited on this screen.
   */
  zuordnungAktion?: (objekt: ObjektDaten) => ReactNode;

  /**
   * A field the Hub must collect when a property is CREATED, beyond the shared form.
   *
   * Stäy requires at least one company on every property and enforces it at creation, so leaving it
   * to a follow-up edit would let a property exist in a state that Hub treats as invalid. The Hub
   * owns the control and its state; this screen only places it, blocks Anlegen while
   * `unvollstaendig`, and calls `speichern` with the new row's id once the insert succeeds.
   */
  anlegenFeld?: {
    node: ReactNode;
    /** Blocks the Anlegen button. The Hub is responsible for showing why on the field itself. */
    unvollstaendig: boolean;
    /** Persist the Hub's own relation for the property just created. */
    speichern: (objektId: string) => Promise<void>;
    /** Clear the control, when the dialog opens and after a successful create. */
    zuruecksetzen: () => void;
  };
  /** Extra card below the master data, e.g. the known-spellings list. */
  schreibweisen?: (objektCode: string) => ReactNode;

  /**
   * Wraps the "back to the list" control in the Hub's own router link.
   *
   * The feature owns the icon, the label and the styling and passes them in; the Hub only supplies
   * the element. Without this the control falls back to a button calling `oeffneListe`, which
   * navigates correctly but cannot be middle-clicked or opened in a new tab the way a link can.
   */
  zurueckLink?: (props: { className: string; children: ReactNode }) => ReactNode;
}

/** The `?neu=<code>` deep link, which opens the create dialog pre-filled. */
export interface PropertiesSearch {
  neu?: string;
  fokus?: string;
}

export function validatePropertiesSearch(search: Record<string, unknown>): PropertiesSearch {
  return {
    neu: typeof search.neu === "string" && search.neu ? search.neu : undefined,
    fokus: typeof search.fokus === "string" ? search.fokus : undefined,
  };
}
