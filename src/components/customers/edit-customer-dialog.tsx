// Editing a customer's master data.
//
// Ported from the sibling Immonetz Hub, minus the LexOffice half. There, a customer is mirrored into
// LexOffice and the save has to go there first, because the address printed on the invoice is read
// from the LexOffice contact rather than from the local row. This Hub has no LexOffice integration,
// so the row here IS the master record: the save is a plain local update (useUpdateCustomer) and
// there is no second system that could disagree with it.
//
// That also means the address is never mandatory here. In Immonetz it is required for a mirrored
// customer because LexOffice refuses to invoice a contact without a billing address; the same reason
// is why kundeSchema is called with `adressePflicht: false` on this Hub's create dialog. The rules
// stay in step: name is the only required field, in both dialogs.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldErrorText, RequiredStern } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateCustomer } from "@/data";
import type { Customer } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { errorText } from "@/lib/data/format";

export function EditCustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
}) {
  const { t } = useTranslation();
  const update = useUpdateCustomer(customer.id);

  const [name, setName] = useState(customer.name);
  const [contactPerson, setContactPerson] = useState(customer.contact_person ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [street, setStreet] = useState(customer.address_street ?? "");
  const [zip, setZip] = useState(customer.address_zip ?? "");
  const [city, setCity] = useState(customer.address_city ?? "");
  const [vatId, setVatId] = useState(customer.vat_id ?? "");
  const [customerNumber, setCustomerNumber] = useState(customer.customer_number ?? "");
  const [nameError, setNameError] = useState("");

  // Reopening after a cancelled edit must show what is stored, not the abandoned draft. Compared
  // against updated_at rather than an effect on `open`, so a save made elsewhere also refreshes it.
  const [syncedFrom, setSyncedFrom] = useState(customer.updated_at);
  if (open && syncedFrom !== customer.updated_at) {
    setSyncedFrom(customer.updated_at);
    setName(customer.name);
    setContactPerson(customer.contact_person ?? "");
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
    setStreet(customer.address_street ?? "");
    setZip(customer.address_zip ?? "");
    setCity(customer.address_city ?? "");
    setVatId(customer.vat_id ?? "");
    setCustomerNumber(customer.customer_number ?? "");
    setNameError("");
  }

  function save() {
    if (!name.trim()) {
      setNameError(t("customers.validierung.name"));
      return;
    }
    setNameError("");
    update.mutate(
      {
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        addressStreet: street.trim() || null,
        addressZip: zip.trim() || null,
        addressCity: city.trim() || null,
        vatId: vatId.trim() || null,
        customerNumber: customerNumber.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t("customers.detail.edit.toast.gespeichert"));
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(
            t("customers.detail.edit.toast.fehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("customers.detail.edit.title")}</DialogTitle>
          <DialogDescription>{t("customers.detail.edit.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("customers.detail.field.name")} <RequiredStern />
            </Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              aria-invalid={!!nameError}
            />
            <FieldErrorText text={nameError} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.ansprechpartner")}
              </Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.kundennummer")}
              </Label>
              <Input value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("customers.detail.field.strasse")}
            </Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.plz")}
              </Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.ort")}
              </Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.telefon")}
              </Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("customers.detail.field.email")}
              </Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("customers.detail.field.ustId")}
            </Label>
            <Input value={vatId} onChange={(e) => setVatId(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("customers.detail.edit.cancel")}
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending
              ? t("customers.detail.edit.speichere")
              : t("customers.detail.edit.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
