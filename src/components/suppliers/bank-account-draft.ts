// The model behind BankAccountDrafts. Its own file so the component file exports only a component
// (Fast Refresh), the same split filter-fields.ts / filter-popover.tsx uses.

/**
 * One bank account being typed into a form, before it exists in the database.
 *
 * `key` is client-side identity only. Without it React re-keys the list by index, and removing the
 * first of three accounts moves everyone's typed text up a row.
 */
export interface BankAccountDraft {
  key: string;
  iban: string;
  bic: string;
  bank_name: string;
  isDefault: boolean;
}

let sequentialNumber = 0;

/** A blank account. The first one added is the default, because a supplier must have exactly one. */
export function newBankAccountDraft(drafts: BankAccountDraft[]): BankAccountDraft {
  sequentialNumber += 1;
  return {
    key: `draft-${sequentialNumber}`,
    iban: "",
    bic: "",
    bank_name: "",
    isDefault: drafts.length === 0,
  };
}

/**
 * Exactly one default, always.
 *
 * Called after every change rather than trusted to the caller: "one default is a must, and only one
 * can be" is the same rule the partial unique index enforces in Postgres, and a form that can post
 * two defaults just moves the failure to the server.
 */
export function withSingleDefault(drafts: BankAccountDraft[]): BankAccountDraft[] {
  if (drafts.length === 0) return drafts;
  const firstStandard = drafts.findIndex((d) => d.isDefault);
  const winner = firstStandard === -1 ? 0 : firstStandard;
  return drafts.map((d, i) => ({ ...d, isDefault: i === winner }));
}
