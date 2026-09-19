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
import { PflichtStern } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { fehlerText } from "@/lib/data/format";
import { useGesellschaften, useObjekte, useSavePropertyCompanyLink } from "@/lib/data/queries";
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
export function ZuordnungDialog({
  fest,
  link,
  vergeben,
  onClose,
}: {
  /** The side that is fixed: the page the modal was opened from. */
  fest: { art: "objekt"; propertyId: string } | { art: "gesellschaft"; companyId: string };
  /** The assignment being edited, or null to add one. */
  link: PropertyCompany | null;
  /** Ids already assigned on the other side, which cannot be picked twice. */
  vergeben: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const gesellschaftenQ = useGesellschaften();
  const objekteQ = useObjekte();
  const speichern = useSavePropertyCompanyLink();

  const waehltGesellschaft = fest.art === "objekt";
  const [auswahl, setAuswahl] = useState<string>(
    (waehltGesellschaft ? link?.company_id : link?.property_id) ?? "",
  );
  const [nummer, setNummer] = useState<string>(
    link?.cost_centre_number != null ? String(link.cost_centre_number) : "",
  );
  const [fehler, setFehler] = useState<{ auswahl?: string; nummer?: string }>({});

  const aktuell = waehltGesellschaft ? link?.company_id : link?.property_id;
  const optionen = waehltGesellschaft
    ? (gesellschaftenQ.data ?? [])
        .filter((g) => g.id === aktuell || !vergeben.includes(g.id))
        .map((g) => ({ value: g.id, label: `${g.code} · ${g.name}`, keywords: g.name }))
    : (objekteQ.data ?? [])
        // An archived property is not offered for a new assignment, but stays in the list when it
        // is the one being edited.
        .filter((o) => o.id === aktuell || (!o.deleted_at && !vergeben.includes(o.id)))
        .map((o) => ({
          value: o.id,
          label: o.name ? `${o.code} · ${o.name}` : o.code,
          keywords: o.name ?? "",
        }));

  const absenden = () => {
    const eingabe = nummer.trim();
    const neu: typeof fehler = {};
    if (!auswahl) {
      neu.auswahl = waehltGesellschaft
        ? t("objekte.detail.zuordnungFirmaFehlt")
        : t("objekte.detail.zuordnungObjektFehlt");
    }
    if (eingabe !== "" && !/^[1-9]\d{0,8}$/.test(eingabe)) {
      neu.nummer = t("objekte.detail.kostenstelleUngueltig");
    }
    setFehler(neu);
    if (neu.auswahl || neu.nummer) return;

    const nummerWert = eingabe === "" ? null : Number(eingabe);
    speichern.mutate(
      {
        propertyId: fest.art === "objekt" ? fest.propertyId : auswahl,
        companyId: fest.art === "gesellschaft" ? fest.companyId : auswahl,
        linkId: link?.id ?? null,
        previousPropertyId: link?.property_id ?? null,
        previousCompanyId: link?.company_id ?? null,
        // A non-admin cannot set a number, so nothing is sent for them.
        nummer: isAdmin ? nummerWert : null,
        nummerGeaendert: isAdmin && nummerWert !== (link?.cost_centre_number ?? null),
        actor: user?.email ?? null,
      },
      {
        onSuccess: () => {
          toast.success(t("objekte.detail.toast.zuordnungGeaendert"));
          onClose();
        },
        onError: (e) =>
          toast.error(t("objekte.detail.toast.speichernFehlgeschlagen", { error: fehlerText(e) })),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(offen) => (offen ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {link
              ? t("objekte.detail.zuordnungDialogBearbeiten")
              : waehltGesellschaft
                ? t("objekte.detail.zuordnungDialogNeu")
                : t("objekte.detail.zuordnungDialogNeuObjekt")}
          </DialogTitle>
          <DialogDescription>
            {waehltGesellschaft
              ? t("objekte.detail.zuordnungDialogBeschreibung")
              : t("objekte.detail.zuordnungDialogBeschreibungObjekt")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {waehltGesellschaft
                ? t("objekte.zuordnung.gesellschaft")
                : t("objekte.detail.zuordnungObjekt")}{" "}
              <PflichtStern />
            </Label>
            <Combobox
              value={auswahl}
              onValueChange={(v) => {
                setAuswahl(v);
                setFehler((f) => ({ ...f, auswahl: undefined }));
              }}
              options={optionen}
              placeholder={
                waehltGesellschaft
                  ? t("objekte.zuordnung.gesellschaftWaehlen")
                  : t("objekte.detail.zuordnungObjektWaehlen")
              }
              invalid={!!fehler.auswahl}
            />
            {fehler.auswahl && <p className="text-xs text-destructive">{fehler.auswahl}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("objekte.detail.kostenstelleLabel")}
            </Label>
            <Input
              inputMode="numeric"
              value={nummer}
              onChange={(e) => {
                setNummer(e.target.value);
                setFehler((f) => ({ ...f, nummer: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") absenden();
              }}
              disabled={!isAdmin}
              aria-invalid={!!fehler.nummer}
              placeholder={t("objekte.detail.kostenstellePlatzhalter")}
            />
            {fehler.nummer && <p className="text-xs text-destructive">{fehler.nummer}</p>}
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? t("objekte.detail.kostenstelleHinweis")
                : t("objekte.detail.kostenstelleNurAdmin")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("objekte.detail.action.abbrechen")}
          </Button>
          <Button onClick={absenden} disabled={speichern.isPending}>
            {speichern.isPending
              ? t("objekte.detail.action.speichere")
              : t("objekte.detail.action.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
