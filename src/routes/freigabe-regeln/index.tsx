import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  DeleteRuleDialog,
  RuleEditor,
  RuleTable,
  RuleTableRow,
  ScenarioForm,
  ScenarioResult,
  StatusSummary,
  hasStrandedStep,
  matchesQuery,
  orderRules,
  parseDecimal,
  pickWinner,
} from "@hub-kit/core/approval-rules";
import type { TesterQuery } from "@hub-kit/core/approval-rules";
import type { ApprovalRuleDraft, ApprovalRuleView } from "@hub-kit/core/adapters";
import { HintTooltip } from "@hub-kit/core/data-table";

import { KeinZugriff } from "@/components/layout/kein-zugriff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TablePagination, PAGE_SIZES } from "@/components/data-table/table-pagination";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { useApprovalRulesAdapter } from "@/hub/adapters/approval-rules";
import { useApprovalRulesLabels } from "@/hub/adapters/approval-rules-labels";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { useTranslation } from "@/lib/i18n";
import { tabSearch } from "@/lib/use-tab-param";
import { pageTitle } from "@/lib/brand";
import { fehlerText, formatDate, formatDateTime, formatEUR } from "@/lib/data/format";

export const Route = createFileRoute("/freigabe-regeln/")({
  validateSearch: tabSearch,
  head: () => ({ meta: [{ title: pageTitle("Freigabe-Regeln") }] }),
  component: FreigabeRegelnGuard,
});

function FreigabeRegelnGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageFreigabeRegeln)) return <KeinZugriff />;
  return <FreigabeRegelnRoute />;
}

const CREATING = "__new";
const EMPTY_SCENARIO: TesterQuery = { scope: {}, amount: 0, amountText: "0" };

function FreigabeRegelnRoute() {
  const { t } = useTranslation();
  const adapter = useApprovalRulesAdapter();
  const labels = useApprovalRulesLabels();

  // The chain an invoice takes when no rule matches. Two steps, not one: see
  // docs/APPROVAL_CHAIN_SHAPE.md §2.1 for why the default changed. This is the one part of the
  // model that lives in no table -- `approval_rules_scope_not_empty` forbids a catch-all rule
  // row, so the fallback can only be stated here.
  const config = {
    ...adapter.config,
    defaultChainLabels: [
      t("freigabeRegeln.leiter.standard.schritt1"),
      t("freigabeRegeln.leiter.standard.schritt2"),
    ],
  };
  const { scopeOptions, approvers, approverName } = adapter;
  const formatters = { formatDate, formatDateTime, formatMoney: formatEUR };

  const [tab, setTab] = useState("rules");
  const [draft, setDraft] = useState<TesterQuery>(EMPTY_SCENARIO);
  const [outcome, setOutcome] = useState<{
    winner: ApprovalRuleView | null;
    outranked: ApprovalRuleView[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const rules = useMemo(() => adapter.rules.data ?? [], [adapter.rules.data]);
  const ruleById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules]);
  const activeById = useMemo(
    () => new Map(approvers.map((person) => [person.id, person.isActive])),
    [approvers],
  );

  const rosterKnown = approvers.length > 0;
  const isApproverActive = (userId: string) =>
    rosterKnown ? (activeById.get(userId) ?? false) : true;
  const strandedCount = useMemo(
    () => rules.filter((rule) => rule.isActive && hasStrandedStep(rule, isApproverActive)).length,
    [rules, activeById],
  );

  const ordered = useMemo(() => orderRules(rules, config.dimensions), [rules, config.dimensions]);
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const pageRules = useMemo(
    () => ordered.slice(from === 0 ? 0 : from - 1, to),
    [ordered, from, to],
  );

  function checkScenario() {
    const amount = parseDecimal(draft.amountText) ?? 0;
    const matching = rules.filter((rule) =>
      matchesQuery(rule, { scope: draft.scope, amount }, config.dimensions),
    );
    const winner = pickWinner(matching, config.dimensions);
    setOutcome({ winner, outranked: matching.filter((rule) => rule.id !== winner?.id) });
  }

  async function handleSave(ruleDraft: ApprovalRuleDraft) {
    try {
      await adapter.saveRule(ruleDraft);
      toast.success(labels.toast.saved);
      setEditing(null);
      setOutcome(null);
    } catch (error) {
      const message = fehlerText(error);
      toast.error(
        /duplicate key|approval_rules_scope_unique/i.test(message)
          ? labels.editor.duplicate
          : labels.toast.failed(message),
      );
    }
  }

  async function handleToggle(rule: ApprovalRuleView, next: boolean) {
    try {
      await adapter.setRuleActive(rule.id, next);
      toast.success(next ? labels.toast.activated : labels.toast.deactivated);
      setOutcome(null);
    } catch (error) {
      toast.error(labels.toast.failed(fehlerText(error)));
    }
  }

  async function handleDelete(reason: string) {
    if (!deleting) return;
    try {
      await adapter.deleteRule(deleting, reason);
      toast.success(labels.toast.deleted);
      setDeleting(null);
      setEditing(null);
      setOutcome(null);
    } catch (error) {
      toast.error(labels.toast.failed(fehlerText(error)));
    }
  }

  return (
    <div>
      <header
        data-tour="approval-header"
        className="mt-2 flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{labels.title}</h1>
          <div className="mt-1.5">
            <StatusSummary
              activeRules={rules.filter((rule) => rule.isActive).length}
              issueCount={strandedCount}
              labels={labels}
              trailing={
                <HintTooltip
                  onlyWhenClipped={false}
                  label={
                    <span className="block max-w-[46ch]">
                      <span className="block font-semibold">{labels.summary.issuesTitleText}</span>
                      <span className="mt-1 block">{labels.summary.issuesHint}</span>
                    </span>
                  }
                >
                  <button
                    type="button"
                    aria-label={labels.summary.issuesTitleText}
                    className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Info className="size-3.5" />
                  </button>
                </HintTooltip>
              }
            />
          </div>
        </div>
        {tab === "rules" && (
          <Button
            className="gap-2"
            onClick={() => setEditing(editing === CREATING ? null : CREATING)}
          >
            <Plus className="size-4" /> {labels.ladder.newRule}
          </Button>
        )}
      </header>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList data-tour="approval-toolbar">
          <TabsTrigger value="rules">{labels.tabs.rules}</TabsTrigger>
          <TabsTrigger value="scenario">{labels.tabs.scenario}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <div data-tour="approval-list">
            {adapter.rules.isError ? (
              <div className="mt-4">
                <ErrorState error={adapter.rules.error} onRetry={adapter.rules.refetch} />
              </div>
            ) : adapter.rules.isLoading ? (
              <div className="mt-4">
                <TableSkeleton rows={4} cols={5} />
              </div>
            ) : rules.length === 0 ? (
              <p className="mt-8 py-8 text-center text-sm text-muted-foreground">
                {labels.ladder.empty}
              </p>
            ) : (
              <>
                <RuleTable
                  rules={pageRules}
                  labels={labels}
                  firstPriority={from}
                  renderRow={(rule, priority) => (
                    <RuleTableRow
                      key={rule.id}
                      rule={rule}
                      priority={priority}
                      config={config}
                      scopeOptions={scopeOptions}
                      approvers={approvers}
                      approverName={approverName}
                      labels={labels}
                      formatters={formatters}
                      isStranded={hasStrandedStep(rule, isApproverActive)}
                      isEditing={editing === rule.id}
                      onEdit={() => setEditing(editing === rule.id ? null : rule.id)}
                      onDelete={() => setDeleting(rule.id)}
                      onToggleActive={(next) => void handleToggle(rule, next)}
                    />
                  )}
                />
                {total > PAGE_SIZES[0] && (
                  <div className="mt-3">
                    <TablePagination
                      page={currentPage}
                      totalPages={totalPages}
                      pageSize={pageSize}
                      total={total}
                      from={from}
                      to={to}
                      onPage={setPage}
                      onPageSize={(size) => {
                        setPageSize(size);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scenario" className="mt-4" data-tour="approval-scenario">
          <ScenarioForm
            draft={draft}
            onDraftChange={setDraft}
            onCheck={checkScenario}
            onReset={() => {
              setDraft(EMPTY_SCENARIO);
              setOutcome(null);
            }}
            config={config}
            scopeOptions={scopeOptions}
            labels={labels}
            hasResult={outcome !== null}
          />

          {outcome ? (
            <ScenarioResult
              winner={outcome.winner}
              outranked={outcome.outranked}
              config={config}
              scopeOptions={scopeOptions}
              approvers={approvers}
              approverName={approverName}
              labels={labels}
              formatters={formatters}
              defaultChainSentence={config.defaultChainLabels.join(" → ")}
            />
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
              <p className="text-sm font-medium">{labels.tester.idle}</p>
              <p className="mx-auto mt-1 max-w-[62ch] text-xs text-muted-foreground">
                {labels.tester.idleHint}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editing === CREATING ? labels.ladder.newRule : labels.row.edit}
            </DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <RuleEditor
              key={editing}
              rule={editing === CREATING ? undefined : ruleById.get(editing)}
              allRules={rules}
              config={config}
              scopeOptions={scopeOptions}
              approvers={approvers}
              labels={labels}
              isSaving={adapter.isSaving}
              onSave={(next) => void handleSave(next)}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DeleteRuleDialog
        open={!!deleting}
        onOpenChange={(open) => setDeleting(open ? deleting : null)}
        labels={labels}
        onConfirm={(reason) => void handleDelete(reason)}
      />
    </div>
  );
}
