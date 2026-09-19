import {
  DIMENSION_WEIGHT,
  type AssignmentRuleView,
  type DimensionKey,
  type AssignmentRuleQuery,
} from "../../adapters/assignment-rules";

const REFERENCE_WEIGHT = 16;
const PINNED_WEIGHT = 32;

export function pinnedDimensions(
  rule: AssignmentRuleView,
  dimensions: DimensionKey[],
): DimensionKey[] {
  return dimensions.filter((key) => !!rule.scope[key]);
}

export function ruleSpecificity(rule: AssignmentRuleView, dimensions: DimensionKey[]): number {
  const pinned = pinnedDimensions(rule, dimensions);
  const hasReference = !!rule.referencePattern;
  const pinnedCount = pinned.length + (hasReference ? 1 : 0);
  const weightSum =
    pinned.reduce((sum, key) => sum + DIMENSION_WEIGHT[key], 0) +
    (hasReference ? REFERENCE_WEIGHT : 0);
  return PINNED_WEIGHT * pinnedCount + weightSum;
}

export function matchesQuery(
  rule: AssignmentRuleView,
  query: AssignmentRuleQuery,
  dimensions: DimensionKey[],
): boolean {
  if (!rule.isActive) return false;

  const scopeMatches = dimensions.every((key) => {
    const pinned = rule.scope[key];
    return !pinned || pinned === query.scope[key];
  });
  if (!scopeMatches) return false;

  if (rule.referencePattern) {
    return query.reference.toLowerCase().includes(rule.referencePattern.toLowerCase());
  }
  return true;
}

export function pickWinner(
  rules: AssignmentRuleView[],
  dimensions: DimensionKey[],
): AssignmentRuleView | null {
  let best: AssignmentRuleView | null = null;
  for (const rule of rules) {
    if (!best) {
      best = rule;
      continue;
    }
    const a = ruleSpecificity(rule, dimensions);
    const b = ruleSpecificity(best, dimensions);
    const wins = a > b || (a === b && rule.createdAt > best.createdAt);
    if (wins) best = rule;
  }
  return best;
}

export function orderRules(
  rules: AssignmentRuleView[],
  dimensions: DimensionKey[],
): AssignmentRuleView[] {
  return [...rules].sort((a, b) => {
    const byRank = ruleSpecificity(b, dimensions) - ruleSpecificity(a, dimensions);
    if (byRank !== 0) return byRank;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function findScopeTwin(
  rules: AssignmentRuleView[],
  candidate: {
    id?: string;
    scope: AssignmentRuleView["scope"];
    referencePattern: string | null;
  },
  dimensions: DimensionKey[],
): AssignmentRuleView | null {
  return (
    rules.find(
      (rule) =>
        rule.id !== candidate.id &&
        (rule.referencePattern ?? null) === (candidate.referencePattern ?? null) &&
        dimensions.every((key) => (rule.scope[key] ?? null) === (candidate.scope[key] ?? null)),
    ) ?? null
  );
}
