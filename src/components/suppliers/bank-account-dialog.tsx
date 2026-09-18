import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compactIBAN, isPayableIBAN } from "@/lib/data/format";
import { cn } from "@/lib/utils";

export type BankAccountDialogLabels = {
  title: string;
  iban: string;
  bic: string;
  bank: string;
  cancel: string;
  save: string;
  invalidIban: string;
  duplicateIban: string;
};

/**
 * Add a bank account to a supplier: IBAN required, BIC and bank name optional.
 *
 * One dialog for both places a person can add an account, the supplier's own screen and the
 * invoice that turned out to have none, so the two can never drift into disagreeing about what a
 * valid IBAN is or what happens when you type one twice.
 *
 * The IBAN is checked while it is being typed rather than only on submit: an IBAN is long enough
 * that learning it was mistyped after a round trip means re-reading all of it.
 */
export function BankAccountDialog({
  open,
  onOpenChange,
  existingIbans,
  labels,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accounts already on this supplier, compacted, so the same account is not added twice. */
  existingIbans: string[];
  labels: BankAccountDialogLabels;
  saving?: boolean;
  /** The host stores it, reports success, and closes the dialog. */
  onSave: (input: { iban: string; bic: string | null; bank_name: string | null }) => void;
}) {
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");

  useEffect(() => {
    if (!open) {
      setIban("");
      setBic("");
      setBankName("");
    }
  }, [open]);

  const compact = compactIBAN(iban);
  const malformed = iban.trim() !== "" && !isPayableIBAN(iban);
  const duplicate = !malformed && compact !== "" && existingIbans.includes(compact);
  const problem = malformed ? labels.invalidIban : duplicate ? labels.duplicateIban : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix focuses the first field when a dialog opens, which drops a caret into the IBAN
          before anyone has decided to type there. Focus goes to the panel instead, so Escape and
          Tab still work and no field looks half filled in. */}
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            {/* The asterisk carries what a paragraph of hint text used to: this one field is
                required, the other two are not. A placeholder cannot say that, and an example
                IBAN sitting in an empty field reads as a value already entered. */}
            <Label htmlFor="bank-account-iban">
              {labels.iban} <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="bank-account-iban"
              required
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className={cn(
                "mt-1 font-mono text-sm",
                problem && "border-destructive focus-visible:ring-destructive",
              )}
            />
            {problem && <p className="mt-1 text-[11px] text-destructive">{problem}</p>}
          </div>
          <div>
            <Label htmlFor="bank-account-bic">{labels.bic}</Label>
            <Input
              id="bank-account-bic"
              value={bic}
              onChange={(e) => setBic(e.target.value)}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="bank-account-bank">{labels.bank}</Label>
            <Input
              id="bank-account-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button
            disabled={!iban.trim() || !!problem || saving}
            onClick={() =>
              onSave({
                iban: compact,
                bic: bic.trim() || null,
                bank_name: bankName.trim() || null,
              })
            }
          >
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
