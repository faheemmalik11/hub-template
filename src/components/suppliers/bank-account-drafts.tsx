import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  newBankAccountDraft,
  withSingleDefault,
  type BankAccountDraft,
} from "@/components/suppliers/bank-account-draft";

/**
 * The bank accounts half of a supplier form: none, one, or several, with one marked as the default.
 *
 * Separate from the supplier's own fields because they are separate things. IBAN, BIC and bank name
 * used to sit in the middle of the supplier grid as three loose fields, which could describe exactly
 * one account and gave no way to say "this supplier also bills from that one".
 *
 * Portable: labels and validation both arrive as props, so nothing here knows which hub it is in.
 */
export function BankAccountDrafts({
  drafts,
  onChange,
  labels,
  isPayable,
  className,
}: {
  drafts: BankAccountDraft[];
  onChange: (drafts: BankAccountDraft[]) => void;
  labels: {
    section: string;
    hint: string;
    add: string;
    iban: string;
    bic: string;
    bank: string;
    makeDefault: string;
    isDefault: string;
    remove: string;
    invalidIban: string;
    accountNumber: (index: number) => string;
  };
  /** The host's IBAN rule. A draft is flagged only once something has been typed into it. */
  isPayable: (iban: string) => boolean;
  className?: string;
}) {
  const setDraft = (key: string, patch: Partial<BankAccountDraft>) =>
    onChange(withSingleDefault(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d))));

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.section}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => onChange(withSingleDefault([...drafts, newBankAccountDraft(drafts)]))}
        >
          <Plus className="size-3.5" /> {labels.add}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{labels.hint}</p>

      {drafts.map((draft, index) => {
        const invalid = draft.iban.trim() !== "" && !isPayable(draft.iban);
        return (
          <div key={draft.key} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {labels.accountNumber(index + 1)}
              </span>
              <div className="flex items-center gap-2">
                {/* A radio, not a checkbox: exactly one of the group can be on, which is the rule
                    itself rather than something the surrounding code has to keep true. */}
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="bank-account-default"
                    className="size-3.5 cursor-pointer"
                    checked={draft.isDefault}
                    onChange={() => setDraft(draft.key, { isDefault: true })}
                  />
                  {draft.isDefault ? labels.isDefault : labels.makeDefault}
                </label>
                {/* Removing the default promotes whatever is left, so the form never sits in a
                    state that cannot be saved. */}
                <button
                  type="button"
                  aria-label={labels.remove}
                  className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                  onClick={() =>
                    onChange(withSingleDefault(drafts.filter((d) => d.key !== draft.key)))
                  }
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs text-muted-foreground">
                  {labels.iban} <span aria-hidden="true">*</span>
                </Label>
                <Input
                  value={draft.iban}
                  onChange={(e) => setDraft(draft.key, { iban: e.target.value })}
                  className={invalid ? "border-destructive" : undefined}
                  aria-invalid={invalid || undefined}
                />
                {invalid && <p className="text-xs text-destructive">{labels.invalidIban}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{labels.bic}</Label>
                <Input
                  value={draft.bic}
                  onChange={(e) => setDraft(draft.key, { bic: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{labels.bank}</Label>
                <Input
                  value={draft.bank_name}
                  onChange={(e) => setDraft(draft.key, { bank_name: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
