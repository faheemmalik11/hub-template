import { useMemo } from "react";

import type { ProfileLabels } from "@/kit/pages";

import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";

export function useProfileLabels(): ProfileLabels {
  const { t } = useTranslation();
  const { role, can } = useAuth();

  // Who may change these rights decides what the card says. "Ask an administrator" reads as
  // nonsense to the administrator reading it, and the owner account cannot be changed at all.
  let readOnlyNote = t("profile.zugriff.nurLesen");
  if (role === "super_admin") readOnlyNote = t("profile.zugriff.nurLesenEigentuemer");
  else if (can(PERMISSIONS.pageTeam)) readOnlyNote = t("profile.zugriff.nurLesenAdmin");

  return useMemo<ProfileLabels>(
    () => ({
      title: t("profile.title"),
      subtitle: t("profile.subtitle"),
      picture: {
        title: t("profile.bild.title"),
        description: t("profile.bild.desc"),
        choose: t("profile.bild.waehlen"),
        replace: t("profile.bild.ersetzen"),
        remove: t("profile.bild.entfernen"),
        uploading: t("profile.bild.laedt"),
        hint: (maxSize) => t("profile.bild.hinweis", { size: maxSize }),
        wrongType: t("profile.bild.falscherTyp"),
        tooBig: (maxSize) => t("profile.bild.zuGross", { size: maxSize }),
        saved: t("profile.bild.gespeichert"),
        removed: t("profile.bild.entfernt"),
        failed: (error) => t("profile.bild.fehler", { error: error }),
        removeTitle: t("profile.bild.entfernenTitel"),
        removeDescription: t("profile.bild.entfernenText"),
        confirmRemove: t("profile.bild.entfernenBestaetigen"),
        cancel: t("profile.bild.abbrechen"),
      },
      details: {
        title: t("profile.daten.title"),
        description: t("profile.daten.desc"),
        name: t("profile.daten.name"),
        email: t("profile.daten.email"),
        emailHint: t("profile.daten.emailHinweis"),
        emailLocked: t("profile.daten.emailGesperrt"),
        nameRequired: t("profile.daten.nameErforderlich"),
        emailRequired: t("profile.daten.emailErforderlich"),
        emailInvalid: t("profile.daten.emailUngueltig"),
        save: t("profile.daten.speichern"),
        saving: t("profile.daten.speichert"),
        saved: t("profile.daten.gespeichert"),
        failed: (error) => t("profile.daten.fehler", { error: error }),
      },
      password: {
        title: t("profile.passwort.title"),
        description: t("profile.passwort.desc"),
        current: t("profile.passwort.aktuell"),
        next: t("profile.passwort.neu"),
        repeat: t("profile.passwort.wiederholen"),
        show: t("profile.passwort.anzeigen"),
        hide: t("profile.passwort.verbergen"),
        tooShort: (minLength) => t("profile.passwort.zuKurz", { count: minLength }),
        doesNotMatch: t("profile.passwort.stimmtNicht"),
        sameAsCurrent: t("profile.passwort.wieBisher"),
        change: t("profile.passwort.aendern"),
        changing: t("profile.passwort.aendert"),
        changed: t("profile.passwort.geaendert"),
        failed: (error) => t("profile.passwort.fehler", { error: error }),
        locked: t("profile.passwort.gesperrt"),
      },
      access: {
        title: t("profile.zugriff.title"),
        description: t("profile.zugriff.desc"),
        roleLabel: t("profile.zugriff.rolle"),
        permissionsLabel: t("profile.zugriff.rechte"),
        permissionCount: (count) => String(count),
        readOnlyNote,
        categoryLabel: (categoryKey) =>
          t(`team.permissions.kategorie.${categoryKey}`, { defaultValue: categoryKey }),
        roleLabelText: (roleName) => t(`team.role.${roleName}`, { defaultValue: roleName }),
        empty: t("profile.zugriff.leer"),
      },
    }),
    [t, readOnlyNote],
  );
}
