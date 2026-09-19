import { useMemo, useState } from "react";
import { ArrowUpDown, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Switch } from "../../ui/switch";
import { Combobox } from "../../ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import {
  OPOS_CATEGORIES,
  OPOS_SCOPES,
  OPOS_TERM_MIN_LENGTH,
  asciiSpelling,
  shadowingRule,
} from "../../lib/opos-whitelist";
import type { NewOposRule, OposRule, OposWhitelistAdapter } from "../../adapters/opos-whitelist";
import { englishOposWhitelistLabels, type OposWhitelistLabels } from "./labels";

type StatusFilter = "all" | "active" | "inactive";
type HitsFilter = "all" | "with" | "without";
type SortKey = "category" | "term" | "hits" | "created";

const ALL = "__all";

export interface OposWhitelistPageProps {
  adapter: OposWhitelistAdapter;
  labels?: OposWhitelistLabels;
}

export function OposWhitelistPage({
  adapter,
  labels = englishOposWhitelistLabels,
}: OposWhitelistPageProps) {
  const rulesQuery = adapter.useRules();
  const hitsQuery = adapter.useHitCounts();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [hitsFilter, setHitsFilter] = useState<HitsFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "category",
    direction: "asc",
  });
  const [reapplying, setReapplying] = useState(false);
  const [editingRule, setEditingRule] = useState<OposRule | null | "new">(null);

  const rules = rulesQuery.data;
  const hits = hitsQuery.data;

  const shadowedBy = useMemo(() => {
    const map = new Map<string, OposRule>();
    for (const rule of rules) {
      const winner = shadowingRule(rule, rules);
      if (winner) map.set(rule.id, winner);
    }
    return map;
  }, [rules]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = rules.filter((rule) => {
      if (term && !`${rule.term} ${rule.note ?? ""}`.toLowerCase().includes(term)) return false;
      if (category !== ALL && rule.category !== category) return false;
      if (status === "active" && !rule.is_active) return false;
      if (status === "inactive" && rule.is_active) return false;
      const count = hits.get(rule.id) ?? 0;
      if (hitsFilter === "with" && count === 0) return false;
      if (hitsFilter === "without" && count > 0) return false;
      return true;
    });
    const direction = sort.direction === "asc" ? 1 : -1;
    const rank = (rule: OposRule) => OPOS_CATEGORIES.indexOf(rule.category);
    return [...visible].sort((a, b) => {
      let d = 0;
      if (sort.key === "category") d = rank(a) - rank(b);
      else if (sort.key === "term") d = a.term.localeCompare(b.term);
      else if (sort.key === "hits") d = (hits.get(a.id) ?? 0) - (hits.get(b.id) ?? 0);
      else d = a.created_at.localeCompare(b.created_at);
      if (d !== 0) return d * direction;
      return a.term.localeCompare(b.term);
    });
  }, [rules, hits, search, category, status, hitsFilter, sort]);

  const filtersActive =
    search.trim() !== "" || category !== ALL || status !== "all" || hitsFilter !== "all";

  async function reapplyAll() {
    setReapplying(true);
    try {
      const result = await adapter.reapplyAll();
      toast.success(labels.reappliedToast(result.affected));
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    } finally {
      setReapplying(false);
    }
  }

  async function setActive(rule: OposRule, active: boolean) {
    try {
      await adapter.setActive(rule.id, active);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        {adapter.canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={reapplying}
              onClick={reapplyAll}
            >
              <RefreshCw className={cn("size-4", reapplying && "animate-spin")} />
              {reapplying ? labels.reapplying : labels.reapplyButton}
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setEditingRule("new")}>
              <Plus className="size-4" /> {labels.newRuleButton}
            </Button>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-2xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {labels.hint}
      </p>
      {!adapter.canWrite && (
        <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{labels.readOnlyHint}</p>
      )}

      {rulesQuery.error ? (
        <div className="mt-6">
          <ErrorState error={rulesQuery.error} onRetry={() => {}} />
        </div>
      ) : rulesQuery.loading ? (
        <div className="mt-6">
          <TableSkeleton rows={6} columns={5} />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="h-9 w-full sm:w-64"
            />
            <Combobox
              value={category}
              onValueChange={setCategory}
              className="h-9 w-full sm:w-52"
              options={[
                { value: ALL, label: labels.categoryAll },
                ...OPOS_CATEGORIES.map((c) => ({ value: c, label: labels.category[c] })),
              ]}
            />
            <Combobox
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
              className="h-9 w-full sm:w-44"
              options={[
                { value: "all", label: labels.statusAll },
                { value: "active", label: labels.statusActive },
                { value: "inactive", label: labels.statusInactive },
              ]}
            />
            <Combobox
              value={hitsFilter}
              onValueChange={(v) => setHitsFilter(v as HitsFilter)}
              className="h-9 w-full sm:w-44"
              options={[
                { value: "all", label: labels.hitsAll },
                { value: "with", label: labels.hitsWith },
                { value: "without", label: labels.hitsWithout },
              ]}
            />
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory(ALL);
                  setStatus("all");
                  setHitsFilter("all");
                }}
              >
                {labels.resetFilters}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {labels.shownOfTotal(filtered.length, rules.length)}
            </span>
          </div>

          <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>
                    <SortHeader
                      active={sort.key === "category"}
                      direction={sort.direction}
                      label={labels.columnCategory}
                      onClick={() => toggleSort("category")}
                    />
                  </TableHead>
                  <TableHead>{labels.columnScope}</TableHead>
                  <TableHead>
                    <SortHeader
                      active={sort.key === "term"}
                      direction={sort.direction}
                      label={labels.columnTerm}
                      onClick={() => toggleSort("term")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      active={sort.key === "hits"}
                      direction={sort.direction}
                      label={labels.columnHits}
                      onClick={() => toggleSort("hits")}
                    />
                  </TableHead>
                  <TableHead>{labels.columnNote}</TableHead>
                  <TableHead>
                    <SortHeader
                      active={sort.key === "created"}
                      direction={sort.direction}
                      label={labels.columnCreated}
                      onClick={() => toggleSort("created")}
                    />
                  </TableHead>
                  <TableHead className="w-[80px] text-center">{labels.columnActive}</TableHead>
                  <TableHead className="w-[104px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rule) => (
                  <TableRow key={rule.id} className={cn(!rule.is_active && "opacity-60")}>
                    <TableCell>
                      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {labels.category[rule.category]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {labels.scope[rule.scope]}
                    </TableCell>
                    <TableCell className="min-w-[160px] break-words font-medium text-foreground">
                      {rule.term}
                      {shadowedBy.has(rule.id) && (
                        <span className="ml-1.5 inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          {labels.shadowedBy(shadowedBy.get(rule.id)!.term)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hits.get(rule.id) ?? 0}
                    </TableCell>
                    <TableCell className="max-w-[260px] break-words text-sm text-muted-foreground">
                      {rule.note ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{adapter.formatDate(rule.created_at)}</div>
                      {rule.created_by && <div className="truncate">{rule.created_by}</div>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => setActive(rule, v)}
                        disabled={!adapter.canWrite}
                      />
                    </TableCell>
                    <TableCell>
                      {adapter.canWrite && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title={labels.editButton}
                            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => setEditingRule(rule)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <DeleteRuleButton
                            rule={rule}
                            hitCount={hits.get(rule.id) ?? 0}
                            adapter={adapter}
                            labels={labels}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      {rules.length === 0 ? labels.empty : labels.noMatches}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editingRule && (
        <RuleDialog
          rule={editingRule === "new" ? null : editingRule}
          adapter={adapter}
          labels={labels}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}

function SortHeader({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean;
  direction: "asc" | "desc";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1 font-medium hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={onClick}
    >
      {label}
      <ArrowUpDown className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

function DeleteRuleButton({
  rule,
  hitCount,
  adapter,
  labels,
}: {
  rule: OposRule;
  hitCount: number;
  adapter: OposWhitelistAdapter;
  labels: OposWhitelistLabels;
}) {
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      await adapter.deleteRule(rule.id);
      toast.success(labels.deletedToast);
      setOpen(false);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title={labels.deleteButton}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.deleteDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {hitCount > 0
              ? labels.deleteDialogDescriptionWithHits(hitCount)
              : labels.deleteDialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {labels.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RuleDialog({
  rule,
  adapter,
  labels,
  onClose,
}: {
  rule: OposRule | null;
  adapter: OposWhitelistAdapter;
  labels: OposWhitelistLabels;
  onClose: () => void;
}) {
  const [term, setTerm] = useState(rule?.term ?? "");
  const [scope, setScope] = useState(rule?.scope ?? OPOS_SCOPES[0]);
  const [category, setCategory] = useState(rule?.category ?? OPOS_CATEGORIES[0]);
  const [note, setNote] = useState(rule?.note ?? "");
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const suggestion = asciiSpelling(term);

  async function save() {
    if (term.trim().length < OPOS_TERM_MIN_LENGTH) {
      setError(labels.fieldTermTooShort(OPOS_TERM_MIN_LENGTH));
      return;
    }
    setError("");
    setIsSaving(true);
    const input: NewOposRule = { term: term.trim(), scope, category, note: note.trim(), isActive };
    try {
      if (rule) await adapter.updateRule(rule.id, input);
      else await adapter.createRule(input);
      toast.success(labels.ruleSaved);
      onClose();
    } catch (e) {
      toast.error(labels.saveFailed(readableErrorMessage(e, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? labels.editRuleTitle : labels.newRuleTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldTerm}</Label>
            <Input
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setError("");
              }}
              aria-invalid={!!error}
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldTermHint(OPOS_TERM_MIN_LENGTH)}
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {suggestion && (
              <p className="text-xs text-amber-700">{labels.asciiSuggestion(suggestion)}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldScope}</Label>
            <Combobox
              value={scope}
              onValueChange={(v) => setScope(v as typeof scope)}
              options={OPOS_SCOPES.map((s) => ({ value: s, label: labels.scope[s] }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldCategory}</Label>
            <Combobox
              value={category}
              onValueChange={(v) => setCategory(v as typeof category)}
              options={OPOS_CATEGORIES.map((c) => ({ value: c, label: labels.category[c] }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldNote}</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.fieldNotePlaceholder}
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            {labels.fieldActive}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {isSaving ? labels.saving : labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
