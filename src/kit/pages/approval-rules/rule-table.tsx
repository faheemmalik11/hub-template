import type { ApprovalRuleView } from "../../adapters/approval-rules";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { ApprovalRulesLabels } from "./labels";

export function RuleTable({
  rules,
  labels,
  firstPriority,
  renderRow,
}: {
  rules: ApprovalRuleView[];
  labels: ApprovalRulesLabels;

  firstPriority: number;
  renderRow: (rule: ApprovalRuleView, priority: number) => React.ReactNode;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-14">{labels.card.priority}</TableHead>
            <TableHead>{labels.card.when}</TableHead>
            <TableHead className="text-right">{labels.card.amount}</TableHead>
            <TableHead>{labels.card.approvers}</TableHead>
            <TableHead className="text-right">{labels.card.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rules.map((rule, index) => renderRow(rule, firstPriority + index))}</TableBody>
      </Table>
    </div>
  );
}
