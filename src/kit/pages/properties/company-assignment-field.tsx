import { Label } from "../../ui/label";
import { MultiCombobox } from "../../ui/multi-combobox";
import type { PropertyCompany } from "../../adapters/properties";
import { RequiredMark } from "./form-field";
import type { PropertiesLabels } from "./labels";

// Direct property-to-company assignment; several companies are normal, at least one is required.
export function CompanyAssignmentField({
  values,
  onValuesChange,
  companies,
  labels,
  requiredFieldTitle,
  error,
  disabled,
}: {
  values: string[];
  onValuesChange: (values: string[]) => void;
  companies: PropertyCompany[];
  labels: PropertiesLabels["companyAssignment"];
  requiredFieldTitle: string;
  error?: boolean;
  disabled?: boolean;
}) {
  const options = companies.map((company) => ({
    value: company.id,
    label: `${company.code} · ${company.name}`,
    keywords: company.name,
  }));

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {labels.label} <RequiredMark title={requiredFieldTitle} />
      </Label>
      <MultiCombobox
        values={values}
        onValuesChange={onValuesChange}
        options={options}
        placeholder={labels.placeholder}
        disabled={disabled}
        className={error ? "border-destructive" : undefined}
      />
      {error ? <p className="text-xs text-destructive">{labels.required}</p> : null}
    </div>
  );
}
