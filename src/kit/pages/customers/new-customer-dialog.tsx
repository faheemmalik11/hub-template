import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Combobox } from "../../ui/combobox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { CustomersAdapter } from "../../adapters/customers";
import { FieldErrorText, RequiredMark } from "./form-hints";
import type { CustomersLabels } from "./labels";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_PATTERN = /^\d{4,5}$/;

interface NewCustomerForm {
  companyId: string;
  isCompany: boolean;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressZip: string;
  addressCity: string;
  vatId: string;
}

const EMPTY_FORM: NewCustomerForm = {
  companyId: "",
  isCompany: true,
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  addressStreet: "",
  addressZip: "",
  addressCity: "",
  vatId: "",
};

function validateForm(
  form: NewCustomerForm,
  messages: CustomersLabels["validation"],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.companyId) errors.companyId = messages.company;
  if (!form.name.trim()) errors.name = messages.name;
  if (form.addressZip.trim() && !ZIP_PATTERN.test(form.addressZip.trim())) {
    errors.addressZip = messages.zip;
  }
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = messages.email;
  }
  return errors;
}

export function NewCustomerDialog({
  adapter,
  labels,
}: {
  adapter: CustomersAdapter;
  labels: CustomersLabels;
}) {
  const companiesQuery = adapter.useCompanies();
  const companies = companiesQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewCustomerForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);

  // Clear a field's error as soon as it is edited, not only on the next submit.
  const setField = <Key extends keyof NewCustomerForm>(key: Key, value: NewCustomerForm[Key]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: "" } : previous));
  };

  async function createCustomer() {
    const foundErrors = validateForm(form, labels.validation);
    if (Object.keys(foundErrors).length > 0) {
      setErrors(foundErrors);
      toast.error(labels.newCustomer.formIncomplete);
      return;
    }
    const cleaned = (value: string) => (value.trim() === "" ? null : value.trim());
    setIsCreating(true);
    try {
      await adapter.createCustomer({
        companyId: form.companyId,
        isCompany: form.isCompany,
        name: form.name.trim(),
        contactPerson: cleaned(form.contactPerson),
        email: cleaned(form.email),
        phone: cleaned(form.phone),
        addressStreet: cleaned(form.addressStreet),
        addressZip: cleaned(form.addressZip),
        addressCity: cleaned(form.addressCity),
        vatId: cleaned(form.vatId),
      });
      toast.success(labels.newCustomer.created);
      setForm(EMPTY_FORM);
      setOpen(false);
    } catch (error) {
      toast.error(labels.newCustomer.createFailed(readableErrorMessage(error, "")));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {labels.newCustomer.button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.newCustomer.title}</DialogTitle>
          <DialogDescription>{labels.newCustomer.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              {labels.fields.company} <RequiredMark title={labels.requiredField} />
            </Label>
            <Combobox
              value={form.companyId}
              onValueChange={(value) => setField("companyId", value)}
              options={companies.map((company) => ({
                value: company.id,
                label: `${company.code} · ${company.name}`,
              }))}
              placeholder={labels.newCustomer.companyPlaceholder}
              invalid={!!errors.companyId}
            />
            <FieldErrorText text={errors.companyId} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              checked={form.isCompany}
              onCheckedChange={(value) => setField("isCompany", value)}
              id="new-customer-is-company"
            />
            <Label
              htmlFor="new-customer-is-company"
              className="text-sm font-normal text-muted-foreground"
            >
              {labels.newCustomer.isCompany}
            </Label>
          </div>
          <NewCustomerField
            label={labels.fields.name}
            value={form.name}
            onChange={(value) => setField("name", value)}
            required
            requiredTitle={labels.requiredField}
            error={errors.name}
            placeholder={labels.examples.name}
            fullWidth
          />
          {form.isCompany && (
            <NewCustomerField
              label={labels.fields.contactPerson}
              value={form.contactPerson}
              onChange={(value) => setField("contactPerson", value)}
              requiredTitle={labels.requiredField}
              fullWidth
            />
          )}
          <NewCustomerField
            label={labels.fields.street}
            value={form.addressStreet}
            onChange={(value) => setField("addressStreet", value)}
            requiredTitle={labels.requiredField}
            error={errors.addressStreet}
            placeholder={labels.examples.street}
            fullWidth
          />
          <NewCustomerField
            label={labels.fields.zip}
            value={form.addressZip}
            onChange={(value) => setField("addressZip", value)}
            requiredTitle={labels.requiredField}
            error={errors.addressZip}
            placeholder={labels.examples.zip}
          />
          <NewCustomerField
            label={labels.fields.city}
            value={form.addressCity}
            onChange={(value) => setField("addressCity", value)}
            requiredTitle={labels.requiredField}
            error={errors.addressCity}
            placeholder={labels.examples.city}
          />
          <NewCustomerField
            label={labels.fields.vatId}
            value={form.vatId}
            onChange={(value) => setField("vatId", value)}
            requiredTitle={labels.requiredField}
          />
          <NewCustomerField
            label={labels.fields.phone}
            value={form.phone}
            onChange={(value) => setField("phone", value)}
            requiredTitle={labels.requiredField}
          />
          <NewCustomerField
            label={labels.fields.email}
            value={form.email}
            onChange={(value) => setField("email", value)}
            error={errors.email}
            requiredTitle={labels.requiredField}
            placeholder={labels.examples.email}
            fullWidth
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {labels.newCustomer.cancel}
          </Button>
          <Button onClick={createCustomer} disabled={isCreating}>
            {isCreating ? labels.newCustomer.creating : labels.newCustomer.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCustomerField({
  label,
  value,
  onChange,
  fullWidth,
  required,
  requiredTitle,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
  required?: boolean;
  requiredTitle: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className={fullWidth ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">
        {label} {required && <RequiredMark title={requiredTitle} />}
      </Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-required={required}
        aria-invalid={!!error}
        className={error ? "border-destructive focus-visible:ring-destructive/30" : undefined}
      />
      <FieldErrorText text={error} />
    </div>
  );
}
