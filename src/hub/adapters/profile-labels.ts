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
  let readOnlyNote = t("profile.access.readOnly");
  if (role === "super_admin") readOnlyNote = t("profile.access.readOnlyOwner");
  else if (can(PERMISSIONS.pageTeam)) readOnlyNote = t("profile.access.readOnlyAdmin");

  return useMemo<ProfileLabels>(
    () => ({
      title: t("profile.title"),
      subtitle: t("profile.subtitle"),
      picture: {
        title: t("profile.picture.title"),
        description: t("profile.picture.desc"),
        choose: t("profile.picture.choose"),
        replace: t("profile.picture.replace"),
        remove: t("profile.picture.remove"),
        uploading: t("profile.picture.uploading"),
        hint: (maxSize) => t("profile.picture.hint", { size: maxSize }),
        wrongType: t("profile.picture.wrongType"),
        tooBig: (maxSize) => t("profile.picture.tooLarge", { size: maxSize }),
        saved: t("profile.picture.saved"),
        removed: t("profile.picture.removed"),
        failed: (error) => t("profile.picture.error", { error: error }),
        removeTitle: t("profile.picture.removeTitle"),
        removeDescription: t("profile.picture.removeText"),
        confirmRemove: t("profile.picture.removeConfirm"),
        cancel: t("profile.picture.cancel"),
      },
      details: {
        title: t("profile.details.title"),
        description: t("profile.details.desc"),
        name: t("profile.details.name"),
        email: t("profile.details.email"),
        emailHint: t("profile.details.emailHint"),
        emailLocked: t("profile.details.emailLocked"),
        nameRequired: t("profile.details.nameRequired"),
        emailRequired: t("profile.details.emailRequired"),
        emailInvalid: t("profile.details.emailInvalid"),
        save: t("profile.details.save"),
        saving: t("profile.details.saving"),
        saved: t("profile.details.saved"),
        failed: (error) => t("profile.details.error", { error: error }),
      },
      password: {
        title: t("profile.password.title"),
        description: t("profile.password.desc"),
        current: t("profile.password.current"),
        next: t("profile.password.new"),
        repeat: t("profile.password.repeat"),
        show: t("profile.password.show"),
        hide: t("profile.password.hide"),
        tooShort: (minLength) => t("profile.password.tooShort", { count: minLength }),
        doesNotMatch: t("profile.password.mismatch"),
        sameAsCurrent: t("profile.password.sameAsCurrent"),
        change: t("profile.password.change"),
        changing: t("profile.password.changing"),
        changed: t("profile.password.changed"),
        failed: (error) => t("profile.password.error", { error: error }),
        locked: t("profile.password.locked"),
      },
      access: {
        title: t("profile.access.title"),
        description: t("profile.access.desc"),
        roleLabel: t("profile.access.role"),
        permissionsLabel: t("profile.access.permissions"),
        permissionCount: (count) => String(count),
        readOnlyNote,
        categoryLabel: (categoryKey) =>
          t(`team.permissions.category.${categoryKey}`, { defaultValue: categoryKey }),
        roleLabelText: (roleName) => t(`team.role.${roleName}`, { defaultValue: roleName }),
        empty: t("profile.access.empty"),
      },
    }),
    [t, readOnlyNote],
  );
}
