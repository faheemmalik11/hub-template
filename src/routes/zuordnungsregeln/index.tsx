import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApplyAssignmentRuleBulk,
  useBwaAccountMapping,
  useBwaCategories,
  useGesellschaften,
  useLieferanten,
  useRulePreview,
  useRulePreviewScope,
  useSuggestAssignmentRules,
} from "@/lib/data/queries";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { TablePagination, PAGE_SIZES } from "@/components/data-table/table-pagination";
import { useTranslation } from "@/lib/i18n";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { useTableView } from "@/lib/use-table-view";
import type { BwaCategory } from "@/lib/data/types";
import { KiImportKontenrahmenDialog } from "@/components/zuordnung/ki-import-kontenrahmen-dialog";
import { pageTitle } from "@/lib/brand";
import { fehlerText } from "@/lib/data/format";
import {
  DeleteRuleDialog,
  RuleEditor,
  RuleTable,
  RuleTableRow,
  ScenarioForm,
  ScenarioResult,
  matchesQuery,
  orderRules,
  pickWinner,
  type AssignmentRuleDraftSeed,
  type RuleImpact,
} from "@hub-kit/core/assignment-rules";
import type {
  AssignmentRuleDraft,
  AssignmentRuleQuery,
  AssignmentRuleView,
} from "@hub-kit/core/adapters";
import { SearchInput } from "@hub-kit/core/data-table";

import { useAssignmentRulesAdapter } from "@/hub/adapters/assignment-rules";
import { useAssignmentRulesLabels } from "@/hub/adapters/assignment-rules-labels";

export const Route = createFileRoute("/zuordnungsregeln/")({
  validateSearch: tabSearch,
  // The first-paint fallback only. The real title follows the active tab and is set in the
  // component below, because `head` is static per route and cannot see `?tab=`.
  head: () => ({ meta: [{ title: pageTitle("Kategorien") }] }),
  component: ZuordnungsregelnPage,
});

// A plain number input lets the mouse scroll wheel silently change the fiscal year (a native
// <input type="number"> quirk); a searchable Combobox avoids that entirely. Built once at module
// scope, not per render — 101 options is cheap to build but no reason to redo it every time.
const FISCAL_YEAR_OPTIONS: ComboboxOption[] = Array.from({ length: 2099 - 1999 + 1 }, (_, i) => {
  const year = 1999 + i;
  return { value: String(year), label: String(year) };
});

const TABS = ["regeln", "spielplatz", "kontenrahmen", "vorschlaege"] as const;
const VISIBLE_TABS = TABS.filter((key) => key !== "kontenrahmen");
type Tab = (typeof TABS)[number];

const CREATING = "__new";
const EMPTY_SCENARIO: AssignmentRuleQuery = { scope: {}, reference: "" };

type Adapter = ReturnType<typeof useAssignmentRulesAdapter>;
type Labels = ReturnType<typeof useAssignmentRulesLabels>;

function ZuordnungsregelnPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "regeln");

  // Radix unmounts an inactive TabsContent, which threw away everything the tab you left was
  // holding: the Kontenrahmen company selector reset to the default on a plain in-app tab click.
  // Panels now stay mounted once opened and are hidden with CSS instead.
  const [besucht, setBesucht] = useState<Set<Tab>>(() => new Set([tab]));
  useEffect(() => {
    setBesucht((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  useEffect(() => {
    document.title = pageTitle(t(`zuordnungsregeln.doktitel.${tab}`));
  }, [t, tab]);

  const [regelVorlage, setRegelVorlage] = useState<{
    supplierId: string;
    categoryId: string;
  } | null>(null);

  const panel = (value: Tab, inhalt: ReactNode) => (
    <TabsContent
      value={value}
      forceMount={besucht.has(value) ? true : undefined}
      className="mt-4 data-[state=inactive]:hidden"
    >
      {inhalt}
    </TabsContent>
  );

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("zuordnungsregeln.list.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("zuordnungsregeln.list.subtitle")}
      </p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList
          data-tour="assignment-tabs"
          className="h-auto w-full flex-wrap justify-start gap-1"
        >
          {VISIBLE_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`zuordnungsregeln.tab.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {panel(
          "regeln",
          <RegelnTab vorlage={regelVorlage} onVorlageFertig={() => setRegelVorlage(null)} />,
        )}
        {panel("spielplatz", <SpielplatzTab />)}
        {panel("kontenrahmen", <KontenrahmenTab />)}
        {panel(
          "vorschlaege",
          <VorschlaegeTab
            onRegelAnlegen={(vorlage) => {
              setRegelVorlage(vorlage);
              setTab("regeln");
            }}
          />,
        )}
      </Tabs>
    </div>
  );
}

function AssignmentRuleRow({
  rule,
  adapter,
  labels,
  isEditing,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  rule: AssignmentRuleView;
  adapter: Adapter;
  labels: Labels;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
}) {
  const previewQ = useRulePreview(rule.id);
  const applyBulk = useApplyAssignmentRuleBulk();

  const impact: RuleImpact = {
    isLoading: previewQ.isLoading,
    wouldChange: previewQ.data?.would_change ?? 0,
    matches: previewQ.data?.matches ?? 0,
  };

  return (
    <RuleTableRow
      rule={rule}
      dimensions={adapter.config.dimensions}
      scopeOptions={adapter.scopeOptions}
      labels={labels}
      impact={impact}
      isApplying={applyBulk.isPending}
      isEditing={isEditing}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleActive={onToggleActive}
      onApply={() =>
        applyBulk.mutate(rule.id, {
          onSuccess: (res) => {
            if (res.changed === 0) toast.info(labels.toast.appliedNone);
            else if (res.skipped > 0)
              toast.success(labels.toast.appliedSkipped(res.changed, res.matches, res.skipped));
            else toast.success(labels.toast.applied(res.changed, res.matches));
          },
          onError: (error) => toast.error(labels.toast.failed(fehlerText(error))),
        })
      }
    />
  );
}

function RegelnTab({
  vorlage,
  onVorlageFertig,
}: {
  vorlage: { supplierId: string; categoryId: string } | null;
  onVorlageFertig: () => void;
}) {
  const adapter = useAssignmentRulesAdapter();
  const labels = useAssignmentRulesLabels();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);
  const [editing, setEditing] = useState<string | null>(vorlage ? CREATING : null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<AssignmentRuleDraft | null>(null);

  useEffect(() => {
    if (vorlage) setEditing(CREATING);
  }, [vorlage]);

  const rules = useMemo(() => adapter.rules.data ?? [], [adapter.rules.data]);
  const ruleById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules]);
  const ordered = useMemo(
    () => orderRules(rules, adapter.config.dimensions),
    [rules, adapter.config.dimensions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((rule) =>
      [
        rule.categoryLabel,
        rule.referencePattern ?? "",
        ...adapter.config.dimensions.map((key) => {
          const id = rule.scope[key];
          const option = id ? (adapter.scopeOptions[key] ?? []).find((o) => o.id === id) : null;
          return option?.label ?? option?.code ?? "";
        }),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ordered, search, adapter.config.dimensions, adapter.scopeOptions]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const pageRules = useMemo(
    () => filtered.slice(from === 0 ? 0 : from - 1, to),
    [filtered, from, to],
  );

  const previewInput = previewDraft
    ? {
        target: "cost_category" as const,
        category_id: previewDraft.categoryId || null,
        supplier_id: previewDraft.scope.supplier ?? null,
        property_id: previewDraft.scope.property ?? null,
        company_id: previewDraft.scope.company ?? null,
        reference_pattern: previewDraft.referencePattern,
      }
    : null;
  const previewQ = useRulePreviewScope(previewInput, previewDraft?.id);
  const preview = previewDraft
    ? {
        isLoading: previewQ.isLoading,
        wouldChange: previewQ.data?.would_change ?? 0,
        matches: previewQ.data?.matches ?? 0,
      }
    : undefined;

  function closeEditor() {
    setEditing(null);
    setPreviewDraft(null);
    onVorlageFertig();
  }

  async function handleSave(draft: AssignmentRuleDraft) {
    try {
      await adapter.saveRule(draft);
      toast.success(labels.toast.saved);
      closeEditor();
    } catch (error) {
      toast.error(labels.toast.failed(fehlerText(error)));
    }
  }

  async function handleToggle(rule: AssignmentRuleView, next: boolean) {
    try {
      await adapter.setRuleActive(rule.id, next);
      toast.success(next ? labels.toast.activated : labels.toast.deactivated);
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
      closeEditor();
    } catch (error) {
      toast.error(labels.toast.failed(fehlerText(error)));
    }
  }

  const editingRule = editing && editing !== CREATING ? ruleById.get(editing) : undefined;
  const seed: AssignmentRuleDraftSeed | undefined =
    editing === CREATING && vorlage
      ? { scope: { supplier: vorlage.supplierId }, categoryId: vorlage.categoryId }
      : undefined;

  return (
    <div data-tour="assignment-rules">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={labels.toolbar.search}
          className="min-w-[240px] flex-1 max-w-none"
        />
        <Button
          className="gap-2"
          onClick={() => setEditing(editing === CREATING ? null : CREATING)}
        >
          {labels.toolbar.newRule}
        </Button>
      </div>

      {adapter.rules.isError ? (
        <div className="mt-6">
          <ErrorState error={adapter.rules.error} onRetry={adapter.rules.refetch} />
        </div>
      ) : adapter.rules.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : rules.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={labels.empty.title} hint={labels.empty.hint} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={labels.empty.noMatches} hint={labels.empty.noMatchesHint} />
        </div>
      ) : (
        <>
          <RuleTable
            rules={pageRules}
            labels={labels}
            renderRow={(rule) => (
              <AssignmentRuleRow
                key={rule.id}
                rule={rule}
                adapter={adapter}
                labels={labels}
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editing === CREATING ? labels.toolbar.newRule : labels.row.edit}
            </DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <RuleEditor
              key={editing}
              rule={editingRule}
              seed={seed}
              allRules={rules}
              config={adapter.config}
              scopeOptions={adapter.scopeOptions}
              categories={adapter.categories}
              labels={labels}
              isSaving={adapter.isSaving}
              preview={preview}
              onDraftChange={setPreviewDraft}
              onSave={(draft) => void handleSave(draft)}
              onCancel={closeEditor}
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

function SpielplatzTab() {
  const adapter = useAssignmentRulesAdapter();
  const labels = useAssignmentRulesLabels();

  const [draft, setDraft] = useState<AssignmentRuleQuery>(EMPTY_SCENARIO);
  const [outcome, setOutcome] = useState<{
    winner: AssignmentRuleView | null;
    outranked: AssignmentRuleView[];
  } | null>(null);

  const rules = useMemo(() => adapter.rules.data ?? [], [adapter.rules.data]);

  function checkScenario() {
    const matching = rules.filter((rule) => matchesQuery(rule, draft, adapter.config.dimensions));
    const winner = pickWinner(matching, adapter.config.dimensions);
    setOutcome({ winner, outranked: matching.filter((rule) => rule.id !== winner?.id) });
  }

  return (
    <div data-tour="assignment-playground">
      <ScenarioForm
        draft={draft}
        onDraftChange={setDraft}
        onCheck={checkScenario}
        onReset={() => {
          setDraft(EMPTY_SCENARIO);
          setOutcome(null);
        }}
        config={adapter.config}
        scopeOptions={adapter.scopeOptions}
        labels={labels}
        hasResult={outcome !== null}
      />

      {outcome ? (
        <ScenarioResult
          winner={outcome.winner}
          outranked={outcome.outranked}
          config={adapter.config}
          scopeOptions={adapter.scopeOptions}
          labels={labels}
        />
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center">
          <p className="text-sm font-medium">{labels.tester.idle}</p>
          <p className="mx-auto mt-1 max-w-[62ch] text-xs text-muted-foreground">
            {labels.tester.idleHint}
          </p>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Kategorien tab — manage the two-level taxonomy (Appendix A3)
// ===========================================================================

function KontenrahmenTab() {
  const { t } = useTranslation();
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const companiesQ = useGesellschaften();
  // useMemo, not a bare `?? []`: the fallback array is a new identity on every render, so the
  // useEffect depending on it re-ran every time even when nothing had changed.
  const companies = useMemo(() => companiesQ.data ?? [], [companiesQ.data]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Each company keeps its OWN mapping even when account numbers happen to match — there is no
  // "all companies" view here, unlike UstRegelnTab, since two companies' rows for the same
  // account number would render as confusingly duplicate lines. No default company is preferred
  // here (unlike immonetz's IMKO default) since Stay's chart-of-accounts setup starts empty for
  // every company; falls back to the first company once loaded.
  useEffect(() => {
    if (companyId || companies.length === 0) return;
    setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const mappingQ = useBwaAccountMapping(jahr, companyId);
  const categoriesQ = useBwaCategories();
  const [suche, setSuche] = useState("");
  const categoryById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const rows = mappingQ.data ?? [];
    if (!q) return rows;
    return rows.filter((m) =>
      `${m.account} ${categoryById.get(m.category_id)?.name ?? ""} ${m.note ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [mappingQ.data, suche, categoryById]);

  const view = useTableView(gefiltert, {
    sortValue: (m) => m.account,
    initialSort: "account",
    // The search term joins the reset key: narrowing to two matches while sitting on page 4 must
    // land on page 1, not on a page that no longer exists.
    resetKey: `${companyId ?? ""}-${jahr}-${suche}`,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-xs space-y-1.5 sm:w-auto">
            <Label>{t("kontenrahmen.gesellschaft")}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={companies.map((g) => ({
                value: g.id,
                label: `${g.code} · ${g.name}`,
                keywords: g.name,
              }))}
              className="w-full sm:w-80"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("kontenrahmen.jahr")}</Label>
            <Combobox
              value={String(jahr)}
              onValueChange={(v) => setJahr(Number(v))}
              options={FISCAL_YEAR_OPTIONS}
              className="w-28"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-72">
            <Label>{t("kontenrahmen.suche")}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder={t("kontenrahmen.suchePlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <KiImportKontenrahmenDialog
          companies={companies}
          categories={categoriesQ.data ?? []}
          defaultCompanyId={companyId}
          defaultJahr={jahr}
        />
      </div>

      <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("kontenrahmen.hinweis")}
      </p>

      {!companyId ? null : mappingQ.isError ? (
        <div className="mt-6">
          <ErrorState error={mappingQ.error} onRetry={() => mappingQ.refetch()} />
        </div>
      ) : mappingQ.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={6} cols={3} />
        </div>
      ) : (mappingQ.data ?? []).length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("kontenrahmen.empty")} hint={t("kontenrahmen.emptyHint")} />
        </div>
      ) : gefiltert.length === 0 ? (
        // Deliberately a different message from the one above: "this company has no chart of
        // accounts yet" and "your search matched none of its accounts" need different actions.
        <div className="mt-6">
          <EmptyState
            title={t("kontenrahmen.keineTreffer")}
            hint={t("kontenrahmen.keineTrefferHint")}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden rounded-xl border border-border sm:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("kontenrahmen.col.konto")}</TableHead>
                  <TableHead>{t("kontenrahmen.col.kategorie")}</TableHead>
                  <TableHead>{t("kontenrahmen.col.notiz")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.account}</TableCell>
                    <TableCell>{categoryById.get(m.category_id)?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-6 space-y-3 sm:hidden">
            {view.pageRows.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm text-foreground">{m.account}</span>
                  <span className="text-sm text-foreground">
                    {categoryById.get(m.category_id)?.name ?? "—"}
                  </span>
                </div>
                {m.note && <p className="mt-1 text-xs text-muted-foreground">{m.note}</p>}
              </div>
            ))}
          </div>
          <TablePagination
            page={view.page}
            totalPages={view.totalPages}
            pageSize={view.pageSize}
            total={view.total}
            from={view.from}
            to={view.to}
            onPage={view.setPage}
            onPageSize={view.setPageSize}
          />
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Vorschläge tab — read-only. Suggestions from existing receipts, nothing more.
// ===========================================================================

// This tab used to let you pick a category per supplier and turn the row into a real
// assignment_rules row, one at a time or all at once. It no longer does: it reports what the
// existing receipts suggest, and "Regel anlegen" hands that supplier and category to the rule
// dialog on the Regeln tab. Rules are written where their consequences are visible -- that dialog
// shows the retroactive "this would change N of M receipts" preview first. This screen never did.
//
// It also only lists suggestions that land on a REAL category. A supplier whose receipts are
// filed under the catch-all "Nicht zugeordnet" (is_catchall), or under free text that matches
// nothing in the taxonomy, is not a suggestion -- it is a receipt nobody has classified yet, and
// presenting it as a proposal invited exactly the mistake the audit found: accepting "Nicht
// zugeordnet" as though it were a decision.
function VorschlaegeTab({
  onRegelAnlegen,
}: {
  onRegelAnlegen: (vorlage: { supplierId: string; categoryId: string }) => void;
}) {
  const { t } = useTranslation();
  const suggestionsQ = useSuggestAssignmentRules();
  const lieferantenQ = useLieferanten();
  const categoriesQ = useBwaCategories();
  const [suche, setSuche] = useState("");

  const categoryById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );
  const categoryIdByNameLower = useMemo(
    () =>
      new Map(
        (categoriesQ.data ?? [])
          .filter((c) => !c.is_catchall)
          .map((c) => [c.name.toLowerCase(), c.id]),
      ),
    [categoriesQ.data],
  );
  const lieferantById = useMemo(
    () => new Map((lieferantenQ.data ?? []).map((l) => [l.id, l])),
    [lieferantenQ.data],
  );

  const zeilen = useMemo(() => {
    const label = (c: BwaCategory) => {
      const parent = c.parent_id ? categoryById.get(c.parent_id) : null;
      return parent ? `${parent.name} › ${c.name}` : c.name;
    };
    const out: {
      supplierId: string;
      name: string;
      kategorie: BwaCategory;
      label: string;
      belege: number;
      gesamt: number;
    }[] = [];
    for (const s of suggestionsQ.data ?? []) {
      const viaId = s.category_id ? categoryById.get(s.category_id) : undefined;
      const viaName = categoryIdByNameLower.get((s.cost_category ?? "").trim().toLowerCase());
      const kategorie = viaId ?? (viaName ? categoryById.get(viaName) : undefined);
      if (!kategorie || kategorie.is_catchall) continue;
      out.push({
        supplierId: s.supplier_id,
        name: lieferantById.get(s.supplier_id)?.name ?? s.supplier_id,
        kategorie,
        label: label(kategorie),
        belege: s.receipt_count,
        gesamt: s.total_receipts,
      });
    }
    return out;
  }, [suggestionsQ.data, categoryById, categoryIdByNameLower, lieferantById]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return zeilen;
    return zeilen.filter((z) => `${z.name} ${z.label}`.toLowerCase().includes(q));
  }, [zeilen, suche]);

  const view = useTableView(gefiltert, {
    sortValue: (z, key) => (key === "belege" ? z.belege : z.name),
    initialSort: "belege",
    initialDir: "desc",
    resetKey: suche,
  });

  return (
    <div data-tour="assignment-suggestions">
      <SearchInput value={suche} onValueChange={setSuche} placeholder={t("vorschlaege.suche")} />
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t("vorschlaege.hinweis")}</p>

      {suggestionsQ.isError ? (
        <div className="mt-6">
          <ErrorState error={suggestionsQ.error} onRetry={() => suggestionsQ.refetch()} />
        </div>
      ) : suggestionsQ.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={6} cols={4} />
        </div>
      ) : zeilen.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t("vorschlaege.empty")} hint={t("vorschlaege.emptyHint")} />
        </div>
      ) : gefiltert.length === 0 ? (
        // Distinct from the empty state above: "there is nothing to suggest" and "your search
        // matched none of the suggestions" are different situations.
        <div className="mt-6">
          <EmptyState
            title={t("vorschlaege.keineTreffer")}
            hint={t("vorschlaege.keineTrefferHint")}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-xl border border-border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vorschlaege.col.lieferant")}</TableHead>
                  <TableHead>{t("vorschlaege.col.belege")}</TableHead>
                  <TableHead>{t("vorschlaege.col.kategorie")}</TableHead>
                  <TableHead className="text-right">{t("vorschlaege.col.aktion")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((z) => (
                  <TableRow key={z.supplierId}>
                    <TableCell className="font-medium text-foreground">{z.name}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {t("vorschlaege.belegeCount", { n: z.belege, total: z.gesamt })}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{z.label}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() =>
                          onRegelAnlegen({ supplierId: z.supplierId, categoryId: z.kategorie.id })
                        }
                      >
                        {t("vorschlaege.action.regelAnlegen")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-6 space-y-3 sm:hidden">
            {view.pageRows.map((z) => (
              <div key={z.supplierId} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium text-foreground">{z.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {t("vorschlaege.belegeCount", { n: z.belege, total: z.gesamt })}
                </p>
                <p className="mt-2 text-sm text-foreground">{z.label}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() =>
                    onRegelAnlegen({ supplierId: z.supplierId, categoryId: z.kategorie.id })
                  }
                >
                  {t("vorschlaege.action.regelAnlegen")}
                </Button>
              </div>
            ))}
          </div>
          <TablePagination
            page={view.page}
            totalPages={view.totalPages}
            pageSize={view.pageSize}
            total={view.total}
            from={view.from}
            to={view.to}
            onPage={view.setPage}
            onPageSize={view.setPageSize}
          />
        </>
      )}
    </div>
  );
}
