import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/feld";
import { Label } from "@/components/ui/label";
import { useEmployees } from "@/data";
import { Trans, useTranslation } from "@/lib/i18n";
import type { DealForm } from "./deal-form";

type FlagKey = "ownLead" | "fromViewing" | "costsClosed" | "readyForBookkeeping";

const FLAGS: FlagKey[] = ["ownLead", "fromViewing", "costsClosed", "readyForBookkeeping"];

export function DealFactsCard({
  form,
  onChange,
  customerOptions,
  disabled,
  assignsBrokers,
  onJumpToField,
}: {
  form: DealForm;
  onChange: (patch: Partial<DealForm>) => void;
  customerOptions: ComboboxOption[];
  disabled: boolean;
  assignsBrokers: boolean;
  onJumpToField?: (tab: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const handler = form.handledBy ?? form.acquiredBy;
  const leadOwnerIsAnotherBroker =
    !form.ownLead && form.acquiredBy !== null && form.acquiredBy !== handler;
  const costsClosedHasNoEffect = !form.ownLead && !leadOwnerIsAnotherBroker;
  return (
    <div>
      {assignsBrokers && <BrokerFields form={form} onChange={onChange} disabled={disabled} />}
      <div className="@container mt-4 grid gap-3 @md:grid-cols-2">
        {FLAGS.map((flag) => (
          <label
            key={flag}
            id={`field-${flag === "costsClosed" ? "costs-closed" : flag}`}
            className="flex items-start gap-2 text-sm text-foreground"
          >
            <Checkbox
              className="mt-0.5"
              checked={form[flag]}
              onCheckedChange={(checked) => onChange({ [flag]: checked === true })}
              disabled={disabled}
            />
            <span>
              {t(`commissionDeals.facts.${flag}`)}
              <span className="block text-xs text-muted-foreground">
                {flag === "readyForBookkeeping" ? (
                  <Trans
                    i18nKey="commissionDeals.facts.readyForBookkeepingHint"
                    components={{ strong: <strong className="font-semibold text-foreground" /> }}
                  />
                ) : (
                  t(`commissionDeals.facts.${flag}Hint`)
                )}
              </span>
              {flag === "costsClosed" && onJumpToField && (
                <button
                  type="button"
                  onClick={() => onJumpToField("calculation", "deal-costs-section")}
                  className="mt-1 block text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
                >
                  {t("commissionDeals.facts.viewCostList")}
                </button>
              )}
              {flag === "costsClosed" && costsClosedHasNoEffect && (
                <span className="block text-xs text-muted-foreground">
                  {t("commissionDeals.facts.costsClosedNoEffectHint")}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <Field className="mt-4 space-y-1.5">
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
      </Field>
    </div>
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
    <div className="@container mt-4 grid gap-3 @md:grid-cols-2">
      <Field id="field-handled-by" className="space-y-1.5">
        <Label>{t("commissionDeals.facts.handledBy")}</Label>
        <Combobox
          value={form.handledBy}
          onValueChange={(handledBy) => onChange({ handledBy })}
          options={options}
          disabled={disabled}
        />
      </Field>
      <Field className="space-y-1.5">
        <Label>
          {t("commissionDeals.facts.acquiredBy")}
          {form.ownLead ? (
            <span className="ml-2 text-xs text-muted-foreground">
              {t("commissionDeals.facts.acquiredByDisabledHint")}
            </span>
          ) : (
            !form.handledBy && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t("commissionDeals.facts.acquiredByNeedsHandlerHint")}
              </span>
            )
          )}
        </Label>
        <Combobox
          value={form.acquiredBy}
          onValueChange={(acquiredBy) => onChange({ acquiredBy })}
          options={options}
          disabled={disabled || form.ownLead}
        />
      </Field>
    </div>
  );
}
