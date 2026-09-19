import type { AssignmentRuleView } from "../../adapters/assignment-rules";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../../ui/table";
import type { AssignmentRulesLabels } from "./labels";

export function RuleTable({
  rules,
  labels,
  renderRow,
}: {
  rules: AssignmentRuleView[];
  labels: AssignmentRulesLabels;
  renderRow: (rule: AssignmentRuleView) => React.ReactNode;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>{labels.card.value}</TableHead>
            <TableHead>{labels.card.scope}</TableHead>
            <TableHead className="text-right">{labels.card.impact}</TableHead>
            <TableHead>{labels.card.active}</TableHead>
            <TableHead className="text-right">{labels.card.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rules.map((rule) => renderRow(rule))}</TableBody>
      </Table>
    </div>
  );
}
