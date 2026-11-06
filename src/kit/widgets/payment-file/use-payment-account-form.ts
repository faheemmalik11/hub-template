import { useEffect, useState } from "react";

import { isBicValid, isIbanValid, isSepaIban } from "../../lib/sepa";
import type { PaymentAccountFormValues, PaymentAccountRow } from "../../adapters/payment-file";
import type { PaymentFileLabels } from "../../pages/payment-file/labels";

const EMPTY_VALUES: PaymentAccountFormValues = {
  label: "",
  payerName: "",
  payerIban: "",
  payerBic: "",
  painVersion: "pain.001.001.09",
  executionDateRule: "as_soon_as_possible",
};

function valuesFrom(account: PaymentAccountRow | null): PaymentAccountFormValues {
  if (!account) return EMPTY_VALUES;
  return {
    label: account.label,
    payerName: account.payerName,
    payerIban: account.payerIban,
    payerBic: account.payerBic ?? "",
    painVersion: account.painVersion,
    executionDateRule: account.executionDateRule,
  };
}

export interface PaymentAccountForm {
  values: PaymentAccountFormValues;
  setValues(values: PaymentAccountFormValues): void;
  isDirty: boolean;
  attemptedSave: boolean;
  errors: {
    label: string | null;
    payerName: string | null;
    payerIban: string | null;
    payerBic: string | null;
  };
  isValid: boolean;
  trySave(onValid: () => void): void;
}

export function usePaymentAccountForm(
  open: boolean,
  account: PaymentAccountRow | null,
  labels: PaymentFileLabels["accountForm"],
): PaymentAccountForm {
  const [values, setValues] = useState<PaymentAccountFormValues>(EMPTY_VALUES);
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(valuesFrom(account));
    setAttemptedSave(false);
  }, [open, account]);

  const initial = valuesFrom(account);
  const isDirty =
    values.label !== initial.label ||
    values.payerName !== initial.payerName ||
    values.payerIban !== initial.payerIban ||
    values.payerBic !== initial.payerBic ||
    values.painVersion !== initial.painVersion ||
    values.executionDateRule !== initial.executionDateRule;

  const errors = {
    label: values.label.trim() === "" ? labels.errorLabelRequired : null,
    payerName: values.payerName.trim() === "" ? labels.errorNameRequired : null,
    payerIban:
      values.payerIban.trim() === ""
        ? labels.errorIbanRequired
        : !isIbanValid(values.payerIban)
          ? labels.errorIbanInvalid
          : !isSepaIban(values.payerIban)
            ? labels.errorIbanNotSepa
            : null,
    payerBic:
      values.payerBic.trim() !== "" && !isBicValid(values.payerBic) ? labels.errorBicInvalid : null,
  };
  const isValid = !errors.label && !errors.payerName && !errors.payerIban && !errors.payerBic;

  function trySave(onValid: () => void) {
    if (!isValid) {
      setAttemptedSave(true);
      return;
    }
    onValid();
  }

  return { values, setValues, isDirty, attemptedSave, errors, isValid, trySave };
}
