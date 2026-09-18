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
import { FeldFehlerText, PflichtStern } from "@/components/ui/form-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateCustomer } from "@/lib/data/queries";
import type { Customer } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";
import { fehlerText } from "@/lib/data/format";

export function EditCustomerDialog({
  open,
  onOpenChange,
  kunde,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kunde: Customer;
}) {
  const { t } = useTranslation();
  const update = useUpdateCustomer(kunde.id);

  const [name, setName] = useState(kunde.name);
  const [contactPerson, setContactPerson] = useState(kunde.contact_person ?? "");
  const [email, setEmail] = useState(kunde.email ?? "");
  const [phone, setPhone] = useState(kunde.phone ?? "");
  const [street, setStreet] = useState(kunde.address_street ?? "");
  const [zip, setZip] = useState(kunde.address_zip ?? "");
  const [city, setCity] = useState(kunde.address_city ?? "");
  const [vatId, setVatId] = useState(kunde.vat_id ?? "");
  const [customerNumber, setCustomerNumber] = useState(kunde.customer_number ?? "");
  const [nameFehler, setNameFehler] = useState("");

  // Reopening after a cancelled edit must show what is stored, not the abandoned draft. Compared
  // against updated_at rather than an effect on `open`, so a save made elsewhere also refreshes it.
  const [syncedFrom, setSyncedFrom] = useState(kunde.updated_at);
  if (open && syncedFrom !== kunde.updated_at) {
    setSyncedFrom(kunde.updated_at);
    setName(kunde.name);
    setContactPerson(kunde.contact_person ?? "");
    setEmail(kunde.email ?? "");
    setPhone(kunde.phone ?? "");
    setStreet(kunde.address_street ?? "");
    setZip(kunde.address_zip ?? "");
    setCity(kunde.address_city ?? "");
    setVatId(kunde.vat_id ?? "");
    setCustomerNumber(kunde.customer_number ?? "");
    setNameFehler("");
  }

  function speichern() {
    if (!name.trim()) {
      setNameFehler(t("kunden.validierung.name"));
      return;
    }
    setNameFehler("");
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
          toast.success(t("kunden.detail.edit.toast.gespeichert"));
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(
            t("kunden.detail.edit.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("kunden.detail.edit.title")}</DialogTitle>
          <DialogDescription>{t("kunden.detail.edit.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("kunden.detail.field.name")} <PflichtStern />
            </Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameFehler) setNameFehler("");
              }}
              aria-invalid={!!nameFehler}
            />
            <FeldFehlerText text={nameFehler} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.ansprechpartner")}
              </Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.kundennummer")}
              </Label>
              <Input value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("kunden.detail.field.strasse")}
            </Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.plz")}
              </Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.ort")}
              </Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.telefon")}
              </Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("kunden.detail.field.email")}
              </Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("kunden.detail.field.ustId")}
            </Label>
            <Input value={vatId} onChange={(e) => setVatId(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("kunden.detail.edit.cancel")}
          </Button>
          <Button onClick={speichern} disabled={update.isPending}>
            {update.isPending
              ? t("kunden.detail.edit.speichere")
              : t("kunden.detail.edit.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
