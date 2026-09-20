import { useEffect, useRef, useState } from "react";

import type {
  DocumentSource,
  FieldOption,
  SourceField,
  SourceFieldValue,
} from "../../adapters/document-sources";

interface LoadedOptions {
  loading: boolean;
  error?: boolean;
  options: FieldOption[];
}

/**
 * Fields whose choices depend on another field: pick an account, then its folders can be listed.
 *
 * Reloads when the field it depends on changes, clears the dependent value so a folder from the
 * previous account cannot be saved, and ignores a response that arrives after the dependency has
 * moved on.
 */
export function useDependentFieldOptions(
  source: DocumentSource,
  values: Record<string, SourceFieldValue>,
  setValue: (key: string, value: SourceFieldValue) => void,
  onLoadFieldOptions:
    | ((sourceId: string, fieldKey: string, dependencyValue: string) => Promise<FieldOption[]>)
    | undefined,
): (field: SourceField) => SourceField {
  const dependentFields = source.fields.filter((field) => field.dependsOn);
  const [loaded, setLoaded] = useState<Record<string, LoadedOptions>>({});
  const lastDependency = useRef<Record<string, string | null>>({});

  const dependencyKey = dependentFields
    .map((field) => {
      const raw = values[field.dependsOn as string];
      return `${field.key} ${typeof raw === "string" ? raw.trim() : ""}`;
    })
    .join("|");

  useEffect(() => {
    if (!onLoadFieldOptions) return;

    for (const field of dependentFields) {
      const raw = values[field.dependsOn as string];
      const dependency = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
      const seenBefore = field.key in lastDependency.current;
      if (seenBefore && lastDependency.current[field.key] === dependency) continue;

      lastDependency.current[field.key] = dependency;
      if (seenBefore) setValue(field.key, Array.isArray(field.value) ? [] : null);

      if (!dependency) {
        setLoaded((current) => ({ ...current, [field.key]: { loading: false, options: [] } }));
        continue;
      }

      setLoaded((current) => ({
        ...current,
        [field.key]: { loading: true, options: current[field.key]?.options ?? [] },
      }));

      onLoadFieldOptions(source.id, field.key, dependency).then(
        (options) => {
          if (lastDependency.current[field.key] !== dependency) return;
          setLoaded((current) => ({ ...current, [field.key]: { loading: false, options } }));
        },
        () => {
          if (lastDependency.current[field.key] !== dependency) return;
          setLoaded((current) => ({
            ...current,
            [field.key]: { loading: false, error: true, options: [] },
          }));
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey, onLoadFieldOptions, source.id]);

  return (field: SourceField): SourceField => {
    if (!field.dependsOn) return field;
    const dynamic = loaded[field.key];
    if (!dynamic) return field;
    return {
      ...field,
      options: dynamic.options,
      optionsLoading: dynamic.loading,
      optionsError: dynamic.error ?? false,
    };
  };
}
