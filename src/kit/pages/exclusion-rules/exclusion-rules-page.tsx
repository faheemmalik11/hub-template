import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import {
  EXCLUSION_SCOPES_AFTER_READING,
  EXCLUSION_SCOPES_BEFORE_READING,
  type ExclusionImpact,
  type ExclusionRule,
  type ExclusionRulesAdapter,
  type ExclusionScope,
} from "../../adapters/exclusion-rules";
import { englishExclusionRulesLabels, type ExclusionRulesLabels } from "./labels";
import type { QueryResult } from "../../lib/query-result";

export interface ExclusionRulesPageProps {
  adapter: ExclusionRulesAdapter;
  labels?: ExclusionRulesLabels;
}

export function ExclusionRulesPage({
  adapter,
  labels = englishExclusionRulesLabels,
}: ExclusionRulesPageProps) {
  const rulesQuery = adapter.useExclusionRules();
  const rules = rulesQuery.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <NewRuleDialog adapter={adapter} labels={labels} />
      </div>

      {rulesQuery.isError ? (
        <div className="mt-6">
          <ErrorState error={rulesQuery.error} onRetry={rulesQuery.refetch} />
        </div>
      ) : rulesQuery.isLoading ? (
        <div className="mt-6">
          <TableSkeleton rows={5} columns={4} />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.columns.scope}</TableHead>
                  <TableHead>{labels.columns.term}</TableHead>
                  <TableHead>{labels.columns.note}</TableHead>
                  <TableHead className="w-[80px] text-center">{labels.columns.active}</TableHead>
                  <TableHead className="w-[64px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.isActive ? "" : "opacity-60"}>
                    <TableCell>
                      <ScopeChip scope={rule.scope} labels={labels} />
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{rule.term}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <ActiveToggle rule={rule} adapter={adapter} labels={labels} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <DeleteRuleDialog rule={rule} adapter={adapter} labels={labels} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      {labels.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 space-y-3 sm:hidden">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4",
                  !rule.isActive && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <ScopeChip scope={rule.scope} labels={labels} />
                    <div className="mt-1 font-medium text-foreground">{rule.term}</div>
                  </div>
                  <div className="shrink-0">
                    <DeleteRuleDialog rule={rule} adapter={adapter} labels={labels} />
                  </div>
                </div>
                {rule.note && <p className="mt-2 text-sm text-muted-foreground">{rule.note}</p>}
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">{labels.columns.active}</span>
                  <ActiveToggle rule={rule} adapter={adapter} labels={labels} />
                </div>
              </div>
            ))}
            {rules.length === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {labels.empty}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ScopeChip({ scope, labels }: { scope: ExclusionScope; labels: ExclusionRulesLabels }) {
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
      {labels.scopeNames[scope]}
    </span>
  );
}

function ActiveToggle({
  rule,
  adapter,
  labels,
}: {
  rule: ExclusionRule;
  adapter: ExclusionRulesAdapter;
  labels: ExclusionRulesLabels;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function toggle(nextActive: boolean) {
    setIsSaving(true);
    try {
      await adapter.setExclusionRuleActive({ id: rule.id, isActive: nextActive });
      toast.success(nextActive ? labels.toggle.activated : labels.toggle.deactivated);
    } catch (error) {
      toast.error(labels.toggle.failed(readableErrorMessage(error, "")));
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

// Waits after the last keystroke so the impact check is not fired per keystroke.
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// A failed check is shown as failed, never folded into "0 matches" — that would be a
// confident lie about a rule that silently drops mail.
function ImpactPreview({
  impact,
  term,
  labels,
}: {
  impact: QueryResult<ExclusionImpact>;
  term: string;
  labels: ExclusionRulesLabels;
}) {
  if (term.trim().length < 2) return null;
  if (impact.isLoading) {
    return <p className="text-xs text-muted-foreground">{labels.impactPreview.checking}</p>;
  }
  if (impact.isError) {
    return <p className="text-xs text-muted-foreground">{labels.impactPreview.failed}</p>;
  }
  if (!impact.data || !impact.data.supported) {
    return <p className="text-xs text-muted-foreground">{labels.impactPreview.notAvailable}</p>;
  }
  const { matchCount, totalCount } = impact.data;
  const share = totalCount > 0 ? (matchCount / totalCount) * 100 : 0;
  // A rule that catches a large share of everything ever seen is the mistake this preview exists for.
  const isBroad = matchCount > 0 && share >= 20;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs",
        isBroad ? "text-warning" : "text-muted-foreground",
      )}
    >
      {isBroad && <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
      {matchCount === 0
        ? labels.impactPreview.noMatches(totalCount)
        : labels.impactPreview.matches(matchCount, totalCount, share.toFixed(share < 10 ? 1 : 0))}
    </p>
  );
}

function NewRuleDialog({
  adapter,
  labels,
}: {
  adapter: ExclusionRulesAdapter;
  labels: ExclusionRulesLabels;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExclusionScope>("subject");
  const [term, setTerm] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const debouncedTerm = useDebouncedValue(term, 400);
  const impact = adapter.useExclusionImpact({ scope, term: debouncedTerm, enabled: open });

  async function createRule() {
    if (!term.trim()) {
      toast.error(labels.dialog.termRequired);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.createExclusionRule({ scope, term, note });
      toast.success(labels.dialog.created);
      setTerm("");
      setNote("");
      setOpen(false);
    } catch (error) {
      toast.error(labels.dialog.createFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {labels.newRuleButton}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.dialog.title}</DialogTitle>
          <DialogDescription>{labels.dialog.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.dialog.scopeField}</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as ExclusionScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{labels.scopeGroupBeforeReading}</SelectLabel>
                  {EXCLUSION_SCOPES_BEFORE_READING.map((scopeValue) => (
                    <SelectItem key={scopeValue} value={scopeValue}>
                      {labels.scopeNames[scopeValue]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>{labels.scopeGroupAfterReading}</SelectLabel>
                  {EXCLUSION_SCOPES_AFTER_READING.map((scopeValue) => (
                    <SelectItem key={scopeValue} value={scopeValue}>
                      {labels.scopeNames[scopeValue]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.dialog.termField}</Label>
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={labels.dialog.termPlaceholder}
            />
            <ImpactPreview impact={impact} term={debouncedTerm} labels={labels} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.dialog.noteField}</Label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={labels.dialog.notePlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {labels.dialog.cancel}
          </Button>
          <Button onClick={createRule} disabled={isSaving || !term.trim()}>
            {isSaving ? labels.dialog.saving : labels.dialog.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRuleDialog({
  rule,
  adapter,
  labels,
}: {
  rule: ExclusionRule;
  adapter: ExclusionRulesAdapter;
  labels: ExclusionRulesLabels;
}) {
  async function deleteRule() {
    try {
      await adapter.deleteExclusionRule(rule.id);
      toast.success(labels.deleteDialog.deleted);
    } catch (error) {
      toast.error(labels.deleteDialog.failed(readableErrorMessage(error, "")));
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={labels.deleteDialog.openButton}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.deleteDialog.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {labels.deleteDialog.description(rule.term, labels.scopeNames[rule.scope])}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.deleteDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={deleteRule}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {labels.deleteDialog.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
