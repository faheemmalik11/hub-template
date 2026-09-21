import { useAuth } from "@/lib/auth";

/**
 * Whether this client uses a feature and this person may use it.
 *
 * One question, answered by `current_permissions()` in the database, which resolves both: the
 * client's switch and the person's rights. A screen asks it before rendering; a query asks it
 * before firing.
 */
export function useFeature(capability: string): boolean {
  const { can } = useAuth();
  return can(capability);
}

/**
 * What a React Query `enabled` should be for a query belonging to a feature.
 *
 * A switched-off module must fire no requests at all. Without this the screen is hidden while its
 * queries still run, and the answers come back empty from row level security: safe, but wasted,
 * and an empty result reads the same as "nothing here yet".
 *
 *   const enabled = useFeatureGate(PERMISSIONS.bankRead, Boolean(accountId));
 *   useQuery({ queryKey: …, queryFn: …, enabled });
 */
export function useFeatureGate(capability: string, ...alsoRequired: unknown[]): boolean {
  const allowed = useFeature(capability);
  return allowed && alsoRequired.every(Boolean);
}
