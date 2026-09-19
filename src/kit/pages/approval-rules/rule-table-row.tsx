import { Pencil, Trash2 } from "lucide-react";

import type {
  ApprovalRulesConfig,
  ApprovalRuleView,
  ApproverOption,
  DimensionKey,
  ScopeOption,
} from "../../adapters/approval-rules";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { TableCell, TableRow } from "../../ui/table";
import { ApprovalChain } from "./approval-chain";
import type { ApprovalRulesLabels } from "./labels";
import { ScopeInline } from "./scope-inline";

export type MatchState = "winner" | "outranked" | "unrelated" | "neutral";

export function RuleTableRow({
  rule,
  priority,
  matchState = "neutral",
  config,
  scopeOptions,
  approvers,
  approverName,
  labels,
  formatters = englishFormatters,
  isStranded,
  isEditing,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  rule: ApprovalRuleView;

  priority: number;
  matchState?: MatchState;
  config: ApprovalRulesConfig;
  scopeOptions: Partial<Record<DimensionKey, ScopeOption[]>>;
  approvers: ApproverOption[];
  approverName: (userId: string) => string | null;
  labels: ApprovalRulesLabels;
  formatters?: Formatters;
  isStranded: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
}) {
  const flag = !rule.isActive
    ? labels.row.flagInactive
    : isStranded
      ? labels.row.flagStranded
      : matchState === "outranked"
        ? labels.row.flagOutranked
        : null;

  const columnCount = 5;

  return (
    <>
      <TableRow
        className={cn(
          matchState === "winner" && "bg-brand-wash",
          matchState === "unrelated" && "opacity-60",

          !rule.isActive && "bg-muted/40",
          flag && "border-b-0",
        )}
      >
        <TableCell>
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
              rule.isActive ? "bg-brand-tint text-brand-dark" : "bg-muted text-muted-foreground",
            )}
          >
            {priority}
          </span>
        </TableCell>

        <TableCell>
          <ScopeInline
            scope={rule.scope}
            dimensions={config.dimensions}
            options={scopeOptions}
            labels={labels}
          />
        </TableCell>

        <TableCell
          className={cn(
            "whitespace-nowrap text-right tabular-nums",
            rule.minAmount === 0 && "text-muted-foreground",
          )}
        >
          {rule.minAmount === 0
            ? labels.card.anyAmount
            : labels.card.atLeast(formatters.formatMoney(rule.minAmount))}
        </TableCell>

        <TableCell>
          <ApprovalChain
            steps={rule.steps}
            autoFinalStep={rule.autoFinalStep}
            approvers={approvers}
            approverName={approverName}
            labels={labels}
          />
        </TableCell>

        <TableCell>
          <div className="flex items-center justify-end gap-2">
            <Switch
              checked={rule.isActive}
              onCheckedChange={onToggleActive}
              aria-label={rule.isActive ? labels.row.active : labels.row.inactive}
            />
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
              aria-label={labels.editor.delete}
              aria-haspopup="dialog"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {flag && (
        <TableRow className={cn(!rule.isActive && "bg-muted/40")}>
          <TableCell colSpan={columnCount} className="pt-0">
            <span
              className={cn(
                "flex items-center gap-2 text-xs",
                isStranded && rule.isActive ? "text-destructive" : "text-warning",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  isStranded && rule.isActive ? "bg-destructive" : "bg-warning",
                )}
              />
              {flag}
            </span>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
