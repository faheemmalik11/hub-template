import { useCallback, useMemo, useState } from "react";

import {
  emptyBankAccountFields,
  normalizeBankAccountFields,
  validateBankAccountFields,
  type BankAccountErrors,
  type BankAccountField,
  type BankAccountFields,
  type BankAccountRules,
} from "@/lib/data/bank-account-fields";

export interface BankAccountForm {
  values: BankAccountFields;
  errors: BankAccountErrors;
  isValid: boolean;
  isDirty: boolean;
  setField: <K extends BankAccountField>(field: K, value: BankAccountFields[K]) => void;
  markTouched: (field: BankAccountField) => void;
  showError: (field: BankAccountField) => boolean;
  reset: (values?: BankAccountFields) => void;
}

export function useBankAccountForm(
  initial: () => BankAccountFields = emptyBankAccountFields,
  rules: BankAccountRules = {},
): BankAccountForm {
  const [values, setValues] = useState<BankAccountFields>(initial);
  const [saved, setSaved] = useState<BankAccountFields>(initial);
  const [touched, setTouched] = useState<Partial<Record<BankAccountField, boolean>>>({});

  const requireCompany = rules.requireCompany ?? false;
  const requireIban = rules.requireIban ?? false;
  const errors = useMemo(
    () => validateBankAccountFields(values, { requireCompany, requireIban }),
    [values, requireCompany, requireIban],
  );

  const setField = useCallback(
    <K extends BankAccountField>(field: K, value: BankAccountFields[K]) =>
      setValues((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const markTouched = useCallback(
    (field: BankAccountField) => setTouched((prev) => ({ ...prev, [field]: true })),
    [],
  );

  const reset = useCallback((next?: BankAccountFields) => {
    const seed = next ?? emptyBankAccountFields();
    setValues(seed);
    setSaved(seed);
    setTouched({});
  }, []);

  const isDirty = useMemo(
    () =>
      JSON.stringify(normalizeBankAccountFields(values)) !==
      JSON.stringify(normalizeBankAccountFields(saved)),
    [values, saved],
  );

  return {
    values,
    errors,
    isValid: Object.keys(errors).length === 0,
    isDirty,
    setField,
    markTouched,
    showError: (field) => !!errors[field] && !!touched[field],
    reset,
  };
}
