import { permissions as allPermissionKeys } from "./permissions";

export const ROLE_IDS = {
  super_admin: "15000000-0000-4000-8000-000000000001",
  admin: "15000000-0000-4000-8000-000000000002",
  supervisor: "15000000-0000-4000-8000-000000000003",
  assistant: "15000000-0000-4000-8000-000000000004",
} as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  supervisor: "Supervisor",
  assistant: "Assistant",
};

export const roles = Object.entries(ROLE_IDS).map(([name, id]) => ({
  id,
  name,
  label: ROLE_LABELS[name],
  assignable: name !== "super_admin",
}));

function categoryFor(key: string): string {
  return key.split(".")[0];
}

function labelFor(key: string): string {
  const [, ...rest] = key.split(".");
  return (rest.join(" ") || key).replace(/_/g, " ");
}

/** One row per key in the real permission list, category/label derived rather than hand-spelled. */
export const permissionCatalogue = allPermissionKeys.map((key, i) => ({
  key,
  category: categoryFor(key),
  label_de: labelFor(key),
  label_en: labelFor(key),
  description_de: null,
  description_en: null,
  sort_order: i,
}));

/** Admin holds everything; supervisor minus the admin module; assistant read-only plus booking. */
export const rolePermissions = [
  ...allPermissionKeys.map((key) => ({ role_id: ROLE_IDS.admin, permission_key: key })),
  ...allPermissionKeys
    .filter((key) => !key.startsWith("module.admin") && !key.startsWith("page.team"))
    .map((key) => ({ role_id: ROLE_IDS.supervisor, permission_key: key })),
  ...allPermissionKeys
    .filter(
      (key) =>
        key.startsWith("page.") ||
        key.startsWith("module.") ||
        key === "documents.read" ||
        key === "documents.write" ||
        key === "master_data.read",
    )
    .filter((key) => !key.startsWith("module.admin") && !key.startsWith("page.team"))
    .map((key) => ({ role_id: ROLE_IDS.assistant, permission_key: key })),
];
