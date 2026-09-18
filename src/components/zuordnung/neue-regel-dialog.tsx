import { useId, useMemo, useState, type ReactNode } from "react";
import { Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Feld } from "@/components/ui/feld";
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
  useBwaCategories,
  useCreateAssignmentRule,
  useGesellschaften,
  useLieferanten,
  useObjekte,
  useRulePreviewScope,
  type AssignmentRuleInput,
} from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";
import type { BwaCategory, RuleTarget, VatSpecialCase, VatTreatment } from "@/lib/data/types";
import { VAT_SPECIAL_CASES, VAT_TREATMENTS } from "@/lib/data/types";
import { fehlerText } from "@/lib/data/format";

const LEER = "__none";

// Two-level category options for the Combobox below: a fine tag's label carries its coarse group
// ("Raumkosten › Energie"), so it stays identifiable without a grouped-dropdown widget the shared
// Combobox does not support. A coarse category is itself a valid, selectable option too (the
// briefing: "even coarser is also possible"). Shared with the Kategorien/Vorschläge tabs on the
// Zuordnungsregeln screen — single source of truth, do not duplicate this logic elsewhere.
export function useCategoryOptions(categories: BwaCategory[]): ComboboxOption[] {
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
export function NeueRegelDialog({
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
  const geltungsbereichId = useId();
  const [offenIntern, setOffenIntern] = useState(false);
  const gesteuert = open !== undefined;
  const istOffen = gesteuert ? open : offenIntern;
  const setOffen = (naechster: boolean) => {
    if (!gesteuert) setOffenIntern(naechster);
    onOpenChange?.(naechster);
  };
  const [target, setTarget] = useState<RuleTarget>(fixedTarget ?? "cost_category");
  const [kategorieId, setKategorieId] = useState(defaultCategoryId ?? LEER);
  const [ustSatz, setUstSatz] = useState(defaultVatRate != null ? String(defaultVatRate) : "");
  const [vatBehandlung, setVatBehandlung] = useState<string>(defaultVatTreatment ?? LEER);
  const [abzugProzent, setAbzugProzent] = useState(
    defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "",
  );
  const [sonderfall, setSonderfall] = useState<string>(defaultVatSpecialCase ?? LEER);
  const [lieferant, setLieferant] = useState(defaultSupplierId ?? LEER);
  const [objekt, setObjekt] = useState(LEER);
  const [gesellschaft, setGesellschaft] = useState(defaultCompanyId ?? LEER);
  const [muster, setMuster] = useState(defaultReferencePattern ?? "");
  const [notiz, setNotiz] = useState("");

  const lieferantenQ = useLieferanten();
  const objekteQ = useObjekte();
  const companiesQ = useGesellschaften();
  const categoriesQ = useBwaCategories();
  const categoryOptions = useCategoryOptions(categoriesQ.data ?? []);
  const create = useCreateAssignmentRule();

  const satzParsed = ustSatz.trim() === "" ? null : Number(ustSatz.replace(",", "."));
  // A VAT rate is a percentage, so it gets the same bound its neighbour two fields below already
  // had. Without it `199` passed every check, recalculated the retroactive preview normally, and
  // left the save button enabled -- a one-digit slip could be bulk-applied across real invoices.
  const satzKeineZahl = satzParsed != null && !Number.isFinite(satzParsed);
  const satzAusserhalb =
    satzParsed != null && Number.isFinite(satzParsed) && (satzParsed < 0 || satzParsed > 100);
  const satzUngueltig = satzKeineZahl || satzAusserhalb;
  // Not an error. 5,5 % and 16 % were both real German rates and other EU rates exist, so an
  // unusual value is worth a second look rather than a block.
  const satzUnueblich = satzParsed != null && !satzUngueltig && ![0, 7, 19].includes(satzParsed);
  const abzugParsed = abzugProzent.trim() === "" ? null : Number(abzugProzent.replace(",", "."));
  const abzugUngueltig =
    abzugParsed != null && (!Number.isFinite(abzugParsed) || abzugParsed < 0 || abzugParsed > 100);

  // The rule as it would be stored. Also what the preview is computed from, so the number shown is
  // about the rule the user is actually about to save.
  const entwurf: AssignmentRuleInput | null = useMemo(() => {
    const scope = {
      supplier_id: lieferant === LEER ? null : lieferant,
      property_id: objekt === LEER ? null : objekt,
      company_id: gesellschaft === LEER ? null : gesellschaft,
      reference_pattern: muster.trim() === "" ? null : muster.trim(),
    };
    if (target === "cost_category") {
      if (kategorieId === LEER) return null;
      const cat = (categoriesQ.data ?? []).find((c) => c.id === kategorieId);
      return { target, category_id: kategorieId, cost_category: cat?.name ?? null, ...scope };
    }
    if (satzParsed == null || !Number.isFinite(satzParsed)) return null;
    if (satzAusserhalb) return null;
    if (abzugUngueltig) return null;
    return {
      target,
      vat_rate: satzParsed,
      vat_treatment: vatBehandlung === LEER ? null : (vatBehandlung as VatTreatment),
      vat_deductible_pct: abzugParsed,
      vat_special_case: sonderfall === LEER ? null : (sonderfall as VatSpecialCase),
      ...scope,
    };
  }, [
    target,
    kategorieId,
    categoriesQ.data,
    satzParsed,
    satzAusserhalb,
    vatBehandlung,
    abzugParsed,
    abzugUngueltig,
    sonderfall,
    lieferant,
    objekt,
    gesellschaft,
    muster,
  ]);

  const previewQ = useRulePreviewScope(entwurf);

  const scopeLeer =
    lieferant === LEER && objekt === LEER && gesellschaft === LEER && muster.trim() === "";

  function zuruecksetzen() {
    setTarget(fixedTarget ?? "cost_category");
    setKategorieId(defaultCategoryId ?? LEER);
    setUstSatz(defaultVatRate != null ? String(defaultVatRate) : "");
    setVatBehandlung(defaultVatTreatment ?? LEER);
    setAbzugProzent(defaultVatDeductiblePct != null ? String(defaultVatDeductiblePct) : "");
    setSonderfall(defaultVatSpecialCase ?? LEER);
    setLieferant(defaultSupplierId ?? LEER);
    setObjekt(LEER);
    setGesellschaft(defaultCompanyId ?? LEER);
    setMuster(defaultReferencePattern ?? "");
    setNotiz("");
  }

  function speichern() {
    if (!entwurf) {
      toast.error(t("zuordnungsregeln.neu.wertFehlt"));
      return;
    }
    if (scopeLeer) {
      toast.error(t("zuordnungsregeln.neu.scopeFehlt"));
      return;
    }
    create.mutate(
      { ...entwurf, note: notiz.trim() === "" ? null : notiz.trim() },
      {
        onSuccess: () => {
          toast.success(t("zuordnungsregeln.toast.angelegt"));
          zuruecksetzen();
          setOffen(false);
        },
        onError: (e) => {
          const msg = fehlerText(e);
          toast.error(
            /duplicate key|assignment_rules_scope_unique/i.test(msg)
              ? t("zuordnungsregeln.neu.schonVorhanden")
              : t("zuordnungsregeln.toast.fehlgeschlagen", { error: msg }),
          );
        },
      },
    );
  }

  return (
    <Dialog open={istOffen} onOpenChange={setOffen}>
      {/* No trigger at all in controlled mode: whoever set `open` is the trigger, and rendering a
          hidden button here would still mount it. */}
      {gesteuert ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="gap-2">
              <Plus className="size-4" /> {t(`zuordnungsregeln.neu.button.${target}`)}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`zuordnungsregeln.neu.title.${target}`)}</DialogTitle>
          <DialogDescription>{t(`zuordnungsregeln.neu.desc.${target}`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fixedTarget ? null : (
            <Feld className="space-y-1.5">
              <Label>{t("zuordnungsregeln.neu.feld")}</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as RuleTarget)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["cost_category", "vat_rate"] as RuleTarget[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`zuordnungsregeln.target.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Feld>
          )}

          {target === "cost_category" ? (
            <Feld className="space-y-1.5">
              <Label>{t("zuordnungsregeln.neu.kategorie")}</Label>
              <Combobox
                value={kategorieId === LEER ? null : kategorieId}
                onValueChange={setKategorieId}
                options={categoryOptions}
                placeholder={t("zuordnungsregeln.neu.kategoriePlaceholder")}
              />
            </Feld>
          ) : (
            <div className="space-y-4">
              <Feld className="space-y-1.5">
                <Label>{t("zuordnungsregeln.neu.ustSatz")}</Label>
                <Input
                  value={ustSatz}
                  onChange={(e) => setUstSatz(e.target.value)}
                  placeholder="19"
                  inputMode="decimal"
                />
                {satzKeineZahl ? (
                  <p className="text-xs text-destructive">
                    {t("zuordnungsregeln.neu.ustUngueltig")}
                  </p>
                ) : satzAusserhalb ? (
                  <p className="text-xs text-destructive">
                    {t("zuordnungsregeln.neu.ustAusserhalb")}
                  </p>
                ) : satzUnueblich ? (
                  <p className="text-xs text-amber-700">{t("zuordnungsregeln.neu.ustUnueblich")}</p>
                ) : null}
              </Feld>
              <Feld className="space-y-1.5">
                <Label>{t("zuordnungsregeln.neu.steuerbehandlung")}</Label>
                <Select value={vatBehandlung} onValueChange={setVatBehandlung}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEER}>
                      {t("zuordnungsregeln.neu.steuerbehandlungOhne")}
                    </SelectItem>
                    {VAT_TREATMENTS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`zuordnungsregeln.vatTreatment.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("zuordnungsregeln.neu.steuerbehandlungHint")}
                </p>
              </Feld>
              <Feld className="space-y-1.5">
                <Label>{t("zuordnungsregeln.neu.abzugsfaehigkeit")}</Label>
                <Input
                  value={abzugProzent}
                  onChange={(e) => setAbzugProzent(e.target.value)}
                  placeholder="100"
                  inputMode="decimal"
                />
                {abzugUngueltig ? (
                  <p className="text-xs text-destructive">
                    {t("zuordnungsregeln.neu.abzugsfaehigkeitUngueltig")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("zuordnungsregeln.neu.abzugsfaehigkeitHint")}
                  </p>
                )}
              </Feld>
              <Feld className="space-y-1.5">
                <Label>{t("zuordnungsregeln.neu.sonderfall")}</Label>
                <Select
                  value={sonderfall}
                  onValueChange={(v) => {
                    setSonderfall(v);
                    if (v === "hospitality" && abzugProzent.trim() === "") setAbzugProzent("70");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEER}>{t("zuordnungsregeln.neu.sonderfallOhne")}</SelectItem>
                    {VAT_SPECIAL_CASES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`zuordnungsregeln.vatSonderfall.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sonderfall === "hospitality" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("zuordnungsregeln.neu.sonderfallBewirtungHinweis")}
                  </p>
                ) : null}
              </Feld>
            </div>
          )}

          <div className="space-y-1.5">
            <p id={geltungsbereichId} className="text-sm font-medium leading-none">
              {t("zuordnungsregeln.neu.geltungsbereich")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("zuordnungsregeln.neu.geltungsbereichHint")}
            </p>
          </div>

          <div
            role="group"
            aria-labelledby={geltungsbereichId}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Feld className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("zuordnungsregeln.scope.lieferant")}
              </Label>
              <Combobox
                value={lieferant}
                onValueChange={setLieferant}
                options={[
                  { value: LEER, label: t("zuordnungsregeln.neu.beliebig") },
                  ...(lieferantenQ.data ?? []).map((l) => ({ value: l.id, label: l.name })),
                ]}
              />
            </Feld>
            <Feld className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("zuordnungsregeln.scope.objekt")}
              </Label>
              <Combobox
                value={objekt}
                onValueChange={setObjekt}
                options={[
                  { value: LEER, label: t("zuordnungsregeln.neu.beliebig") },
                  ...(objekteQ.data ?? []).map((o) => ({
                    value: o.id,
                    label: o.name ? `${o.code} · ${o.name}` : o.code,
                    keywords: o.name ?? "",
                  })),
                ]}
              />
            </Feld>
            <Feld className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                {t("zuordnungsregeln.scope.gesellschaft")}
              </Label>
              <Combobox
                value={gesellschaft}
                onValueChange={setGesellschaft}
                options={[
                  { value: LEER, label: t("zuordnungsregeln.neu.beliebig") },
                  ...(companiesQ.data ?? []).map((g) => ({
                    value: g.id,
                    label: `${g.code} · ${g.name}`,
                    keywords: g.name,
                  })),
                ]}
              />
            </Feld>
          </div>

          <Feld className="space-y-1.5">
            <Label>{t("zuordnungsregeln.scope.verwendungszweck")}</Label>
            <Input
              value={muster}
              onChange={(e) => setMuster(e.target.value)}
              placeholder={t("zuordnungsregeln.neu.musterPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("zuordnungsregeln.neu.musterHint")}</p>
          </Feld>

          <Feld className="space-y-1.5">
            <Label>{t("zuordnungsregeln.neu.notiz")}</Label>
            <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          </Feld>

          {/* Retroactive impact, before saving. The briefing is explicit that a rule must not take
              effect on old receipts without the person seeing how many it moves first. */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Wand2 className="size-4" /> {t("zuordnungsregeln.neu.vorschau")}
            </div>
            {scopeLeer ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("zuordnungsregeln.neu.scopeFehlt")}
              </p>
            ) : !entwurf ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("zuordnungsregeln.neu.wertFehlt")}
              </p>
            ) : previewQ.isLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("zuordnungsregeln.neu.vorschauLaedt")}
              </p>
            ) : previewQ.isError ? (
              <p className="mt-1 text-xs text-destructive">
                {t("zuordnungsregeln.neu.vorschauFehler")}
              </p>
            ) : (
              <>
                <p className="mt-1">
                  {t("zuordnungsregeln.neu.vorschauText", {
                    change: previewQ.data?.would_change ?? 0,
                    total: previewQ.data?.matches ?? 0,
                  })}
                </p>
                {/* The gap between the two numbers is the informative part: it is already-correct
                    or already human-decided receipts, which this rule will not touch. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("zuordnungsregeln.neu.vorschauHint")}
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOffen(false)}>
            {t("zuordnungsregeln.action.abbrechen")}
          </Button>
          <Button onClick={speichern} disabled={create.isPending || !entwurf || scopeLeer}>
            {t(`zuordnungsregeln.neu.speichern.${target}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
