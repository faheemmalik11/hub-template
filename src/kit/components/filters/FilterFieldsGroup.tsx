import { useEffect, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { englishFilterGroupLabels, type FilterGroupLabels } from "./labels";

export interface FilterFieldOption {
  value: string;
  label: string;
  keywords?: string;
}

export interface FilterField {
  key: string;
  label: string;
  value: string | undefined;
  options: FilterFieldOption[];
}

export interface FilterFieldsGroupProps {
  fields: FilterField[];
  onApply(values: Record<string, string | undefined>): void;
  onReset(): void;
  anyValue: string;
  labels?: FilterGroupLabels;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

function draftFromFields(fields: FilterField[]): Record<string, string | undefined> {
  const draft: Record<string, string | undefined> = {};
  for (const field of fields) draft[field.key] = field.value;
  return draft;
}

export function FilterFieldsGroup({
  fields,
  onApply,
  onReset,
  anyValue,
  labels = englishFilterGroupLabels,
  leading,
  trailing,
  className,
}: FilterFieldsGroupProps) {
  const [draft, setDraft] = useState(() => draftFromFields(fields));
  const appliedKey = JSON.stringify(draftFromFields(fields));

  useEffect(() => {
    setDraft(JSON.parse(appliedKey) as Record<string, string | undefined>);
  }, [appliedKey]);

  const dirty = JSON.stringify(draft) !== appliedKey;
  const anythingSet =
    fields.some((field) => field.value !== undefined) ||
    Object.values(draft).some((value) => value !== undefined);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {leading}
        {fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
            <Combobox
              value={draft[field.key] ?? anyValue}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  [field.key]: value === anyValue ? undefined : value,
                }))
              }
              className="w-full"
              placeholder={field.label}
              options={field.options}
            />
          </label>
        ))}
        {trailing}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!anythingSet}
          onClick={() => {
            setDraft(draftFromFields(fields.map((field) => ({ ...field, value: undefined }))));
            onReset();
          }}
        >
          {labels.reset}
        </Button>
        <Button type="button" size="sm" disabled={!dirty} onClick={() => onApply(draft)}>
          {labels.apply}
        </Button>
      </div>
    </div>
  );
}
