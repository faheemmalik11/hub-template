// One assignment-rule row, shared between the Kategorien page's "Regeln" tab (cost_category
// rules) and the standalone USt-Regeln page (vat_rate rules) — same rule shape, same actions
// (toggle active, apply retroactively, soft-delete), just a different `target` filter upstream.
import { useMemo, useState } from "react";
import { Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  useApplyAssignmentRuleBulk,
  useCostAnalysisCategories,
  useCompanies,
  useSuppliers,
  useProperties,
  useRulePreview,
  useSoftDeleteAssignmentRule,
  useUpdateAssignmentRule,
} from "@/data";
import type { AssignmentRule } from "@/lib/data/types";
import { errorText } from "@/lib/data/format";

// Human-readable scope of one rule. Built from the master data rather than showing raw ids, since
// "Ikea + KLMUE4" is the thing a reviewer can check and "44444444-..." is not.
function useScopeChips(rule: AssignmentRule) {
  const { t } = useTranslation();
  const suppliersQ = useSuppliers();
  const propertiesQ = useProperties();
  const companiesQ = useCompanies();

  return useMemo(() => {
    const chips: { label: string; value: string }[] = [];
    if (rule.supplier_id) {
      const l = (suppliersQ.data ?? []).find((x) => x.id === rule.supplier_id);
      chips.push({
        label: t("assignmentRules.scope.lieferant"),
        value: l?.name ?? rule.supplier_id,
      });
    }
    if (rule.property_id) {
      const o = (propertiesQ.data ?? []).find((x) => x.id === rule.property_id);
      chips.push({
        label: t("assignmentRules.scope.objekt"),
        value: o ? (o.name ? `${o.code} · ${o.name}` : o.code) : rule.property_id,
      });
    }
    if (rule.company_id) {
      const g = (companiesQ.data ?? []).find((x) => x.id === rule.company_id);
      chips.push({
        label: t("assignmentRules.scope.gesellschaft"),
        value: g ? `${g.code} · ${g.name}` : rule.company_id,
      });
    }
    if (rule.reference_pattern) {
      chips.push({
        label: t("assignmentRules.scope.verwendungszweck"),
        value: rule.reference_pattern,
      });
    }
    return chips;
  }, [rule, suppliersQ.data, propertiesQ.data, companiesQ.data, t]);
}

// The structured category_id is canonical (migration 0030); the free-text cost_category is only
// the fallback for a rule that predates it or was inserted by the pipeline's own test fixtures.
// Shared by the desktop row and the mobile card so they can never disagree on what "wert" means.
function useRuleValue(rule: AssignmentRule, categories: { id: string; name: string }[]) {
  return rule.target === "cost_category"
    ? rule.category_id
      ? (categories.find((c) => c.id === rule.category_id)?.name ?? rule.cost_category ?? "—")
      : (rule.cost_category ?? "—")
    : rule.vat_rate != null
      ? `${rule.vat_rate} %`
      : "—";
}

// "Wert" cell/block content: the resolved value plus its VAT/deductibility qualifiers and note.
// Identical markup for the table cell and the card, just without the TableCell wrapper.
function ValueContent({ rule, value }: { rule: AssignmentRule; value: string }) {
  const { t } = useTranslation();
  return (
    <>
      {value}
      {rule.vat_treatment ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t(`assignmentRules.vatTreatment.${rule.vat_treatment}`)}
        </span>
      ) : null}
      {rule.vat_deductible_pct != null ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t("assignmentRules.col.abzugsfaehigkeit", { percent: rule.vat_deductible_pct })}
        </span>
      ) : null}
      {rule.vat_special_case ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t(`assignmentRules.vatSonderfall.${rule.vat_special_case}`)}
        </span>
      ) : null}
      {rule.note ? <p className="mt-0.5 text-xs text-muted-foreground">{rule.note}</p> : null}
    </>
  );
}

function ScopeChips({ chips }: { chips: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs"
        >
          <span className="text-muted-foreground">{c.label}</span>
          <span className="text-foreground">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

// Retroactive effect as it stands right now: how many receipts this rule would still change if it
// were applied across the board. Zero is the healthy steady state.
function EffectText({ previewQ }: { previewQ: ReturnType<typeof useRulePreview> }) {
  const { t } = useTranslation();
  if (previewQ.isLoading) return <span className="text-muted-foreground">…</span>;
  return (
    <span
      title={t("assignmentRules.col.wirkungHint")}
      className={cn((previewQ.data?.would_change ?? 0) > 0 && "font-medium text-amber-700")}
    >
      {t("assignmentRules.wirkung", {
        change: previewQ.data?.would_change ?? 0,
        total: previewQ.data?.matches ?? 0,
      })}
    </span>
  );
}

// Apply-retroactively + soft-delete actions, each behind its own confirmation. Shared by the
// desktop row and the mobile card — same mutations, same dialogs, just laid out differently
// around them (icon-only ghost buttons on desktop, full-width outline buttons on the card).
function RuleActions({
  rule,
  value,
  previewQ,
  layout,
}: {
  rule: AssignmentRule;
  value: string;
  previewQ: ReturnType<typeof useRulePreview>;
  layout: "row" | "card";
}) {
  const { t } = useTranslation();
  const remove = useSoftDeleteAssignmentRule();
  const bulkApply = useApplyAssignmentRuleBulk();
  const [reason, setReason] = useState("");
  const buttonClass = layout === "card" ? "flex-1 justify-center gap-1.5" : "gap-1.5";

  return (
    <div className={cn(layout === "card" ? "flex gap-2" : "inline-flex items-center gap-1")}>
      {/* Makes the "wirkung" column actionable: a rule's retroactive effect on existing receipts,
          which used to be visible only as a number, actually happens here. Gated behind a
          confirmation because it is a bulk write across potentially many receipts — the same
          caution as any other action that touches more than one record at once. */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={buttonClass}
            disabled={bulkApply.isPending || (previewQ.data?.would_change ?? 0) === 0}
          >
            <Wand2 className="size-4" /> {t("assignmentRules.action.anwenden")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assignmentRules.action.anwendenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(previewQ.data?.would_change ?? 0) > 0
                ? t("assignmentRules.action.anwendenDesc", {
                    change: previewQ.data?.would_change ?? 0,
                    total: previewQ.data?.matches ?? 0,
                  })
                : t("assignmentRules.action.anwendenKeine")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("assignmentRules.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={(previewQ.data?.would_change ?? 0) === 0}
              onClick={() =>
                bulkApply.mutate(rule.id, {
                  onSuccess: (res) => {
                    if (res.changed === 0) {
                      toast.info(t("assignmentRules.toast.angewendetKeine"));
                    } else if (res.skipped > 0) {
                      toast.success(
                        t("assignmentRules.toast.angewendetUebersprungen", {
                          changed: res.changed,
                          matches: res.matches,
                          skipped: res.skipped,
                        }),
                      );
                    } else {
                      toast.success(
                        t("assignmentRules.toast.angewendet", {
                          changed: res.changed,
                          matches: res.matches,
                        }),
                      );
                    }
                  },
                  onError: (e) =>
                    toast.error(
                      t("assignmentRules.toast.fehlgeschlagen", {
                        error: errorText(e),
                      }),
                    ),
                })
              }
            >
              {t("assignmentRules.action.anwendenConfirm", {
                count: previewQ.data?.would_change ?? 0,
              })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Soft delete only, and confirmed: a rule that shaped past assignments stays in the table
          for the audit trail, which is also why there is no hard-delete path at all. */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              buttonClass,
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <Trash2 className="size-4" /> {t("assignmentRules.action.loeschen")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assignmentRules.action.loeschenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("assignmentRules.action.loeschenDesc", { value })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("assignmentRules.action.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("assignmentRules.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(
                  { id: rule.id, reason: reason.trim() },
                  {
                    onSuccess: () => toast.success(t("assignmentRules.toast.geloescht")),
                    onError: (e) =>
                      toast.error(
                        t("assignmentRules.toast.fehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("assignmentRules.action.loeschenConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RuleRow({ rule }: { rule: AssignmentRule }) {
  const chips = useScopeChips(rule);
  const update = useUpdateAssignmentRule();
  const previewQ = useRulePreview(rule.id);
  const categoriesQ = useCostAnalysisCategories();
  const { t } = useTranslation();
  const value = useRuleValue(rule, categoriesQ.data ?? []);

  return (
    <TableRow className={cn(!rule.is_active && "opacity-60")}>
      <TableCell className="font-medium text-foreground">
        <ValueContent rule={rule} value={value} />
      </TableCell>
      <TableCell>
        <ScopeChips chips={chips} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        <EffectText previewQ={previewQ} />
      </TableCell>
      <TableCell>
        <Switch
          checked={rule.is_active}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            update.mutate(
              { id: rule.id, changes: { is_active: v } },
              {
                onSuccess: () =>
                  toast.success(
                    v
                      ? t("assignmentRules.toast.aktiviert")
                      : t("assignmentRules.toast.deaktiviert"),
                  ),
                onError: (e) =>
                  toast.error(
                    t("assignmentRules.toast.fehlgeschlagen", {
                      error: errorText(e),
                    }),
                  ),
              },
            )
          }
        />
      </TableCell>
      <TableCell className="text-right">
        <RuleActions rule={rule} value={value} previewQ={previewQ} layout="row" />
      </TableCell>
    </TableRow>
  );
}

// Mobile card equivalent of RegelZeile — same fields, stacked instead of columned. Below `sm` the
// page swaps its <Table> for a list of these.
export function RuleCard({ rule }: { rule: AssignmentRule }) {
  const { t } = useTranslation();
  const chips = useScopeChips(rule);
  const update = useUpdateAssignmentRule();
  const previewQ = useRulePreview(rule.id);
  const categoriesQ = useCostAnalysisCategories();
  const value = useRuleValue(rule, categoriesQ.data ?? []);

  return (
    <div
      className={cn("rounded-xl border border-border bg-card p-4", !rule.is_active && "opacity-60")}
    >
      <div className="flex items-start justify-between gap-3">
        {/* div, not p: WertInhalt renders the rule's note as its own <p>, and a <p> inside a <p>
            is invalid — the parser auto-closes the outer one, so the SSR'd DOM stops matching
            React's tree (hydration mismatch) and the note escapes this row's flex layout. The
            desktop RegelZeile doesn't hit this because its wrapper is a TableCell (<td>). */}
        <div className="min-w-0 font-medium text-foreground">
          <ValueContent rule={rule} value={value} />
        </div>
        <Switch
          checked={rule.is_active}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            update.mutate(
              { id: rule.id, changes: { is_active: v } },
              {
                onSuccess: () =>
                  toast.success(
                    v
                      ? t("assignmentRules.toast.aktiviert")
                      : t("assignmentRules.toast.deaktiviert"),
                  ),
                onError: (e) =>
                  toast.error(
                    t("assignmentRules.toast.fehlgeschlagen", {
                      error: errorText(e),
                    }),
                  ),
              },
            )
          }
        />
      </div>
      {chips.length > 0 && (
        <div className="mt-2">
          <ScopeChips chips={chips} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {t("assignmentRules.col.wirkung")}: <EffectText previewQ={previewQ} />
      </p>
      <div className="mt-3 border-t border-border pt-3">
        <RuleActions rule={rule} value={value} previewQ={previewQ} layout="card" />
      </div>
    </div>
  );
}

// Sentinel for "no selection" in a Combobox where empty/undefined would be ambiguous with "not
// loaded yet" — shared by the Regeln/Kategorien tabs' filters and the standalone USt-Regeln
// page's company filter.
export const LEER = "__none";
