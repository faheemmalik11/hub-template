import { useEffect, useMemo, useState } from "react";

import type { DocumentSource, SourceFieldValue } from "../../adapters/document-sources";

export interface SourceForm {
  values: Record<string, SourceFieldValue>;
  setValue: (key: string, value: SourceFieldValue) => void;
  isDirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  save: () => Promise<void>;
}

export function useSourceForm(
  source: DocumentSource,
  onSave: (sourceId: string, values: Record<string, SourceFieldValue>) => Promise<void>,
  onSaved: () => void,
): SourceForm {
  const initialValues = useMemo(() => {
    const values: Record<string, SourceFieldValue> = {};
    for (const field of source.fields) values[field.key] = field.value;
    return values;
  }, [source.fields]);

  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const isDirty = useMemo(
    () => source.fields.some((field) => !sameValue(values[field.key], initialValues[field.key])),
    [source.fields, values, initialValues],
  );

  return {
    values,
    setValue: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    isDirty,
    saving,
    saveFailed,
    save: async () => {
      setSaving(true);
      setSaveFailed(false);
      try {
        await onSave(source.id, values);
        onSaved();
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    },
  };
}

export function sameValue(left: SourceFieldValue, right: SourceFieldValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return (left ?? null) === (right ?? null);
}
