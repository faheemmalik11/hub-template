import { Play, RotateCcw } from "lucide-react";

import {
  ANY_VALUE,
  type AssignmentRulesConfig,
  type DimensionKey,
  type AssignmentRuleQuery,
  type ScopeOption,
} from "../../adapters/assignment-rules";
import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import type { AssignmentRulesLabels } from "./labels";

export function ScenarioForm({
  draft,
  onDraftChange,
  onCheck,
  onReset,
  config,
  scopeOptions,
  labels,
  hasResult,
}: {
  draft: AssignmentRuleQuery;
  onDraftChange: (next: AssignmentRuleQuery) => void;
  onCheck: () => void;
  onReset: () => void;
  config: AssignmentRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  labels: AssignmentRulesLabels;
  hasResult: boolean;
}) {
  const setDimension = (key: DimensionKey, value: string) =>
    onDraftChange({
      ...draft,
      scope: { ...draft.scope, [key]: value === ANY_VALUE ? null : value },
    });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border bg-brand-wash px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{labels.tester.title}</h2>
        <p className="text-xs text-muted-foreground">{labels.tester.hint}</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 px-4 py-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          onCheck();
        }}
      >
        {config.dimensions.map((key) => (
          <div key={key} className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.dimension[key]}
            </span>
            <Combobox
              ariaLabel={labels.dimension[key]}
              value={draft.scope[key] ?? ANY_VALUE}
              onValueChange={(value) => setDimension(key, value)}
              options={[
                { value: ANY_VALUE, label: labels.any },
                ...(scopeOptions[key] ?? []).map((option) => ({
                  value: option.id,
                  label: option.code
                    ? `${option.code}${option.keywords ? ` · ${option.keywords}` : ""}`
                    : option.label,
                  keywords: option.keywords,
                })),
              ]}
            />
          </div>
        ))}

        <div className="flex min-w-0 flex-1 basis-52 flex-col gap-1.5">
          <Label
            htmlFor="assignment-scenario-reference"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {labels.tester.reference}
          </Label>
          <Input
            id="assignment-scenario-reference"
            value={draft.reference}
            placeholder={labels.tester.referencePlaceholder}
            onChange={(event) => onDraftChange({ ...draft, reference: event.target.value })}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" className="gap-2">
            <Play className="size-4" /> {labels.tester.check}
          </Button>
          {hasResult && (
            <Button type="button" variant="ghost" className="gap-2" onClick={onReset}>
              <RotateCcw className="size-4" /> {labels.tester.reset}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
