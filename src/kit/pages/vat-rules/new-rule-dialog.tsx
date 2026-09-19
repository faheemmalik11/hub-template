import { useId, useMemo, useState } from "react";
import { Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Field } from "../../ui/field";
import { Combobox } from "../../ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { VatRuleDraft, VatRulesAdapter } from "../../adapters/vat-rules";
import type { VatRulesLabels } from "./labels";

const NONE = "__none";

export function NewVatRuleDialog({
  adapter,
  labels,
  defaultCompanyId,
}: {
  adapter: VatRulesAdapter;
  labels: VatRulesLabels;
  defaultCompanyId?: string;
}) {
  const scopeGroupId = useId();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vatRateText, setVatRateText] = useState("");
  const [treatment, setTreatment] = useState(NONE);
  const [deductibleText, setDeductibleText] = useState("");
  const [specialCase, setSpecialCase] = useState(NONE);
  const [supplierId, setSupplierId] = useState(NONE);
  const [propertyId, setPropertyId] = useState(NONE);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? NONE);
  const [referencePattern, setReferencePattern] = useState("");
  const [note, setNote] = useState("");

  const suppliersQuery = adapter.useSuppliers();
  const propertiesQuery = adapter.useProperties();
  const companiesQuery = adapter.useCompanies();

  const parsedRate = vatRateText.trim() === "" ? null : Number(vatRateText.replace(",", "."));
  const rateNotANumber = parsedRate != null && !Number.isFinite(parsedRate);
  const rateOutOfRange =
    parsedRate != null && Number.isFinite(parsedRate) && (parsedRate < 0 || parsedRate > 100);
  const rateInvalid = rateNotANumber || rateOutOfRange;
  // Not an error: reduced and foreign rates exist, so an unusual value only asks for a second look.
  const rateUnusual = parsedRate != null && !rateInvalid && ![0, 7, 19].includes(parsedRate);
  const parsedDeductible =
    deductibleText.trim() === "" ? null : Number(deductibleText.replace(",", "."));
  const deductibleInvalid =
    parsedDeductible != null &&
    (!Number.isFinite(parsedDeductible) || parsedDeductible < 0 || parsedDeductible > 100);

  // The rule as it would be stored — also what the impact preview is computed from.
  const draft: VatRuleDraft | null = useMemo(() => {
    if (parsedRate == null || !Number.isFinite(parsedRate)) return null;
    if (rateOutOfRange || deductibleInvalid) return null;
    return {
      vatRate: parsedRate,
      vatTreatment: treatment === NONE ? null : treatment,
      vatDeductiblePercent: parsedDeductible,
      vatSpecialCase: specialCase === NONE ? null : specialCase,
      supplierId: supplierId === NONE ? null : supplierId,
      propertyId: propertyId === NONE ? null : propertyId,
      companyId: companyId === NONE ? null : companyId,
      referencePattern: referencePattern.trim() === "" ? null : referencePattern.trim(),
    };
  }, [
    parsedRate,
    rateOutOfRange,
    deductibleInvalid,
    treatment,
    parsedDeductible,
    specialCase,
    supplierId,
    propertyId,
    companyId,
    referencePattern,
  ]);

  const previewQuery = adapter.useDraftImpact(draft);

  const scopeEmpty =
    supplierId === NONE &&
    propertyId === NONE &&
    companyId === NONE &&
    referencePattern.trim() === "";

  function resetForm() {
    setVatRateText("");
    setTreatment(NONE);
    setDeductibleText("");
    setSpecialCase(NONE);
    setSupplierId(NONE);
    setPropertyId(NONE);
    setCompanyId(defaultCompanyId ?? NONE);
    setReferencePattern("");
    setNote("");
  }

  async function saveRule() {
    if (!draft) {
      toast.error(labels.newRule.valueMissing);
      return;
    }
    if (scopeEmpty) {
      toast.error(labels.newRule.scopeMissing);
      return;
    }
    setIsSaving(true);
    try {
      await adapter.createVatRule({ ...draft, note: note.trim() === "" ? null : note.trim() });
      toast.success(labels.newRule.created);
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(
        adapter.isDuplicateRuleError(error)
          ? labels.newRule.alreadyExists
          : labels.newRule.createFailed(readableErrorMessage(error, "")),
      );
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.newRule.title}</DialogTitle>
          <DialogDescription>{labels.newRule.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field className="space-y-1.5">
            <Label>{labels.newRule.vatRateField}</Label>
            <Input
              value={vatRateText}
              onChange={(event) => setVatRateText(event.target.value)}
              placeholder={labels.newRule.vatRatePlaceholder}
              inputMode="decimal"
            />
            {rateNotANumber ? (
              <p className="text-xs text-destructive">{labels.newRule.vatRateInvalid}</p>
            ) : rateOutOfRange ? (
              <p className="text-xs text-destructive">{labels.newRule.vatRateOutOfRange}</p>
            ) : rateUnusual ? (
              <p className="text-xs text-warning">{labels.newRule.vatRateUnusual}</p>
            ) : null}
          </Field>
          <Field className="space-y-1.5">
            <Label>{labels.newRule.treatmentField}</Label>
            <Select value={treatment} onValueChange={setTreatment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{labels.newRule.treatmentNone}</SelectItem>
                {adapter.vatTreatmentValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.vatTreatmentName(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{labels.newRule.treatmentHint}</p>
          </Field>
          <Field className="space-y-1.5">
            <Label>{labels.newRule.deductibleField}</Label>
            <Input
              value={deductibleText}
              onChange={(event) => setDeductibleText(event.target.value)}
              placeholder={labels.newRule.deductiblePlaceholder}
              inputMode="decimal"
            />
            {deductibleInvalid ? (
              <p className="text-xs text-destructive">{labels.newRule.deductibleInvalid}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{labels.newRule.deductibleHint}</p>
            )}
          </Field>
          <Field className="space-y-1.5">
            <Label>{labels.newRule.specialCaseField}</Label>
            <Select
              value={specialCase}
              onValueChange={(value) => {
                setSpecialCase(value);
                if (value === "hospitality" && deductibleText.trim() === "") {
                  setDeductibleText("70");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{labels.newRule.specialCaseNone}</SelectItem>
                {adapter.vatSpecialCaseValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.vatSpecialCaseName(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {specialCase === "hospitality" ? (
              <p className="text-xs text-muted-foreground">{labels.newRule.hospitalityHint}</p>
            ) : null}
          </Field>

          <div className="space-y-1.5">
            <p id={scopeGroupId} className="text-sm leading-none font-medium">
              {labels.newRule.scopeHeading}
            </p>
            <p className="text-xs text-muted-foreground">{labels.newRule.scopeHint}</p>
          </div>

          <div role="group" aria-labelledby={scopeGroupId} className="grid gap-3 sm:grid-cols-2">
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {labels.scopeNames.supplier}
              </Label>
              <Combobox
                value={supplierId}
                onValueChange={setSupplierId}
                options={[
                  { value: NONE, label: labels.newRule.anyScopeOption },
                  ...(suppliersQuery.data ?? []).map((supplier) => ({
                    value: supplier.id,
                    label: supplier.name,
                  })),
                ]}
              />
            </Field>
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {labels.scopeNames.property}
              </Label>
              <Combobox
                value={propertyId}
                onValueChange={setPropertyId}
                options={[
                  { value: NONE, label: labels.newRule.anyScopeOption },
                  ...(propertiesQuery.data ?? []).map((property) => ({
                    value: property.id,
                    label: property.name ? `${property.code} · ${property.name}` : property.code,
                    keywords: property.name ?? "",
                  })),
                ]}
              />
            </Field>
            <Field className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {labels.scopeNames.company}
              </Label>
              <Combobox
                value={companyId}
                onValueChange={setCompanyId}
                options={[
                  { value: NONE, label: labels.newRule.anyScopeOption },
                  ...(companiesQuery.data ?? []).map((company) => ({
                    value: company.id,
                    label: `${company.code} · ${company.name}`,
                    keywords: company.name,
                  })),
                ]}
              />
            </Field>
          </div>

          <Field className="space-y-1.5">
            <Label>{labels.newRule.referencePatternField}</Label>
            <Input
              value={referencePattern}
              onChange={(event) => setReferencePattern(event.target.value)}
              placeholder={labels.newRule.referencePatternPlaceholder}
            />
            <p className="text-xs text-muted-foreground">{labels.newRule.referencePatternHint}</p>
          </Field>

          <Field className="space-y-1.5">
            <Label>{labels.newRule.noteField}</Label>
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Wand2 className="size-4" /> {labels.newRule.previewHeading}
            </div>
            {scopeEmpty ? (
              <p className="mt-1 text-xs text-muted-foreground">{labels.newRule.scopeMissing}</p>
            ) : !draft ? (
              <p className="mt-1 text-xs text-muted-foreground">{labels.newRule.valueMissing}</p>
            ) : previewQuery.isLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">{labels.newRule.previewLoading}</p>
            ) : previewQuery.isError ? (
              <p className="mt-1 text-xs text-destructive">{labels.newRule.previewError}</p>
            ) : (
              <>
                <p className="mt-1">
                  {labels.newRule.previewText(
                    previewQuery.data?.wouldChange ?? 0,
                    previewQuery.data?.matches ?? 0,
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{labels.newRule.previewHint}</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {labels.newRule.cancel}
          </Button>
          <Button onClick={saveRule} disabled={isSaving || !draft || scopeEmpty}>
            {labels.newRule.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
