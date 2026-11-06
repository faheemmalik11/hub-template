import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEmployees } from "@/data";
import { useTranslation } from "@/lib/i18n";
import type { DealForm } from "./deal-form";

type FlagKey = "ownLead" | "fromViewing" | "costsClosed" | "readyForBookkeeping";

const FLAGS: FlagKey[] = ["ownLead", "fromViewing", "costsClosed", "readyForBookkeeping"];

export function DealFactsCard({
  form,
  onChange,
  customerOptions,
  disabled,
  assignsBrokers,
}: {
  form: DealForm;
  onChange: (patch: Partial<DealForm>) => void;
  customerOptions: ComboboxOption[];
  disabled: boolean;
  assignsBrokers: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.facts.title")}
      </h2>
      {assignsBrokers && <BrokerFields form={form} onChange={onChange} disabled={disabled} />}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FLAGS.map((flag) => (
          <label key={flag} className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              className="mt-0.5"
              checked={form[flag]}
              onCheckedChange={(checked) => onChange({ [flag]: checked === true })}
              disabled={disabled}
            />
            <span>
              {t(`commissionDeals.facts.${flag}`)}
              <span className="block text-xs text-muted-foreground">
                {t(`commissionDeals.facts.${flag}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label>{t("commissionDeals.facts.referrer")}</Label>
        <Combobox
          value={form.referrerCustomerId}
          onValueChange={(referrerCustomerId) => onChange({ referrerCustomerId })}
          options={customerOptions}
          placeholder={t("commissionDeals.facts.referrerPlaceholder")}
          searchPlaceholder={t("commissionDeals.side.payerSearch")}
          emptyText={t("commissionDeals.side.noCustomers")}
          disabled={disabled}
        />
      </div>
    </section>
  );
}

function BrokerFields({
  form,
  onChange,
  disabled,
}: {
  form: DealForm;
  onChange: (patch: Partial<DealForm>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const employeesQ = useEmployees();
  const options: ComboboxOption[] = (employeesQ.data ?? [])
    .filter((employee) => employee.is_active)
    .map((employee) => ({ value: employee.id, label: employee.name ?? employee.email }));
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{t("commissionDeals.facts.handledBy")}</Label>
        <Combobox
          value={form.handledBy}
          onValueChange={(handledBy) => onChange({ handledBy })}
          options={options}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("commissionDeals.facts.acquiredBy")}</Label>
        <Combobox
          value={form.acquiredBy}
          onValueChange={(acquiredBy) => onChange({ acquiredBy })}
          options={options}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
