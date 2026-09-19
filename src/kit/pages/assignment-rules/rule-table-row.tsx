import { Pencil, Trash2, Wand2 } from "lucide-react";

import type {
  AssignmentRuleView,
  DimensionKey,
  ScopeOption,
} from "../../adapters/assignment-rules";
import { cn } from "../../lib/class-names";
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
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { TableCell, TableRow } from "../../ui/table";
import type { AssignmentRulesLabels } from "./labels";
import { ScopeChips } from "./scope-chips";

export interface RuleImpact {
  isLoading: boolean;
  wouldChange: number;
  matches: number;
}

export function RuleTableRow({
  rule,
  dimensions,
  scopeOptions,
  labels,
  impact,
  isApplying,
  isEditing,
  onEdit,
  onDelete,
  onToggleActive,
  onApply,
}: {
  rule: AssignmentRuleView;
  dimensions: DimensionKey[];
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  labels: AssignmentRulesLabels;
  impact?: RuleImpact;
  isApplying?: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
  onApply: () => void;
}) {
  const wouldChange = impact?.wouldChange ?? 0;

  return (
    <TableRow className={cn(!rule.isActive && "bg-muted/40")}>
      <TableCell className="align-top">
        <div className="text-sm font-medium text-foreground">{rule.categoryLabel}</div>
        {rule.note && <p className="mt-0.5 text-xs text-muted-foreground">{rule.note}</p>}
        {!rule.isActive && <p className="mt-0.5 text-xs text-warning">{labels.row.flagInactive}</p>}
      </TableCell>

      <TableCell className="align-top">
        <ScopeChips
          scope={rule.scope}
          dimensions={dimensions}
          options={scopeOptions}
          referencePattern={rule.referencePattern}
          labels={labels}
        />
      </TableCell>

      <TableCell className="align-top text-right tabular-nums text-sm text-muted-foreground">
        {impact?.isLoading
          ? labels.impact.loading
          : labels.impact.summary(wouldChange, impact?.matches ?? 0)}
      </TableCell>

      <TableCell className="align-top">
        <Switch
          checked={rule.isActive}
          onCheckedChange={onToggleActive}
          aria-label={rule.isActive ? labels.row.active : labels.row.inactive}
        />
      </TableCell>

      <TableCell className="align-top">
        <div className="flex items-center justify-end gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={labels.impact.apply}
                disabled={isApplying || wouldChange === 0}
                className="size-8"
              >
                <Wand2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.impact.applyTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {wouldChange > 0
                    ? labels.impact.applyDescription(wouldChange, impact?.matches ?? 0)
                    : labels.impact.applyNone}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.impact.cancel}</AlertDialogCancel>
                <AlertDialogAction disabled={wouldChange === 0} onClick={onApply}>
                  {labels.impact.applyConfirm(wouldChange)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={labels.row.edit}
            aria-haspopup="dialog"
            className={cn("size-8", isEditing && "text-brand")}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={labels.row.delete}
            aria-haspopup="dialog"
            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
