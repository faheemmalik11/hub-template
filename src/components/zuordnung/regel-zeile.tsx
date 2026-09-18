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
  useBwaCategories,
  useGesellschaften,
  useLieferanten,
  useObjekte,
  useRulePreview,
  useSoftDeleteAssignmentRule,
  useUpdateAssignmentRule,
} from "@/lib/data/queries";
import type { AssignmentRule } from "@/lib/data/types";
import { fehlerText } from "@/lib/data/format";

// Human-readable scope of one rule. Built from the master data rather than showing raw ids, since
// "Ikea + KLMUE4" is the thing a reviewer can check and "44444444-..." is not.
function useScopeChips(regel: AssignmentRule) {
  const { t } = useTranslation();
  const lieferantenQ = useLieferanten();
  const objekteQ = useObjekte();
  const companiesQ = useGesellschaften();

  return useMemo(() => {
    const chips: { label: string; value: string }[] = [];
    if (regel.supplier_id) {
      const l = (lieferantenQ.data ?? []).find((x) => x.id === regel.supplier_id);
      chips.push({
        label: t("zuordnungsregeln.scope.lieferant"),
        value: l?.name ?? regel.supplier_id,
      });
    }
    if (regel.property_id) {
      const o = (objekteQ.data ?? []).find((x) => x.id === regel.property_id);
      chips.push({
        label: t("zuordnungsregeln.scope.objekt"),
        value: o ? (o.name ? `${o.code} · ${o.name}` : o.code) : regel.property_id,
      });
    }
    if (regel.company_id) {
      const g = (companiesQ.data ?? []).find((x) => x.id === regel.company_id);
      chips.push({
        label: t("zuordnungsregeln.scope.gesellschaft"),
        value: g ? `${g.code} · ${g.name}` : regel.company_id,
      });
    }
    if (regel.reference_pattern) {
      chips.push({
        label: t("zuordnungsregeln.scope.verwendungszweck"),
        value: regel.reference_pattern,
      });
    }
    return chips;
  }, [regel, lieferantenQ.data, objekteQ.data, companiesQ.data, t]);
}

// The structured category_id is canonical (migration 0030); the free-text cost_category is only
// the fallback for a rule that predates it or was inserted by the pipeline's own test fixtures.
// Shared by the desktop row and the mobile card so they can never disagree on what "wert" means.
function useRegelWert(regel: AssignmentRule, categories: { id: string; name: string }[]) {
  return regel.target === "cost_category"
    ? regel.category_id
      ? (categories.find((c) => c.id === regel.category_id)?.name ?? regel.cost_category ?? "—")
      : (regel.cost_category ?? "—")
    : regel.vat_rate != null
      ? `${regel.vat_rate} %`
      : "—";
}

// "Wert" cell/block content: the resolved value plus its VAT/deductibility qualifiers and note.
// Identical markup for the table cell and the card, just without the TableCell wrapper.
function WertInhalt({ regel, wert }: { regel: AssignmentRule; wert: string }) {
  const { t } = useTranslation();
  return (
    <>
      {wert}
      {regel.vat_treatment ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t(`zuordnungsregeln.vatTreatment.${regel.vat_treatment}`)}
        </span>
      ) : null}
      {regel.vat_deductible_pct != null ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t("zuordnungsregeln.col.abzugsfaehigkeit", { prozent: regel.vat_deductible_pct })}
        </span>
      ) : null}
      {regel.vat_special_case ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {t(`zuordnungsregeln.vatSonderfall.${regel.vat_special_case}`)}
        </span>
      ) : null}
      {regel.note ? <p className="mt-0.5 text-xs text-muted-foreground">{regel.note}</p> : null}
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
function WirkungText({ previewQ }: { previewQ: ReturnType<typeof useRulePreview> }) {
  const { t } = useTranslation();
  if (previewQ.isLoading) return <span className="text-muted-foreground">…</span>;
  return (
    <span
      title={t("zuordnungsregeln.col.wirkungHint")}
      className={cn((previewQ.data?.would_change ?? 0) > 0 && "font-medium text-amber-700")}
    >
      {t("zuordnungsregeln.wirkung", {
        change: previewQ.data?.would_change ?? 0,
        total: previewQ.data?.matches ?? 0,
      })}
    </span>
  );
}

// Apply-retroactively + soft-delete actions, each behind its own confirmation. Shared by the
// desktop row and the mobile card — same mutations, same dialogs, just laid out differently
// around them (icon-only ghost buttons on desktop, full-width outline buttons on the card).
function RegelAktionen({
  regel,
  wert,
  previewQ,
  layout,
}: {
  regel: AssignmentRule;
  wert: string;
  previewQ: ReturnType<typeof useRulePreview>;
  layout: "row" | "card";
}) {
  const { t } = useTranslation();
  const remove = useSoftDeleteAssignmentRule();
  const bulkApply = useApplyAssignmentRuleBulk();
  const [grund, setGrund] = useState("");
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
            <Wand2 className="size-4" /> {t("zuordnungsregeln.action.anwenden")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("zuordnungsregeln.action.anwendenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(previewQ.data?.would_change ?? 0) > 0
                ? t("zuordnungsregeln.action.anwendenDesc", {
                    change: previewQ.data?.would_change ?? 0,
                    total: previewQ.data?.matches ?? 0,
                  })
                : t("zuordnungsregeln.action.anwendenKeine")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("zuordnungsregeln.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={(previewQ.data?.would_change ?? 0) === 0}
              onClick={() =>
                bulkApply.mutate(regel.id, {
                  onSuccess: (res) => {
                    if (res.changed === 0) {
                      toast.info(t("zuordnungsregeln.toast.angewendetKeine"));
                    } else if (res.skipped > 0) {
                      toast.success(
                        t("zuordnungsregeln.toast.angewendetUebersprungen", {
                          changed: res.changed,
                          matches: res.matches,
                          skipped: res.skipped,
                        }),
                      );
                    } else {
                      toast.success(
                        t("zuordnungsregeln.toast.angewendet", {
                          changed: res.changed,
                          matches: res.matches,
                        }),
                      );
                    }
                  },
                  onError: (e) =>
                    toast.error(
                      t("zuordnungsregeln.toast.fehlgeschlagen", {
                        error: fehlerText(e),
                      }),
                    ),
                })
              }
            >
              {t("zuordnungsregeln.action.anwendenConfirm", {
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
            <Trash2 className="size-4" /> {t("zuordnungsregeln.action.loeschen")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("zuordnungsregeln.action.loeschenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("zuordnungsregeln.action.loeschenDesc", { wert })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder={t("zuordnungsregeln.action.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("zuordnungsregeln.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!grund.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(
                  { id: regel.id, grund: grund.trim() },
                  {
                    onSuccess: () => toast.success(t("zuordnungsregeln.toast.geloescht")),
                    onError: (e) =>
                      toast.error(
                        t("zuordnungsregeln.toast.fehlgeschlagen", {
                          error: fehlerText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("zuordnungsregeln.action.loeschenConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RegelZeile({ regel }: { regel: AssignmentRule }) {
  const chips = useScopeChips(regel);
  const update = useUpdateAssignmentRule();
  const previewQ = useRulePreview(regel.id);
  const categoriesQ = useBwaCategories();
  const { t } = useTranslation();
  const wert = useRegelWert(regel, categoriesQ.data ?? []);

  return (
    <TableRow className={cn(!regel.is_active && "opacity-60")}>
      <TableCell className="font-medium text-foreground">
        <WertInhalt regel={regel} wert={wert} />
      </TableCell>
      <TableCell>
        <ScopeChips chips={chips} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        <WirkungText previewQ={previewQ} />
      </TableCell>
      <TableCell>
        <Switch
          checked={regel.is_active}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            update.mutate(
              { id: regel.id, changes: { is_active: v } },
              {
                onSuccess: () =>
                  toast.success(
                    v
                      ? t("zuordnungsregeln.toast.aktiviert")
                      : t("zuordnungsregeln.toast.deaktiviert"),
                  ),
                onError: (e) =>
                  toast.error(
                    t("zuordnungsregeln.toast.fehlgeschlagen", {
                      error: fehlerText(e),
                    }),
                  ),
              },
            )
          }
        />
      </TableCell>
      <TableCell className="text-right">
        <RegelAktionen regel={regel} wert={wert} previewQ={previewQ} layout="row" />
      </TableCell>
    </TableRow>
  );
}

// Mobile card equivalent of RegelZeile — same fields, stacked instead of columned. Below `sm` the
// page swaps its <Table> for a list of these.
export function RegelKarte({ regel }: { regel: AssignmentRule }) {
  const { t } = useTranslation();
  const chips = useScopeChips(regel);
  const update = useUpdateAssignmentRule();
  const previewQ = useRulePreview(regel.id);
  const categoriesQ = useBwaCategories();
  const wert = useRegelWert(regel, categoriesQ.data ?? []);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        !regel.is_active && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* div, not p: WertInhalt renders the rule's note as its own <p>, and a <p> inside a <p>
            is invalid — the parser auto-closes the outer one, so the SSR'd DOM stops matching
            React's tree (hydration mismatch) and the note escapes this row's flex layout. The
            desktop RegelZeile doesn't hit this because its wrapper is a TableCell (<td>). */}
        <div className="min-w-0 font-medium text-foreground">
          <WertInhalt regel={regel} wert={wert} />
        </div>
        <Switch
          checked={regel.is_active}
          disabled={update.isPending}
          onCheckedChange={(v) =>
            update.mutate(
              { id: regel.id, changes: { is_active: v } },
              {
                onSuccess: () =>
                  toast.success(
                    v
                      ? t("zuordnungsregeln.toast.aktiviert")
                      : t("zuordnungsregeln.toast.deaktiviert"),
                  ),
                onError: (e) =>
                  toast.error(
                    t("zuordnungsregeln.toast.fehlgeschlagen", {
                      error: fehlerText(e),
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
        {t("zuordnungsregeln.col.wirkung")}: <WirkungText previewQ={previewQ} />
      </p>
      <div className="mt-3 border-t border-border pt-3">
        <RegelAktionen regel={regel} wert={wert} previewQ={previewQ} layout="card" />
      </div>
    </div>
  );
}

// Sentinel for "no selection" in a Combobox where empty/undefined would be ambiguous with "not
// loaded yet" — shared by the Regeln/Kategorien tabs' filters and the standalone USt-Regeln
// page's company filter.
export const LEER = "__none";
