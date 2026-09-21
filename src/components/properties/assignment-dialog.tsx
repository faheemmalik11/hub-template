import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequiredStern } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { errorText } from "@/lib/data/format";
import { useCompanies, useProperties, useSavePropertyCompanyLink } from "@/data";
import type { PropertyCompany } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";

/**
 * Add or change one property/company assignment, with the cost-centre number it carries.
 *
 * Opened from both ends of the relation (17.09.2026): the property page fixes the property and picks
 * the company, the company page fixes the company and picks the property. One form, so the two
 * cannot drift apart. Editing can move the assignment to another company or property; the number
 * then belongs to the new pair and is not carried over unless it is typed again. Removing is not
 * here: it is the red cross on the row, behind its own confirmation.
 *
 * The number is admin-only, here and in the database (migrations 20260917140000, 20260917150000),
 * because a wrong number goes straight to the tax adviser. Assigning stays open to everyone.
 */
export function AssignmentDialog({
  fest,
  link,
  assign,
  onClose,
}: {
  /** The side that is fixed: the page the modal was opened from. */
  fest: { art: "objekt"; propertyId: string } | { art: "gesellschaft"; companyId: string };
  /** The assignment being edited, or null to add one. */
  link: PropertyCompany | null;
  /** Ids already assigned on the other side, which cannot be picked twice. */
  assign: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const companiesQ = useCompanies();
  const propertiesQ = useProperties();
  const save = useSavePropertyCompanyLink();

  const choosesCompany = fest.art === "objekt";
  const [selection, setSelection] = useState<string>(
    (choosesCompany ? link?.company_id : link?.property_id) ?? "",
  );
  const [number, setNumber] = useState<string>(
    link?.cost_centre_number != null ? String(link.cost_centre_number) : "",
  );
  const [error, setError] = useState<{ selection?: string; number?: string }>({});

  const current = choosesCompany ? link?.company_id : link?.property_id;
  const options = choosesCompany
    ? (companiesQ.data ?? [])
        .filter((g) => g.id === current || !assign.includes(g.id))
        .map((g) => ({ value: g.id, label: `${g.code} · ${g.name}`, keywords: g.name }))
    : (propertiesQ.data ?? [])
        // An archived property is not offered for a new assignment, but stays in the list when it
        // is the one being edited.
        .filter((o) => o.id === current || (!o.deleted_at && !assign.includes(o.id)))
        .map((o) => ({
          value: o.id,
          label: o.name ? `${o.code} · ${o.name}` : o.code,
          keywords: o.name ?? "",
        }));

  const submit = () => {
    const input = number.trim();
    const next: typeof error = {};
    if (!selection) {
      next.selection = choosesCompany
        ? t("properties.detail.zuordnungFirmaFehlt")
        : t("properties.detail.zuordnungObjektFehlt");
    }
    if (input !== "" && !/^[1-9]\d{0,8}$/.test(input)) {
      next.number = t("properties.detail.kostenstelleUngueltig");
    }
    setError(next);
    if (next.selection || next.number) return;

    const numberValue = input === "" ? null : Number(input);
    save.mutate(
      {
        propertyId: fest.art === "objekt" ? fest.propertyId : selection,
        companyId: fest.art === "gesellschaft" ? fest.companyId : selection,
        linkId: link?.id ?? null,
        previousPropertyId: link?.property_id ?? null,
        previousCompanyId: link?.company_id ?? null,
        // A non-admin cannot set a number, so nothing is sent for them.
        number: isAdmin ? numberValue : null,
        numberChanged: isAdmin && numberValue !== (link?.cost_centre_number ?? null),
        actor: user?.email ?? null,
      },
      {
        onSuccess: () => {
          toast.success(t("properties.detail.toast.zuordnungGeaendert"));
          onClose();
        },
        onError: (e) =>
          toast.error(
            t("properties.detail.toast.speichernFehlgeschlagen", { error: errorText(e) }),
          ),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {link
              ? t("properties.detail.zuordnungDialogBearbeiten")
              : choosesCompany
                ? t("properties.detail.zuordnungDialogNeu")
                : t("properties.detail.zuordnungDialogNeuObjekt")}
          </DialogTitle>
          <DialogDescription>
            {choosesCompany
              ? t("properties.detail.zuordnungDialogBeschreibung")
              : t("properties.detail.zuordnungDialogBeschreibungObjekt")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {choosesCompany
                ? t("properties.zuordnung.gesellschaft")
                : t("properties.detail.zuordnungObjekt")}{" "}
              <RequiredStern />
            </Label>
            <Combobox
              value={selection}
              onValueChange={(v) => {
                setSelection(v);
                setError((f) => ({ ...f, selection: undefined }));
              }}
              options={options}
              placeholder={
                choosesCompany
                  ? t("properties.zuordnung.gesellschaftWaehlen")
                  : t("properties.detail.zuordnungObjektWaehlen")
              }
              invalid={!!error.selection}
            />
            {error.selection && <p className="text-xs text-destructive">{error.selection}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("properties.detail.kostenstelleLabel")}
            </Label>
            <Input
              inputMode="numeric"
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setError((f) => ({ ...f, number: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              disabled={!isAdmin}
              aria-invalid={!!error.number}
              placeholder={t("properties.detail.kostenstellePlatzhalter")}
            />
            {error.number && <p className="text-xs text-destructive">{error.number}</p>}
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? t("properties.detail.kostenstelleHinweis")
                : t("properties.detail.kostenstelleNurAdmin")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("properties.detail.action.abbrechen")}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending
              ? t("properties.detail.action.speichere")
              : t("properties.detail.action.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
