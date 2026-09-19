import { useEffect, useState } from "react";

import {
  ANY_VALUE,
  type AssignmentRuleDraft,
  type AssignmentRuleView,
  type AssignmentRulesConfig,
  type CategoryOption,
  type DimensionKey,
  type ScopeOption,
} from "../../adapters/assignment-rules";
import { cn } from "../../lib/class-names";
import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import type { AssignmentRulesLabels } from "./labels";
import { findScopeTwin } from "./specificity";

export interface RulePreview {
  isLoading: boolean;
  wouldChange: number;
  matches: number;
}

export interface AssignmentRuleDraftSeed {
  scope: Partial<Record<DimensionKey, string | null>>;
  referencePattern?: string | null;
  categoryId?: string;
}

export function RuleEditor({
  rule,
  seed,
  allRules,
  config,
  scopeOptions,
  categories,
  labels,
  isSaving,
  preview,
  onDraftChange,
  onSave,
  onCancel,
}: {
  rule?: AssignmentRuleView;
  seed?: AssignmentRuleDraftSeed;
  allRules: AssignmentRuleView[];
  config: AssignmentRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  categories: CategoryOption[];
  labels: AssignmentRulesLabels;
  isSaving: boolean;
  preview?: RulePreview;
  onDraftChange?: (draft: AssignmentRuleDraft) => void;
  onSave: (draft: AssignmentRuleDraft) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<Partial<Record<DimensionKey, string | null>>>(() => ({
    ...(rule?.scope ?? seed?.scope ?? {}),
  }));
  const [referencePattern, setReferencePattern] = useState(
    rule?.referencePattern ?? seed?.referencePattern ?? "",
  );
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? seed?.categoryId ?? ANY_VALUE);

  const scopeEmpty = config.dimensions.every((key) => !scope[key]) && !referencePattern.trim();
  const categoryMissing = categoryId === ANY_VALUE;
  const twin = findScopeTwin(
    allRules,
    { id: rule?.id, scope, referencePattern: referencePattern.trim() || null },
    config.dimensions,
  );

  const invalid = scopeEmpty || categoryMissing || !!twin;

  const draft: AssignmentRuleDraft = {
    id: rule?.id,
    scope,
    referencePattern: referencePattern.trim() || null,
    categoryId: categoryMissing ? "" : categoryId,
  };

  useEffect(() => {
    onDraftChange?.(draft);
  }, [scope, referencePattern, categoryId]);

  function save() {
    onSave(draft);
  }

  return (
    <div>
      <section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {config.dimensions.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{labels.dimension[key]}</Label>
              <Combobox
                ariaLabel={labels.dimension[key]}
                value={scope[key] ?? ANY_VALUE}
                onValueChange={(value) =>
                  setScope((prev) => ({
                    ...prev,
                    [key]: value === ANY_VALUE ? null : value,
                  }))
                }
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignment-reference" className="text-xs text-muted-foreground">
              {labels.editor.reference}
            </Label>
            <Input
              id="assignment-reference"
              value={referencePattern}
              placeholder={labels.editor.referencePlaceholder}
              onChange={(event) => setReferencePattern(event.target.value)}
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{labels.editor.referenceHint}</p>
        <p
          className={cn("mt-2 text-xs", scopeEmpty ? "text-destructive" : "text-muted-foreground")}
        >
          {scopeEmpty ? labels.editor.scopeRequired : " "}
        </p>
        {twin && <p className="mt-1.5 text-xs text-destructive">{labels.editor.duplicate}</p>}
      </section>

      <section className="mt-4 border-t border-border pt-4">
        <Label className="text-xs text-muted-foreground">{labels.editor.category}</Label>
        <div className="mt-1.5 max-w-sm">
          <Combobox
            ariaLabel={labels.editor.category}
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: ANY_VALUE, label: labels.editor.categoryPlaceholder },
              ...categories.map((category) => ({
                value: category.id,
                label: category.label,
                keywords: category.keywords,
              })),
            ]}
          />
        </div>
        {categoryMissing && (
          <p className="mt-1.5 text-xs text-destructive">{labels.editor.categoryRequired}</p>
        )}
      </section>

      {preview && !scopeEmpty && !categoryMissing && (
        <p className="mt-3 text-xs text-muted-foreground">
          {preview.isLoading
            ? labels.impact.loading
            : preview.wouldChange > 0
              ? labels.editor.preview(preview.wouldChange, preview.matches)
              : labels.editor.previewNone}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3.5">
        <Button variant="outline" onClick={onCancel}>
          {labels.editor.cancel}
        </Button>
        <Button disabled={invalid || isSaving} onClick={save}>
          {isSaving ? labels.editor.saving : labels.editor.save}
        </Button>
      </div>
    </div>
  );
}
