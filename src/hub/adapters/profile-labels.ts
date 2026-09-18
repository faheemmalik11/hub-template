import { useMemo } from "react";

import type { ProfileLabels } from "@hub-kit/core/pages";

import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { useTranslation } from "@/lib/i18n";

export function useProfileLabels(): ProfileLabels {
  const { t } = useTranslation();
  const { role, can } = useAuth();

  // Who may change these rights decides what the card says. "Ask an administrator" reads as
  // nonsense to the administrator reading it, and the owner account cannot be changed at all.
  let readOnlyNote = t("profil.zugriff.nurLesen");
  if (role === "super_admin") readOnlyNote = t("profil.zugriff.nurLesenEigentuemer");
  else if (can(PERMISSIONS.pageTeam)) readOnlyNote = t("profil.zugriff.nurLesenAdmin");

  return useMemo<ProfileLabels>(
    () => ({
      title: t("profil.title"),
      subtitle: t("profil.subtitle"),
      picture: {
        title: t("profil.bild.title"),
        description: t("profil.bild.desc"),
        choose: t("profil.bild.waehlen"),
        replace: t("profil.bild.ersetzen"),
        remove: t("profil.bild.entfernen"),
        uploading: t("profil.bild.laedt"),
        hint: (maxSize) => t("profil.bild.hinweis", { groesse: maxSize }),
        wrongType: t("profil.bild.falscherTyp"),
        tooBig: (maxSize) => t("profil.bild.zuGross", { groesse: maxSize }),
        saved: t("profil.bild.gespeichert"),
        removed: t("profil.bild.entfernt"),
        failed: (error) => t("profil.bild.fehler", { fehler: error }),
        removeTitle: t("profil.bild.entfernenTitel"),
        removeDescription: t("profil.bild.entfernenText"),
        confirmRemove: t("profil.bild.entfernenBestaetigen"),
        cancel: t("profil.bild.abbrechen"),
      },
      details: {
        title: t("profil.daten.title"),
        description: t("profil.daten.desc"),
        name: t("profil.daten.name"),
        email: t("profil.daten.email"),
        emailHint: t("profil.daten.emailHinweis"),
        emailLocked: t("profil.daten.emailGesperrt"),
        nameRequired: t("profil.daten.nameErforderlich"),
        emailRequired: t("profil.daten.emailErforderlich"),
        emailInvalid: t("profil.daten.emailUngueltig"),
        save: t("profil.daten.speichern"),
        saving: t("profil.daten.speichert"),
        saved: t("profil.daten.gespeichert"),
        failed: (error) => t("profil.daten.fehler", { fehler: error }),
      },
      password: {
        title: t("profil.passwort.title"),
        description: t("profil.passwort.desc"),
        current: t("profil.passwort.aktuell"),
        next: t("profil.passwort.neu"),
        repeat: t("profil.passwort.wiederholen"),
        show: t("profil.passwort.anzeigen"),
        hide: t("profil.passwort.verbergen"),
        tooShort: (minLength) => t("profil.passwort.zuKurz", { anzahl: minLength }),
        doesNotMatch: t("profil.passwort.stimmtNicht"),
        sameAsCurrent: t("profil.passwort.wieBisher"),
        change: t("profil.passwort.aendern"),
        changing: t("profil.passwort.aendert"),
        changed: t("profil.passwort.geaendert"),
        failed: (error) => t("profil.passwort.fehler", { fehler: error }),
        locked: t("profil.passwort.gesperrt"),
      },
      access: {
        title: t("profil.zugriff.title"),
        description: t("profil.zugriff.desc"),
        roleLabel: t("profil.zugriff.rolle"),
        permissionsLabel: t("profil.zugriff.rechte"),
        permissionCount: (count) => String(count),
        readOnlyNote,
        categoryLabel: (categoryKey) =>
          t(`team.permissions.kategorie.${categoryKey}`, { defaultValue: categoryKey }),
        roleLabelText: (roleName) => t(`team.role.${roleName}`, { defaultValue: roleName }),
        empty: t("profil.zugriff.leer"),
      },
    }),
    [t, readOnlyNote],
  );
}
