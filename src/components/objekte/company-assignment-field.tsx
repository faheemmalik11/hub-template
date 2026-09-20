import { MultiCombobox } from "@/components/ui/multi-combobox";
import { Label } from "@/components/ui/label";
import { PflichtStern } from "@/components/ui/form-field";
import { useGesellschaften } from "@/data";
import { useTranslation } from "@/lib/i18n";

/**
 * Which company (or companies) a property belongs to — a direct assignment, not derived from a
 * business line (migration 0083). A property having several companies is normal, not an error:
 * the client's cost-centre workbook lists some properties under two companies at once (owner and
 * tenant each book it in their own company). At least one company is required; the caller is
 * responsible for blocking submit while `values` is empty and passing `error` to surface that.
 */
export function CompanyAssignmentField({
  values,
  onValuesChange,
  error,
  disabled,
}: {
  values: string[];
  onValuesChange: (values: string[]) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const companiesQ = useGesellschaften();
  const options = (companiesQ.data ?? []).map((c) => ({
    value: c.id,
    label: `${c.code} · ${c.name}`,
    keywords: c.name,
  }));

  return (
    <div className="space-y-1">
      {/* Marked required because it is: both the create dialog and the edit dialog refuse to save
          with no company selected. Nothing on the field said so before the refusal. */}
      <Label className="text-xs text-muted-foreground">
        {t("objekte.zuordnung.gesellschaft")} <PflichtStern />
      </Label>
      <MultiCombobox
        values={values}
        onValuesChange={onValuesChange}
        options={options}
        placeholder={t("objekte.zuordnung.gesellschaftWaehlen")}
        disabled={disabled}
        className={error ? "border-destructive" : undefined}
      />
      {error ? (
        <p className="text-xs text-destructive">{t("objekte.zuordnung.keineZuordnung")}</p>
      ) : null}
    </div>
  );
}
