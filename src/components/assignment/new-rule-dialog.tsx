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

const NONE = "__none";

// Shared with the other assignment-rule tabs — single source of truth, do not duplicate this logic elsewhere.
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
  /** Controlled mode: the caller mounts the dialog only while open, which is what resets its fields to their `default*` props. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useTranslation();
  const scopeId = useId();
  const [openIntern, setOpenIntern] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : openIntern;
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenIntern(next);
    onOpenChange?.(next);
  };
  const [target, setTarget] = useState<RuleTarget>(fixedTarget ?? "cost_category");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? NONE);
  const [vatRate, setVatRate] = useState(defaultVatRate != null ? String(defaultVatRate) : "");
  const [vatHandling, setVatHandling] = useState<string>(defaultVatTreatment ?? NONE);
  const [deductionPercent, setDeductionPercent] = useState(
    defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "",
  );
  const [specialCase, setSpecialCase] = useState<string>(defaultVatSpecialCase ?? NONE);
  const [supplier, setSupplier] = useState(defaultSupplierId ?? NONE);
  const [property, setProperty] = useState(NONE);
  const [company, setCompany] = useState(defaultCompanyId ?? NONE);
  const [pattern, setPattern] = useState(defaultReferencePattern ?? "");
  const [note, setNote] = useState("");

  const suppliersQ = useSuppliers();
  const propertiesQ = useProperties();
  const companiesQ = useCompanies();
  const categoriesQ = useCostAnalysisCategories();
  const categoryOptions = useCategoryOptions(categoriesQ.data ?? []);
  const create = useCreateAssignmentRule();

  const rateParsed = vatRate.trim() === "" ? null : Number(vatRate.replace(",", "."));
  // Without this bound a one-digit slip like `199` could be bulk-applied across real invoices.
  const rateNoNumber = rateParsed != null && !Number.isFinite(rateParsed);
  const rateOutside =
    rateParsed != null && Number.isFinite(rateParsed) && (rateParsed < 0 || rateParsed > 100);
  const rateInvalid = rateNoNumber || rateOutside;
  // Not an error: unusual rates like 5.5% or 16% are real EU rates too, just worth a second look.
  const rateUnusual = rateParsed != null && !rateInvalid && ![0, 7, 19].includes(rateParsed);
  const deductionParsed =
    deductionPercent.trim() === "" ? null : Number(deductionPercent.replace(",", "."));
  const deductionInvalid =
    deductionParsed != null &&
    (!Number.isFinite(deductionParsed) || deductionParsed < 0 || deductionParsed > 100);

  const draft: AssignmentRuleInput | null = useMemo(() => {
    const scope = {
      supplier_id: supplier === NONE ? null : supplier,
      property_id: property === NONE ? null : property,
      company_id: company === NONE ? null : company,
      reference_pattern: pattern.trim() === "" ? null : pattern.trim(),
    };
    if (target === "cost_category") {
      if (categoryId === NONE) return null;
      const cat = (categoriesQ.data ?? []).find((c) => c.id === categoryId);
      return { target, category_id: categoryId, cost_category: cat?.name ?? null, ...scope };
    }
    if (rateParsed == null || !Number.isFinite(rateParsed)) return null;
    if (rateOutside) return null;
    if (deductionInvalid) return null;
    return {
      target,
      vat_rate: rateParsed,
      vat_treatment: vatHandling === NONE ? null : (vatHandling as VatTreatment),
      vat_deductible_pct: deductionParsed,
      vat_special_case: specialCase === NONE ? null : (specialCase as VatSpecialCase),
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
    pattern,
  ]);

  const previewQ = useRulePreviewScope(draft);

  const scopeLeer =
    supplier === NONE && property === NONE && company === NONE && pattern.trim() === "";

  function reset() {
    setTarget(fixedTarget ?? "cost_category");
    setCategoryId(defaultCategoryId ?? NONE);
    setVatRate(defaultVatRate != null ? String(defaultVatRate) : "");
    setVatHandling(defaultVatTreatment ?? NONE);
    setDeductionPercent(defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "");
    setSpecialCase(defaultVatSpecialCase ?? NONE);
    setSupplier(defaultSupplierId ?? NONE);
    setProperty(NONE);
    setCompany(defaultCompanyId ?? NONE);
    setPattern(defaultReferencePattern ?? "");
    setNote("");
  }

  function save() {
    if (!draft) {
      toast.error(t("assignmentRules.new.valueMissing"));
      return;
    }
    if (scopeLeer) {
      toast.error(t("assignmentRules.new.scopeMissing"));
      return;
    }
    create.mutate(
      { ...draft, note: note.trim() === "" ? null : note.trim() },
      {
        onSuccess: () => {
          toast.success(t("assignmentRules.toast.created"));
          reset();
          setOpen(false);
        },
        onError: (e) => {
          const msg = errorText(e);
          toast.error(
            /duplicate key|assignment_rules_scope_unique/i.test(msg)
              ? t("assignmentRules.new.alreadyExists")
              : t("assignmentRules.toast.failed", { error: msg }),
          );
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {/* No trigger at all in controlled mode: a hidden button here would still mount it. */}
      {controlled ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="gap-2">
              <Plus className="size-4" /> {t(`assignmentRules.new.button.${target}`)}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`assignmentRules.new.title.${target}`)}</DialogTitle>
          <DialogDescription>{t(`assignmentRules.new.desc.${target}`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fixedTarget ? null : (
            <Field className="space-y-1.5">
              <Label>{t("assignmentRules.new.field")}</Label>
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
              <Label>{t("assignmentRules.new.category")}</Label>
              <Combobox
                value={categoryId === NONE ? null : categoryId}
                onValueChange={setCategoryId}
                options={categoryOptions}
                placeholder={t("assignmentRules.new.categoryPlaceholder")}
              />
            </Field>
          ) : (
            <div className="space-y-4">
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.new.vatRate")}</Label>
                <Input
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  placeholder="19"
                  inputMode="decimal"
                />
                {rateNoNumber ? (
                  <p className="text-xs text-destructive">{t("assignmentRules.new.vatInvalid")}</p>
                ) : rateOutside ? (
                  <p className="text-xs text-destructive">
                    {t("assignmentRules.new.vatOutOfRange")}
                  </p>
                ) : rateUnusual ? (
                  <p className="text-xs text-amber-700">{t("assignmentRules.new.vatUnusual")}</p>
                ) : null}
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.new.taxTreatment")}</Label>
                <Select value={vatHandling} onValueChange={setVatHandling}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {t("assignmentRules.new.taxTreatmentNone")}
                    </SelectItem>
                    {VAT_TREATMENTS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`assignmentRules.vatTreatment.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("assignmentRules.new.taxTreatmentHint")}
                </p>
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.new.deductibility")}</Label>
                <Input
                  value={deductionPercent}
                  onChange={(e) => setDeductionPercent(e.target.value)}
                  placeholder="100"
                  inputMode="decimal"
                />
                {deductionInvalid ? (
                  <p className="text-xs text-destructive">
                    {t("assignmentRules.new.deductibilityInvalid")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("assignmentRules.new.deductibilityHint")}
                  </p>
                )}
              </Field>
              <Field className="space-y-1.5">
                <Label>{t("assignmentRules.new.specialCase")}</Label>
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
                    <SelectItem value={NONE}>{t("assignmentRules.new.specialCaseNone")}</SelectItem>
                    {VAT_SPECIAL_CASES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`assignmentRules.vatSpecialCase.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {specialCase === "hospitality" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("assignmentRules.new.specialCaseHospitalityHint")}
                  </p>
                ) : null}
              </Field>
            </div>
          )}

          <div className="space-y-1.5">
            <p id={scopeId} className="text-sm font-medium leading-none">
              {t("assignmentRules.new.scope")}
            </p>
            <p className="text-xs text-muted-foreground">{t("assignmentRules.new.scopeHint")}</p>
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
                  { value: NONE, label: t("assignmentRules.new.any") },
                  ...(suppliersQ.data ?? []).map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
            </Field>
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("assignmentRules.scope.property")}
              </Label>
              <Combobox
                value={property}
                onValueChange={setProperty}
                options={[
                  { value: NONE, label: t("assignmentRules.new.any") },
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
                {t("assignmentRules.scope.company")}
              </Label>
              <Combobox
                value={company}
                onValueChange={setCompany}
                options={[
                  { value: NONE, label: t("assignmentRules.new.any") },
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
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t("assignmentRules.new.patternPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("assignmentRules.new.patternHint")}</p>
          </Field>

          <Field className="space-y-1.5">
            <Label>{t("assignmentRules.new.note")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          {/* A rule must not take effect on old receipts without showing how many it moves first. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Wand2 className="size-4" /> {t("assignmentRules.new.preview")}
            </div>
            {scopeLeer ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.new.scopeMissing")}
              </p>
            ) : !draft ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.new.valueMissing")}
              </p>
            ) : previewQ.isLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assignmentRules.new.previewLoading")}
              </p>
            ) : previewQ.isError ? (
              <p className="mt-1 text-xs text-destructive">
                {t("assignmentRules.new.previewError")}
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {t("assignmentRules.new.previewText", {
                    change: previewQ.data?.would_change ?? 0,
                    total: previewQ.data?.matches ?? 0,
                  })}
                </p>
                {/* The gap between the two numbers is already-decided receipts this rule won't touch. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("assignmentRules.new.previewHint")}
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("assignmentRules.action.cancel")}
          </Button>
          <Button onClick={save} disabled={create.isPending || !draft || scopeLeer}>
            {t(`assignmentRules.new.save.${target}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
