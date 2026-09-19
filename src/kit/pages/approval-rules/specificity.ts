import {
  DIMENSION_WEIGHT,
  PINNED_DIMENSION_WEIGHT,
  type ApprovalRuleView,
  type DimensionKey,
  type RuleQuery,
} from "../../adapters/approval-rules";

export function pinnedDimensions(
  rule: ApprovalRuleView,
  dimensions: DimensionKey[],
): DimensionKey[] {
  return dimensions.filter((key) => !!rule.scope[key]);
}

export function pinnedCount(rule: ApprovalRuleView, dimensions: DimensionKey[]): number {
  return pinnedDimensions(rule, dimensions).length;
}

export function ruleSpecificity(rule: ApprovalRuleView, dimensions: DimensionKey[]): number {
  const pinned = pinnedDimensions(rule, dimensions);
  const weights = pinned.reduce((sum, key) => sum + DIMENSION_WEIGHT[key], 0);
  return PINNED_DIMENSION_WEIGHT * pinned.length + weights;
}

export function matchesQuery(
  rule: ApprovalRuleView,
  query: RuleQuery,
  dimensions: DimensionKey[],
): boolean {
  if (!rule.isActive) return false;
  if (rule.minAmount > query.amount) return false;
  return dimensions.every((key) => {
    const pinned = rule.scope[key];
    if (!pinned) return true;
    return pinned === query.scope[key];
  });
}

export function pickWinner(
  rules: ApprovalRuleView[],
  dimensions: DimensionKey[],
): ApprovalRuleView | null {
  let best: ApprovalRuleView | null = null;
  for (const rule of rules) {
    if (!best) {
      best = rule;
      continue;
    }
    const a = ruleSpecificity(rule, dimensions);
    const b = ruleSpecificity(best, dimensions);
    const wins =
      a > b ||
      (a === b &&
        (rule.minAmount > best.minAmount ||
          (rule.minAmount === best.minAmount && rule.createdAt > best.createdAt)));
    if (wins) best = rule;
  }
  return best;
}

export function orderRules(
  rules: ApprovalRuleView[],
  dimensions: DimensionKey[],
): ApprovalRuleView[] {
  return [...rules].sort((a, b) => {
    const byRank = ruleSpecificity(b, dimensions) - ruleSpecificity(a, dimensions);
    if (byRank !== 0) return byRank;
    if (b.minAmount !== a.minAmount) return b.minAmount - a.minAmount;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function findScopeTwin(
  rules: ApprovalRuleView[],
  candidate: {
    id?: string;
    scope: ApprovalRuleView["scope"];
    minAmount: number;
  },
  dimensions: DimensionKey[],
): ApprovalRuleView | null {
  return (
    rules.find(
      (rule) =>
        rule.id !== candidate.id &&
        rule.minAmount === candidate.minAmount &&
        dimensions.every((key) => (rule.scope[key] ?? null) === (candidate.scope[key] ?? null)),
    ) ?? null
  );
}

export function hasStrandedStep(
  rule: ApprovalRuleView,
  isApproverActive: (userId: string) => boolean,
): boolean {
  return rule.steps.some((userId) => !isApproverActive(userId));
}
