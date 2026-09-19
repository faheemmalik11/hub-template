import { useCallback, useMemo } from "react";
import { BUCKET } from "@/config/buckets";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { AccessPermission } from "@/kit/components/access";
import type { ProfileAdapter, ProfileUser } from "@/kit/adapters";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissionCatalogue, type PermissionRow } from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PICTURE_BUCKET = BUCKET.profilePictures;
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
// The same floor completePasswordChange enforces, so the form never offers a password it rejects.
const MIN_PASSWORD_LENGTH = 8;

interface MyProfileRow {
  id: string;
  name: string | null;
  email: string;
  picture_url: string | null;
}

/** "https://…/object/public/profile-pictures/<uid>/x.png" -> "<uid>/x.png", or null. */
function picturePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${PICTURE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  return url.slice(at + marker.length);
}

/**
 * Mein Profil, backed by the three self-service RPCs from migration 20260911160000.
 *
 * The name and the picture go through those RPCs because app_users itself is admin-write only.
 * The email is deliberately not writable here: an administrator changes it on Team & Rollen, so
 * `updateEmail` is left out and the kit page shows the field locked.
 */
export function useProfileAdapter(): ProfileAdapter {
  const { t, i18n } = useTranslation();
  const german = i18n.language.startsWith("de");
  const { user, role, permissions, refreshProfile, completePasswordChange } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.email ?? ""],
    enabled: !!user?.email,
    queryFn: async (): Promise<MyProfileRow> => {
      const { data, error } = await sb.rpc("my_profile");
      if (error) throw error;
      const row = (data as MyProfileRow[] | null)?.[0];
      if (!row) throw new Error(t("profil.fehler.keinKonto"));
      return row;
    },
  });

  const catalogueQuery = usePermissionCatalogue();

  const catalogue = useMemo<AccessPermission[]>(
    () =>
      (catalogueQuery.data ?? []).map((permission: PermissionRow) => ({
        key: permission.key,
        category: permission.category,
        label: t(`permissions.${permission.key}.label`, {
          defaultValue: (german ? permission.label_de : permission.label_en) ?? permission.key,
        }),
        description: t(`permissions.${permission.key}.desc`, {
          defaultValue:
            (german ? permission.description_de : permission.description_en) ??
            permission.description_de ??
            "",
        }),
      })),
    [catalogueQuery.data, german, t],
  );

  const profile = useMemo<ProfileUser | undefined>(() => {
    const row = profileQuery.data;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      roleName: role ?? "",
      permissions,
      pictureUrl: row.picture_url,
    };
  }, [profileQuery.data, role, permissions]);

  // Both the page and the header read the name and the picture, and the header takes them from the
  // auth context rather than from this query.
  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    await refreshProfile();
  }, [queryClient, refreshProfile]);

  const removeStoredPicture = useCallback(async (url: string | null) => {
    const path = picturePathFromUrl(url);
    if (!path) return;
    await supabase.storage.from(PICTURE_BUCKET).remove([path]);
  }, []);

  return {
    useProfile: () => ({
      data: profile,
      isLoading: profileQuery.isLoading,
      isError: profileQuery.isError,
      error: profileQuery.error,
      isRefreshing: profileQuery.isRefetching,
      refetch: () => void profileQuery.refetch(),
    }),
    usePermissionCatalogue: () => ({
      data: catalogueQuery.data ? catalogue : undefined,
      isLoading: catalogueQuery.isLoading,
      isError: catalogueQuery.isError,
      error: catalogueQuery.error,
      isRefreshing: catalogueQuery.isRefetching,
      refetch: () => void catalogueQuery.refetch(),
    }),

    updateName: async ({ name }) => {
      const { error } = await sb.rpc("set_my_name", { p_name: name });
      if (error) throw error;
      await reload();
    },

    changePassword: async ({ currentPassword, newPassword }) => {
      const email = user?.email;
      if (!email) throw new Error(t("profil.fehler.keinKonto"));
      // Supabase sets a new password without asking for the old one. Signing in with the current
      // password first is what makes "current password" mean something: a stolen open session
      // cannot change the password without knowing it.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) throw new Error(t("profil.fehler.passwortFalsch"));

      const result = await completePasswordChange(newPassword);
      if (!result.ok) throw new Error(result.raw ?? t("profil.fehler.passwortAenderung"));
    },

    uploadPicture: async ({ file }) => {
      const { data: authUser } = await supabase.auth.getUser();
      const authUserId = authUser.user?.id;
      if (!authUserId) throw new Error(t("profil.fehler.keinKonto"));

      // The folder is the caller's own auth id, which is what the storage policy checks.
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${authUserId}/profil-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(PICTURE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const url = supabase.storage.from(PICTURE_BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await sb.rpc("set_my_picture_url", { p_url: url });
      if (error) throw error;

      // Only once the row points at the new file, so a failed write never leaves the person
      // without a picture at all.
      await removeStoredPicture(profileQuery.data?.picture_url ?? null);
      await reload();
      return url;
    },

    removePicture: async () => {
      const previous = profileQuery.data?.picture_url ?? null;
      const { error } = await sb.rpc("set_my_picture_url", { p_url: null });
      if (error) throw error;
      await removeStoredPicture(previous);
      await reload();
    },

    passwordMinLength: MIN_PASSWORD_LENGTH,
    maxPictureSizeBytes: MAX_PICTURE_BYTES,
    acceptedPictureTypes: PICTURE_TYPES,
  };
}
