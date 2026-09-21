import { useId, useMemo, useState, type ReactNode } from "react";
import { Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/feld";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCostAnalysisCategories,
  useCreateAssignmentRule,
  useCompanies,
  useSuppliers,
  useProperties,
  useRulePreviewScope,
  type AssignmentRuleInput,
} from "@/data";
import { useTranslation } from "@/lib/i18n";
import type {
  CostAnalysisCategory,
  RuleTarget,
  VatSpecialCase,
  VatTreatment,
} from "@/lib/data/types";
import { VAT_SPECIAL_CASES, VAT_TREATMENTS } from "@/lib/data/types";
import { errorText } from "@/lib/data/format";

const LEER = "__none";

// Two-level category options for the Combobox below: a fine tag's label carries its coarse group
// ("Raumkosten › Energie"), so it stays identifiable without a grouped-dropdown widget the shared
// Combobox does not support. A coarse category is itself a valid, selectable option too (the
// briefing: "even coarser is also possible"). Shared with the Kategorien/Vorschläge tabs on the
// Zuordnungsregeln screen — single source of truth, do not duplicate this logic elsewhere.
export function useCategoryOptions(categories: CostAnalysisCategory[]): ComboboxOption[] {
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return categories
      .filter((c) => c.is_active)
      .map((c) => {
        const parent = c.parent_id ? byId.get(c.parent_id) : null;
        const label = parent ? `${parent.name} › ${c.name}` : c.name;
        return { value: c.id, label, keywords: `${c.code} ${c.name_en}` };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categories]);
}

// Create-a-rule dialog, always with the retroactive preview ("this would change N receipts")
// before saving (Briefing Screen 4). Originally the Zuordnungsregeln screen's own "+ Regel"
// button; now also reusable from the receipt detail page ("create as rule", pre-filled with that
// receipt's own supplier/category/VAT values) and the supplier detail page (pre-filled with just
// that supplier, category picked fresh) — Screen 4's two rule-creation entry points, both landing
// in the same rule list and both going through the same preview.
export function NewRuleDialog({
  defaultCompanyId,
  defaultSupplierId,
  defaultReferencePattern,
  defaultCategoryId,
  defaultVatRate,
  defaultVatTreatment,
  defaultVatDeductiblePct,
  defaultVatSpecialCase,
  fixedTarget,
  trigger,
  open,
  onOpenChange,
}: {
  defaultCompanyId?: string;
  defaultSupplierId?: string;
  defaultReferencePattern?: string;
  defaultCategoryId?: string;
  defaultVatRate?: number | null;
  defaultVatTreatment?: VatTreatment | null;
  defaultVatDeductiblePct?: number | null;
  defaultVatSpecialCase?: VatSpecialCase | null;
  fixedTarget?: RuleTarget;
  trigger?: ReactNode;
  /** Controlled mode, used by the Vorschläge tab: it opens this dialog from another tab with the
   *  supplier and category already filled in, so there is no trigger to click. The caller mounts
   *  the dialog only while it wants it open and unmounts it on close, which is also what gives the
   *  form fresh defaults -- every field below is initialised once from its `default*` prop and is
   *  never reset afterwards. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useTranslation();
  // Names the scope dropdowns as a group. They have their own labels; this says what the group as
  // a whole is.
  const scopeId = useId();
  const [openIntern, setOpenIntern] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : openIntern;
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenIntern(next);
    onOpenChange?.(next);
  };
  const [target, setTarget] = useState<RuleTarget>(fixedTarget ?? "cost_category");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? LEER);
  const [vatRate, setVatRate] = useState(defaultVatRate != null ? String(defaultVatRate) : "");
  const [vatHandling, setVatHandling] = useState<string>(defaultVatTreatment ?? LEER);
  const [deductionPercent, setDeductionPercent] = useState(
    defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "",
  );
  const [specialCase, setSpecialCase] = useState<string>(defaultVatSpecialCase ?? LEER);
  const [supplier, setSupplier] = useState(defaultSupplierId ?? LEER);
  const [property, setProperty] = useState(LEER);
  const [company, setCompany] = useState(defaultCompanyId ?? LEER);
  const [muster, setMuster] = useState(defaultReferencePattern ?? "");
  const [note, setNote] = useState("");

  const suppliersQ = useSuppliers();
  const propertiesQ = useProperties();
  const companiesQ = useCompanies();
  const categoriesQ = useCostAnalysisCategories();
  const categoryOptions = useCategoryOptions(categoriesQ.data ?? []);
  const create = useCreateAssignmentRule();

  const rateParsed = vatRate.trim() === "" ? null : Number(vatRate.replace(",", "."));
  // A VAT rate is a percentage, so it gets the same bound its neighbour two fields below already
  // had. Without it `199` passed every check, recalculated the retroactive preview normally, and
  // left the save button enabled -- a one-digit slip could be bulk-applied across real invoices.
  const rateNoNumber = rateParsed != null && !Number.isFinite(rateParsed);
  const rateOutside =
    rateParsed != null && Number.isFinite(rateParsed) && (rateParsed < 0 || rateParsed > 100);
  const rateInvalid = rateNoNumber || rateOutside;
  // Not an error. 5,5 % and 16 % were both real German rates and other EU rates exist, so an
  // unusual value is worth a second look rather than a block.
  const rateUnusual = rateParsed != null && !rateInvalid && ![0, 7, 19].includes(rateParsed);
  const deductionParsed =
    deductionPercent.trim() === "" ? null : Number(deductionPercent.replace(",", "."));
  const deductionInvalid =
    deductionParsed != null &&
    (!Number.isFinite(deductionParsed) || deductionParsed < 0 || deductionParsed > 100);

  // The rule as it would be stored. Also what the preview is computed from, so the number shown is
  // about the rule the user is actually about to save.
  const draft: AssignmentRuleInput | null = useMemo(() => {
    const scope = {
      supplier_id: supplier === LEER ? null : supplier,
      property_id: property === LEER ? null : property,
      company_id: company === LEER ? null : company,
      reference_pattern: muster.trim() === "" ? null : muster.trim(),
    };
    if (target === "cost_category") {
      if (categoryId === LEER) return null;
      const cat = (categoriesQ.data ?? []).find((c) => c.id === categoryId);
      return { target, category_id: categoryId, cost_category: cat?.name ?? null, ...scope };
    }
    if (rateParsed == null || !Number.isFinite(rateParsed)) return null;
    if (rateOutside) return null;
    if (deductionInvalid) return null;
    return {
      target,
      vat_rate: rateParsed,
      vat_treatment: vatHandling === LEER ? null : (vatHandling as VatTreatment),
      vat_deductible_pct: deductionParsed,
      vat_special_case: specialCase === LEER ? null : (specialCase as VatSpecialCase),
      ...scope,
    };
  }, [
    target,
    categoryId,
    categoriesQ.data,
    rateParsed,
    rateOutside,
    vatHandling,
    deductionParsed,
    deductionInvalid,
    specialCase,
    supplier,
    property,
    company,
    muster,
  ]);

  const previewQ = useRulePreviewScope(draft);

  const scopeLeer =
    supplier === LEER && property === LEER && company === LEER && muster.trim() === "";

  function reset() {
    setTarget(fixedTarget ?? "cost_category");
    setCategoryId(defaultCategoryId ?? LEER);
    setVatRate(defaultVatRate != null ? String(defaultVatRate) : "");
    setVatHandling(defaultVatTreatment ?? LEER);
    setDeductionPercent(defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "");
    setSpecialCase(defaultVatSpecialCase ?? LEER);
    setSupplier(defaultSupplierId ?? LEER);
    setProperty(LEER);
    setCompany(defaultCompanyId ?? LEER);
    setMuster(defaultReferencePattern ?? "");
    setNote("");
  }

  function save() {
    if (!draft) {
      toast.error(t("assignmentRules.neu.wertFehlt"));
      return;
    }
    if (scopeLeer) {
      toast.error(t("assignmentRules.neu.scopeFehlt"));
      return;
    }
    create.mutate(
      { ...draft, note: note.trim() === "" ? null : note.trim() },
      {
        onSuccess: () => {
          toast.success(t("assignmentRules.toast.angelegt"));
          reset();
          setOpen(false);
        },
        onError: (e) => {
          const msg = errorText(e);
          toast.error(
            /duplicate key|assignment_rules_scope_unique/i.test(msg)
              ? t("assignmentRules.neu.schonVorhanden")
              : t("assignmentRules.toast.fehlgeschlagen", { error: msg }),
          );
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {/* No trigger at all in controlled mode: whoever set `open` is the trigger, and rendering a
          hidden button here would still mount it. */}
      {controlled ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="gap-2">
              <Plus className="size-4" /> {t(`assignmentRules.neu.button.${target}`)}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`assignmentRules.neu.title.${target}`)}</DialogTitle>
          <DialogDescription>{t(`assignmentRules.neu.desc.${target}`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fixedTarget ? null : (
            <Field className="space-y-1.5">
              <Label>{t("assignmentRules.neu.feld")}</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as RuleTarget)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["cost_category", "vat_rate"] as RuleTarget[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`assignmentRules.target.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {target === "cost_category" ? (
            <Field className="space-y-1.5">
              <Label>{t("assignmentRules.neu.kategorie")}</Label>
              <Combobox
                value={categoryId === LEER ? null : categoryId}
                onValueChange={setCategoryId}
                options={categoryOptions}
                placeholder={t("assignmentRules.neu.kategoriePlaceholder")}
              />
            </Field>
          ) : (
            <div className="space-y-4">
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.neu.ustSatz")}</Label>
                <Input
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  placeholder="19"
                  inputMode="decimal"
                />
                {rateNoNumber ? (
                  <p className="text-xs text-destructive">
                    {t("assignmentRules.neu.ustUngueltig")}
                  </p>
                ) : rateOutside ? (
                  <p className="text-xs text-destructive">
                    {t("assignmentRules.neu.ustAusserhalb")}
                  </p>
                ) : rateUnusual ? (
                  <p className="text-xs text-amber-700">{t("assignmentRules.neu.ustUnueblich")}</p>
                ) : null}
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.neu.steuerbehandlung")}</Label>
                <Select value={vatHandling} onValueChange={setVatHandling}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEER}>
                      {t("assignmentRules.neu.steuerbehandlungOhne")}
                    </SelectItem>
                    {VAT_TREATMENTS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`assignmentRules.vatTreatment.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("assignmentRules.neu.steuerbehandlungHint")}
                </p>
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.neu.abzugsfaehigkeit")}</Label>
                <Input
                  value={deductionPercent}
                  onChange={(e) => setDeductionPercent(e.target.value)}
                  placeholder="100"
                  inputMode="decimal"
                />
                {deductionInvalid ? (
                  <p className="text-xs text-destructive">
                    {t("assignmentRules.neu.abzugsfaehigkeitUngueltig")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("assignmentRules.neu.abzugsfaehigkeitHint")}
                  </p>
                )}
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.neu.sonderfall")}</Label>
                <Select
                  value={specialCase}
                  onValueChange={(v) => {
                    setSpecialCase(v);
                    if (v === "hospitality" && deductionPercent.trim() === "")
                      setDeductionPercent("70");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEER}>{t("assignmentRules.neu.sonderfallOhne")}</SelectItem>
                    {VAT_SPECIAL_CASES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`assignmentRules.vatSonderfall.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {specialCase === "hospitality" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("assignmentRules.neu.sonderfallBewirtungHinweis")}
                  </p>
                ) : null}
              </Field>
            </div>
          )}

          <div className="space-y-1.5">
            <p id={scopeId} className="text-sm font-medium leading-none">
              {t("assignmentRules.neu.geltungsbereich")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("assignmentRules.neu.geltungsbereichHint")}
            </p>
          </div>

          <div role="group" aria-labelledby={scopeId} className="grid gap-3 sm:grid-cols-2">
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("assignmentRules.scope.lieferant")}
              </Label>
              <Combobox
                value={supplier}
                onValueChange={setSupplier}
                options={[
                  { value: LEER, label: t("assignmentRules.neu.beliebig") },
                  ...(suppliersQ.data ?? []).map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
            </Field>
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("assignmentRules.scope.objekt")}
              </Label>
              <Combobox
                value={property}
                onValueChange={setProperty}
                options={[
                  { value: LEER, label: t("assignmentRules.neu.beliebig") },
                  ...(propertiesQ.data ?? []).map((o) => ({
                    value: o.id,
                    label: o.name ? `${o.code} · ${o.name}` : o.code,
                    keywords: o.name ?? "",
                  })),
                ]}
              />
            </Field>
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("assignmentRules.scope.gesellschaft")}
              </Label>
              <Combobox
                value={company}
                onValueChange={setCompany}
                options={[
                  { value: LEER, label: t("assignmentRules.neu.beliebig") },
                  ...(companiesQ.data ?? []).map((g) => ({
                    value: g.id,
                    label: `${g.code} · ${g.name}`,
                    keywords: g.name,
                  })),
                ]}
              />
            </Field>
          </div>

          <Field className="space-y-1.5">
            <Label>{t("assignmentRules.scope.verwendungszweck")}</Label>
            <Input
              value={muster}
              onChange={(e) => setMuster(e.target.value)}
              placeholder={t("assignmentRules.neu.musterPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("assignmentRules.neu.musterHint")}</p>
          </Field>

          <Field className="space-y-1.5">
            <Label>{t("assignmentRules.neu.notiz")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {/* Retroactive impact, before saving. The briefing is explicit that a rule must not take
              effect on old receipts without the person seeing how many it moves first. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Wand2 className="size-4" /> {t("assignmentRules.neu.vorschau")}
            </div>
            {scopeLeer ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.neu.scopeFehlt")}
              </p>
            ) : !draft ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.neu.wertFehlt")}
              </p>
            ) : previewQ.isLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.neu.vorschauLaedt")}
              </p>
            ) : previewQ.isError ? (
              <p className="mt-1 text-xs text-destructive">
                {t("assignmentRules.neu.vorschauFehler")}
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {t("assignmentRules.neu.vorschauText", {
                    change: previewQ.data?.would_change ?? 0,
                    total: previewQ.data?.matches ?? 0,
                  })}
                </p>
                {/* The gap between the two numbers is the informative part: it is already-correct
                    or already human-decided receipts, which this rule will not touch. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("assignmentRules.neu.vorschauHint")}
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("assignmentRules.action.abbrechen")}
          </Button>
          <Button onClick={save} disabled={create.isPending || !draft || scopeLeer}>
            {t(`assignmentRules.neu.speichern.${target}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
