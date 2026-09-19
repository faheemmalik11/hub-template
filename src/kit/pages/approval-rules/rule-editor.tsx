import { useState } from "react";

import type { ApprovalRulesLabels } from "./labels";
import { findScopeTwin } from "./specificity";
import {
  ANY_VALUE,
  type ApprovalRuleDraft,
  type ApprovalRulesConfig,
  type ApprovalRuleView,
  type ApproverOption,
  type DimensionKey,
  type ScopeOption,
} from "../../adapters/approval-rules";
import { cn } from "../../lib/class-names";
import { Button } from "../../ui/button";
import { parseDecimal } from "./parse-decimal";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

export function RuleEditor({
  rule,
  allRules,
  config,
  scopeOptions,
  approvers,
  labels,
  isSaving,
  onSave,
  onCancel,
}: {
  rule?: ApprovalRuleView;
  allRules: ApprovalRuleView[];
  config: ApprovalRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  approvers: ApproverOption[];
  labels: ApprovalRulesLabels;
  isSaving: boolean;
  onSave: (draft: ApprovalRuleDraft) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<Partial<Record<DimensionKey, string | null>>>(() => ({
    ...(rule?.scope ?? {}),
  }));
  const [amountText, setAmountText] = useState(() => (rule ? String(rule.minAmount) : "0"));

  const [steps, setSteps] = useState<string[]>(() => {
    const next = Array.from({ length: config.maxSteps }, () => ANY_VALUE);
    (rule?.steps ?? []).forEach((id, index) => {
      if (index < config.maxSteps) next[index] = id;
    });
    return next;
  });

  const amount = parseDecimal(amountText) ?? 0;
  const chosen = steps.filter((id) => id !== ANY_VALUE);

  const scopeEmpty = config.dimensions.every((key) => !scope[key]);
  const sameApproverTwice = new Set(chosen).size !== chosen.length;

  const gapIndex = steps.findIndex(
    (id, index) => id !== ANY_VALUE && index > 0 && steps[index - 1] === ANY_VALUE,
  );
  const firstStepMissing = steps[0] === ANY_VALUE;
  const amountInvalid = !Number.isFinite(amount) || amount < 0;
  const twin = findScopeTwin(
    allRules,
    { id: rule?.id, scope, minAmount: amount },
    config.dimensions,
  );

  const invalid =
    scopeEmpty ||
    firstStepMissing ||
    sameApproverTwice ||
    gapIndex !== -1 ||
    amountInvalid ||
    !!twin;

  const approverOptions = (() => {
    const seen = new Set<string>();
    const options = approvers
      .filter((person) => person.isActive)
      .map((person) => {
        seen.add(person.id);
        return {
          value: person.id,
          label: person.roleLabel ? `${person.name} (${person.roleLabel})` : person.name,
        };
      });
    for (const id of rule?.steps ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const person = approvers.find((p) => p.id === id);
      options.push({
        value: id,
        label: person
          ? `${person.name} (${labels.row.deactivatedSuffix})`
          : labels.row.unknownApprover,
      });
    }
    return options;
  })();

  function save() {
    onSave({
      id: rule?.id,
      scope,
      minAmount: amount,
      steps: chosen,

      autoFinalStep: rule?.autoFinalStep,
    });
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
            <Label htmlFor="approval-min-amount" className="text-xs text-muted-foreground">
              {labels.editor.minAmount}
            </Label>
            <Input
              id="approval-min-amount"
              inputMode="decimal"
              className="tabular-nums"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
            />
          </div>
        </div>
        <p
          className={cn("mt-2 text-xs", scopeEmpty ? "text-destructive" : "text-muted-foreground")}
        >
          {scopeEmpty ? labels.editor.scopeRequired : labels.editor.minAmountHint}
        </p>
        {twin && <p className="mt-1.5 text-xs text-destructive">{labels.editor.duplicate}</p>}
      </section>

      <section className="mt-4 border-t border-border pt-4">
        <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {labels.editor.chain}
        </h4>
        <div className="flex flex-col gap-2">
          {steps.map((value, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <span className="w-7 shrink-0 font-mono text-xs font-bold text-muted-foreground">
                {index + 1}.
              </span>
              <div className="min-w-0 max-w-sm flex-1">
                <Combobox
                  ariaLabel={labels.editor.step(index + 1)}
                  value={value}
                  onValueChange={(next) =>
                    setSteps((prev) => {
                      const updated = [...prev];
                      updated[index] = next;

                      if (next === ANY_VALUE) {
                        for (let i = index + 1; i < updated.length; i += 1) updated[i] = ANY_VALUE;
                      }
                      return updated;
                    })
                  }
                  options={[
                    ...(index === 0
                      ? []
                      : [
                          {
                            value: ANY_VALUE,
                            label: labels.editor.noFurtherStep,
                          },
                        ]),
                    ...(index === 0
                      ? [
                          {
                            value: ANY_VALUE,
                            label: labels.editor.chooseApprover,
                          },
                        ]
                      : []),
                    ...approverOptions,
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
        <p
          className={cn(
            "mt-2 text-xs",
            sameApproverTwice || gapIndex !== -1 || firstStepMissing
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {firstStepMissing
            ? labels.editor.chooseApprover
            : sameApproverTwice
              ? labels.editor.sameApproverTwice
              : gapIndex !== -1
                ? labels.editor.stepNeedsPrevious
                : labels.editor.chainHint}
        </p>
      </section>

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
