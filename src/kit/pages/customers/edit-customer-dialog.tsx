import { useState } from "react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { Customer, CustomersAdapter } from "../../adapters/customers";
import { FieldErrorText, RequiredMark } from "./form-hints";
import type { CustomersLabels } from "./labels";

export function EditCustomerDialog({
  open,
  onOpenChange,
  customer,
  adapter,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  adapter: CustomersAdapter;
  labels: CustomersLabels;
}) {
  const dialogLabels = labels.detail.editDialog;

  const [name, setName] = useState(customer.name);
  const [contactPerson, setContactPerson] = useState(customer.contactPerson ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [street, setStreet] = useState(customer.addressStreet ?? "");
  const [zip, setZip] = useState(customer.addressZip ?? "");
  const [city, setCity] = useState(customer.addressCity ?? "");
  const [vatId, setVatId] = useState(customer.vatId ?? "");
  const [customerNumber, setCustomerNumber] = useState(customer.customerNumber ?? "");
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Reopening must show the stored record, not an abandoned draft; a save elsewhere refreshes too.
  const [syncedFrom, setSyncedFrom] = useState(customer.updatedAt);
  if (open && syncedFrom !== customer.updatedAt) {
    setSyncedFrom(customer.updatedAt);
    setName(customer.name);
    setContactPerson(customer.contactPerson ?? "");
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
    setStreet(customer.addressStreet ?? "");
    setZip(customer.addressZip ?? "");
    setCity(customer.addressCity ?? "");
    setVatId(customer.vatId ?? "");
    setCustomerNumber(customer.customerNumber ?? "");
    setNameError("");
  }

  async function saveCustomer() {
    if (!name.trim()) {
      setNameError(labels.validation.name);
      return;
    }
    setNameError("");
    setIsSaving(true);
    try {
      await adapter.updateCustomer(customer.id, {
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        addressStreet: street.trim() || null,
        addressZip: zip.trim() || null,
        addressCity: city.trim() || null,
        vatId: vatId.trim() || null,
        customerNumber: customerNumber.trim() || null,
      });
      toast.success(dialogLabels.saved);
      onOpenChange(false);
    } catch (error) {
      toast.error(dialogLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{dialogLabels.title}</DialogTitle>
          <DialogDescription>{dialogLabels.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {labels.fields.name} <RequiredMark title={labels.requiredField} />
            </Label>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError("");
              }}
              aria-invalid={!!nameError}
            />
            <FieldErrorText text={nameError} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fields.contactPerson}</Label>
              <Input
                value={contactPerson}
                onChange={(event) => setContactPerson(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {labels.fields.customerNumber}
              </Label>
              <Input
                value={customerNumber}
                onChange={(event) => setCustomerNumber(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fields.street}</Label>
            <Input value={street} onChange={(event) => setStreet(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fields.zip}</Label>
              <Input value={zip} onChange={(event) => setZip(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fields.city}</Label>
              <Input value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fields.phone}</Label>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fields.email}</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fields.vatId}</Label>
            <Input value={vatId} onChange={(event) => setVatId(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dialogLabels.cancel}
          </Button>
          <Button onClick={saveCustomer} disabled={isSaving}>
            {isSaving ? dialogLabels.saving : dialogLabels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
