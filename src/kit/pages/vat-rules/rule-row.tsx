import { useState } from "react";
import { Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { TableCell, TableRow } from "../../ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import { cn } from "../../lib/class-names";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { QueryResult } from "../../lib/query-result";
import type { RuleImpact, VatRule, VatRulesAdapter } from "../../adapters/vat-rules";
import type { VatRulesLabels } from "./labels";

// Names for the ids a rule is scoped to, so the row can show "Ikea" instead of a raw id.
export interface ScopeNameMaps {
  supplierNameById: Map<string, string>;
  propertyLabelById: Map<string, string>;
  companyLabelById: Map<string, string>;
}

interface ScopeChip {
  label: string;
  value: string;
}

function buildScopeChips(rule: VatRule, maps: ScopeNameMaps, labels: VatRulesLabels): ScopeChip[] {
  const chips: ScopeChip[] = [];
  if (rule.supplierId) {
    chips.push({
      label: labels.scopeNames.supplier,
      value: maps.supplierNameById.get(rule.supplierId) ?? rule.supplierId,
    });
  }
  if (rule.propertyId) {
    chips.push({
      label: labels.scopeNames.property,
      value: maps.propertyLabelById.get(rule.propertyId) ?? rule.propertyId,
    });
  }
  if (rule.companyId) {
    chips.push({
      label: labels.scopeNames.company,
      value: maps.companyLabelById.get(rule.companyId) ?? rule.companyId,
    });
  }
  if (rule.referencePattern) {
    chips.push({ label: labels.scopeNames.referencePattern, value: rule.referencePattern });
  }
  return chips;
}

export function ruleValueText(rule: VatRule, labels: VatRulesLabels): string {
  return rule.vatRate != null ? labels.vatRateValue(rule.vatRate) : "—";
}

function RuleValueContent({ rule, labels }: { rule: VatRule; labels: VatRulesLabels }) {
  return (
    <>
      {ruleValueText(rule, labels)}
      {rule.vatTreatment ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {labels.vatTreatmentName(rule.vatTreatment)}
        </span>
      ) : null}
      {rule.vatDeductiblePercent != null ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {labels.deductibleShare(rule.vatDeductiblePercent)}
        </span>
      ) : null}
      {rule.vatSpecialCase ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {labels.vatSpecialCaseName(rule.vatSpecialCase)}
        </span>
      ) : null}
      {rule.note ? <p className="mt-0.5 text-xs text-muted-foreground">{rule.note}</p> : null}
    </>
  );
}

function ScopeChips({ chips }: { chips: ScopeChip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
        >
          <span className="text-muted-foreground">{chip.label}</span>
          <span className="text-foreground">{chip.value}</span>
        </span>
      ))}
    </div>
  );
}

function EffectText({
  impactQuery,
  labels,
}: {
  impactQuery: QueryResult<RuleImpact>;
  labels: VatRulesLabels;
}) {
  if (impactQuery.isLoading) return <span className="text-muted-foreground">…</span>;
  return (
    <span
      title={labels.effectHint}
      className={cn((impactQuery.data?.wouldChange ?? 0) > 0 && "font-medium text-warning")}
    >
      {labels.effect(impactQuery.data?.wouldChange ?? 0, impactQuery.data?.matches ?? 0)}
    </span>
  );
}

function RuleActions({
  rule,
  valueText,
  impactQuery,
  adapter,
  labels,
  layout,
}: {
  rule: VatRule;
  valueText: string;
  impactQuery: QueryResult<RuleImpact>;
  adapter: VatRulesAdapter;
  labels: VatRulesLabels;
  layout: "row" | "card";
}) {
  const [isApplying, setIsApplying] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const wouldChange = impactQuery.data?.wouldChange ?? 0;
  const matches = impactQuery.data?.matches ?? 0;
  const buttonClass = layout === "card" ? "flex-1 justify-center gap-1.5" : "gap-1.5";

  async function applyRule() {
    setIsApplying(true);
    try {
      const result = await adapter.applyVatRuleToExisting(rule.id);
      if (result.changed === 0) {
        toast.info(labels.apply.appliedNone);
      } else if (result.skipped > 0) {
        toast.success(
          labels.apply.appliedWithSkipped(result.changed, result.matches, result.skipped),
        );
      } else {
        toast.success(labels.apply.applied(result.changed, result.matches));
      }
    } catch (error) {
      toast.error(labels.actionFailed(readableErrorMessage(error, "")));
    } finally {
      setIsApplying(false);
    }
  }

  async function deleteRule() {
    try {
      await adapter.deleteVatRule({ id: rule.id, reason: deleteReason.trim() });
      toast.success(labels.deleteRule.deleted);
    } catch (error) {
      toast.error(labels.actionFailed(readableErrorMessage(error, "")));
    }
  }

  return (
    <div className={cn(layout === "card" ? "flex gap-2" : "inline-flex items-center gap-1")}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={buttonClass}
            disabled={isApplying || wouldChange === 0}
          >
            <Wand2 className="size-4" /> {labels.apply.action}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.apply.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {wouldChange > 0
                ? labels.apply.description(wouldChange, matches)
                : labels.apply.nothingToApply}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.apply.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={wouldChange === 0} onClick={applyRule}>
              {labels.apply.confirm(wouldChange)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              buttonClass,
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <Trash2 className="size-4" /> {labels.deleteRule.action}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.deleteRule.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {labels.deleteRule.description(valueText)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder={labels.deleteRule.reasonPlaceholder}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.deleteRule.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteRule}
            >
              {labels.deleteRule.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActiveSwitch({
  rule,
  adapter,
  labels,
}: {
  rule: VatRule;
  adapter: VatRulesAdapter;
  labels: VatRulesLabels;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function toggle(nextActive: boolean) {
    setIsSaving(true);
    try {
      await adapter.setVatRuleActive({ id: rule.id, isActive: nextActive });
      toast.success(nextActive ? labels.toggleActivated : labels.toggleDeactivated);
    } catch (error) {
      toast.error(labels.actionFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Switch
      checked={rule.isActive}
      disabled={isSaving}
      aria-label={labels.columns.active}
      onCheckedChange={toggle}
    />
  );
}

export function RuleRow({
  rule,
  maps,
  adapter,
  labels,
}: {
  rule: VatRule;
  maps: ScopeNameMaps;
  adapter: VatRulesAdapter;
  labels: VatRulesLabels;
}) {
  const chips = buildScopeChips(rule, maps, labels);
  const impactQuery = adapter.useRuleImpact(rule.id);
  const valueText = ruleValueText(rule, labels);

  return (
    <TableRow className={cn(!rule.isActive && "opacity-60")}>
      <TableCell className="font-medium text-foreground">
        <RuleValueContent rule={rule} labels={labels} />
      </TableCell>
      <TableCell>
        <ScopeChips chips={chips} />
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        <EffectText impactQuery={impactQuery} labels={labels} />
      </TableCell>
      <TableCell>
        <ActiveSwitch rule={rule} adapter={adapter} labels={labels} />
      </TableCell>
      <TableCell className="text-right">
        <RuleActions
          rule={rule}
          valueText={valueText}
          impactQuery={impactQuery}
          adapter={adapter}
          labels={labels}
          layout="row"
        />
      </TableCell>
    </TableRow>
  );
}

// Mobile card equivalent of RuleRow — same fields, stacked instead of columned.
export function RuleCard({
  rule,
  maps,
  adapter,
  labels,
}: {
  rule: VatRule;
  maps: ScopeNameMaps;
  adapter: VatRulesAdapter;
  labels: VatRulesLabels;
}) {
  const chips = buildScopeChips(rule, maps, labels);
  const impactQuery = adapter.useRuleImpact(rule.id);
  const valueText = ruleValueText(rule, labels);

  return (
    <div
      className={cn("rounded-xl border border-border bg-card p-4", !rule.isActive && "opacity-60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-medium text-foreground">
          <RuleValueContent rule={rule} labels={labels} />
        </div>
        <ActiveSwitch rule={rule} adapter={adapter} labels={labels} />
      </div>
      {chips.length > 0 && (
        <div className="mt-2">
          <ScopeChips chips={chips} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {labels.columns.effect}: <EffectText impactQuery={impactQuery} labels={labels} />
      </p>
      <div className="mt-3 border-t border-border pt-3">
        <RuleActions
          rule={rule}
          valueText={valueText}
          impactQuery={impactQuery}
          adapter={adapter}
          labels={labels}
          layout="card"
        />
      </div>
    </div>
  );
}
