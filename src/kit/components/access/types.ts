/** One grantable thing, as the catalogue describes it. */
export interface AccessPermission {
  key: string;
  /** Groups rows under a heading. Free text — the host maps it to a label. */
  category: string;
  label: string;
  description?: string | null;
}

/** A role, as a column in the matrix. */
export interface AccessRole {
  id: string;
  label: string;
}

/** Called when a box is ticked or cleared. Rejections should surface as a toast by the host. */
export type AccessToggle = (key: string, next: boolean) => void;
