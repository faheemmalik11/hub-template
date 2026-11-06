import type { ReactNode } from "react";

/**
 * The property fields the shared screens read.
 *
 * Deliberately NOT the Hub's own `Objekt` type. The Hubs model a property differently: Immonetz
 * carries an archive, an ownership type, a review date and a Drive folder on the row, this client carries
 * none of them. Declaring the common core as required and the rest as optional means one screen
 * can serve both, and a Hub's own `Objekt` satisfies this structurally without any mapping.
 *
 * Every optional field is paired with a flag on `PropertiesConfig`. The flag, not the value, is
 * what the screens branch on: a Hub whose table has no `deleted_at` must not render an Archive
 * button that would silently write nothing, and `undefined` alone cannot tell "this Hub has no
 * archive" apart from "this property is not archived".
 */
export interface PropertyData {
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
export interface PropertyCompany {
  id?: string;
  code: string;
  name: string;
}

// `area` is the business line the assignment runs through; Hubs that assign straight to companies pass `null` instead.
export interface PropertyAssignment {
  id: string;
  company: PropertyCompany | null;
  area: { code: string; name: string } | null;
  /** Null means no cost centre recorded (a gap); undefined means this Hub doesn't number cost centres at all. */
  costCentre?: number | null;
}

/** What `usePropertyCompanyIndex()` hands both screens, whichever way a Hub models the relation. */
export interface PropertyCompaniesIndex {
  /**
   * Whether the underlying queries have settled.
   *
   * Separate from the property list on purpose: the list gates the table, and a property row that
   * renders before this resolves must show a skeleton in its company column, not an empty one. An
   * absent company and a company that has not arrived yet are different statements.
   */
  ready: boolean;
  /** property id -> the distinct companies it belongs to, sorted by code. */
  byProperty: Map<string, PropertyCompany[]>;
  /** property id -> one entry per assignment, for the detail page. Not deduplicated. */
  assignmentsByProperty: Map<string, PropertyAssignment[]>;
}

// The repository-specific half of the Properties screens; the screens themselves are copied byte-identical, see PORTING.md.
export interface PropertiesConfig {
  // -- Navigation. Callbacks, not route paths: the feature stays free of the router's typed tree.
  openProperty: (code: string) => void;
  openList: () => void;
  openDocument: (documentId: string) => void;
  /** The list screen with its create dialog open on `code`. */
  openNew: (code: string) => void;
  /** Consumes the `?neu=` deep link after the create dialog has taken it. */
  discardNewParam: () => void;
  openCompany?: (companyId: string) => void;
  openArea?: (areaCode: string, assignmentId: string) => void;

  /** The periodic master-data review (`properties.reviewed_at`); off hides the review badge, filter and banner outright. */
  masterDataCheck: boolean;
  /** Archiving (`properties.deleted_at` / `delete_reason`); off hides the archive/restore controls entirely. */
  archiving: boolean;
  /** False hides the Edit button: the properties are kept in step with another system. Default true. */
  editing?: boolean;
  /** Owned vs. third-party-managed property (`properties.ownership_type`). */
  ownership: boolean;
  /** The Drive folder link (`properties.drive_folder_url`). */
  driveFolder: boolean;

  /** Editable company assignments; when absent the detail page renders them read-only and shows `assignmentHint`. */
  assignmentEditor?: (property: PropertyData) => ReactNode;
  /** Said under a read-only assignment list: where the edit actually lives. */
  assignmentHint?: ReactNode;
  /** A control in the assignment card's header; absent in a Hub whose assignments are not edited on this screen. */
  assignmentAction?: (property: PropertyData) => ReactNode;
  /** The companies card. On unless a Hub says otherwise: a CRM-led client assigns no companies here. */
  companies?: boolean;
  /** The section of documents booked to this property. On unless a Hub says otherwise. */
  bookedDocuments?: boolean;
  /** Created and updated on the master data card. They are this Hub's row dates and read as the CRM's. */
  recordDates?: boolean;

  /** A field the Hub must collect when a property is CREATED, beyond the shared form. */
  createField?: {
    node: ReactNode;
    /** Blocks the Create button. The Hub is responsible for showing why on the field itself. */
    incomplete: boolean;
    /** Persist the Hub's own relation for the property just created. */
    save: (propertyId: string) => Promise<void>;
    /** Clear the control, when the dialog opens and after a successful create. */
    reset: () => void;
  };
  /** An extra card under the master data, in the left column. */
  details?: (propertyCode: string) => ReactNode;
  /** Extra card below the master data, e.g. the known-spellings list. */
  spellings?: (propertyCode: string) => ReactNode;

  /** Wraps the "back to the list" control in the Hub's own router link, so it's middle-clickable; falls back to a plain button. */
  backLink?: (props: { className: string; children: ReactNode }) => ReactNode;
}

/** The `?neu=<code>` deep link, which opens the create dialog pre-filled. */
export interface PropertiesSearch {
  new?: string;
  focus?: string;
}

export function validatePropertiesSearch(search: Record<string, unknown>): PropertiesSearch {
  return {
    new: typeof search.new === "string" && search.new ? search.new : undefined,
    focus: typeof search.focus === "string" ? search.focus : undefined,
  };
}
