export interface TeamPageLabels {
  title: string;
  subtitle: string;
  peopleTab: string;
  rolesTab: string;
  searchPlaceholder: string;
  inactiveOnly: string;
  empty: string;
  roleLabel: (roleName: string) => string;
  columns: {
    name: string;
    email: string;
    role: string;
    companies: string;
    permissions: string;
    active: string;
  };
  allCompanies: string;
  moreCompanies: (count: number) => string;
  permissionCount: (held: number, total: number) => string;
  active: string;
  inactive: string;
  neverSignedIn: string;
  categoryLabel: (categoryKey: string) => string;
  permissionsTitle: string;
  permissionColumnLabel: string;
  rolesMatrixNote: string;
  impliedBySuperAdmin: string;
  newEmployee: {
    button: string;
    title: string;
    name: string;
    email: string;
    role: string;
    companies: string;
    noCompaniesHint: string;
    someCompaniesHint: string;
    emailRequired: string;
    emailInvalid: string;
    emailTaken: string;
    nameRequired: string;
    create: string;
    creating: string;
    cancel: string;
    createFailed: (error: string) => string;
    rightsFailed: (error: string) => string;
  };
  edit: {
    open: string;
    title: string;
    emailChangeHint: string;
    editingMyselfNote: string;
    superAdminRoleHint: string;
    roleChangeWarning: (fromRole: string, toRole: string) => string;
    accessWidensWarning: string;
    stepProfile: string;
    stepRole: string;
    stepAccess: string;
    save: string;
    saving: string;
    cancel: string;
    saved: string;
    partlyFailed: (step: string, error: string) => string;
    failed: (error: string) => string;
    superAdminCannotBeDeactivated: string;
  };
  activeToggle: {
    deactivate: string;
    reactivate: string;
    deactivateTitle: string;
    reactivateTitle: string;
    deactivateDescription: (email: string) => string;
    reactivateDescription: (email: string) => string;
    confirmDeactivate: string;
    confirmReactivate: string;
    cancel: string;
    deactivated: string;
    reactivated: string;
    failed: (error: string) => string;
  };
  resetPassword: {
    open: string;
    title: string;
    description: (email: string) => string;
    confirm: string;
    cancel: string;
    failed: (error: string) => string;
    resultTitle: string;
    resultDescription: (email: string) => string;
  };
  tempPassword: {
    title: string;
    description: (email: string) => string;
    copy: string;
    copyFailed: string;
    close: string;
  };
}

export const englishTeamPageLabels: TeamPageLabels = {
  title: "Team & roles",
  subtitle: "Manage employees, roles, and company access.",
  peopleTab: "People",
  rolesTab: "Roles & permissions",
  searchPlaceholder: "Search name, email or role …",
  inactiveOnly: "Inactive only",
  empty: "No employees found.",
  roleLabel: (roleName) => roleName,
  columns: {
    name: "Name",
    email: "Email",
    role: "Role",
    companies: "Companies",
    permissions: "Permissions",
    active: "Active",
  },
  allCompanies: "All",
  moreCompanies: (count) => `+${count} more`,
  permissionCount: (held, total) => `${held} of ${total}`,
  active: "Active",
  inactive: "Inactive",
  neverSignedIn: "never signed in",
  categoryLabel: (categoryKey) => categoryKey,
  permissionsTitle: "Permissions",
  permissionColumnLabel: "Permission",
  rolesMatrixNote:
    "A change here moves every person holding that role, unless they have a personal exception.",
  impliedBySuperAdmin: "The owner account always holds every permission.",
  newEmployee: {
    button: "New employee",
    title: "New employee",
    name: "Name",
    email: "Email",
    role: "Role",
    companies: "Companies",
    noCompaniesHint: "No company selected means access to every company.",
    someCompaniesHint: "The person only sees the selected companies.",
    emailRequired: "An email address is required.",
    emailInvalid: "This email address does not look valid.",
    emailTaken: "This email address is already in use.",
    nameRequired: "A name is required.",
    create: "Create",
    creating: "Creating …",
    cancel: "Cancel",
    createFailed: (error) => `Creating the employee failed: ${error}`,
    rightsFailed: (error) =>
      `The account was created, but saving its permission exceptions failed: ${error}`,
  },
  edit: {
    open: "Edit",
    title: "Edit employee",
    emailChangeHint: "Changing the email also changes the login.",
    editingMyselfNote: "You are editing your own account. Your role stays locked here.",
    superAdminRoleHint: "The owner account keeps its role and full access.",
    roleChangeWarning: (fromRole, toRole) =>
      `This changes the role from ${fromRole} to ${toRole} and with it what this person may do.`,
    accessWidensWarning: "Removing the last company gives access to every company, not to none.",
    stepProfile: "profile",
    stepRole: "role",
    stepAccess: "company access",
    save: "Save",
    saving: "Saving …",
    cancel: "Cancel",
    saved: "Saved.",
    partlyFailed: (step, error) => `Saving stopped at the ${step} step: ${error}`,
    failed: (error) => `Saving failed: ${error}`,
    superAdminCannotBeDeactivated: "The owner account cannot be deactivated.",
  },
  activeToggle: {
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    deactivateTitle: "Deactivate this account?",
    reactivateTitle: "Reactivate this account?",
    deactivateDescription: (email) => `${email} will no longer be able to sign in.`,
    reactivateDescription: (email) => `${email} will be able to sign in again.`,
    confirmDeactivate: "Deactivate",
    confirmReactivate: "Reactivate",
    cancel: "Cancel",
    deactivated: "Account deactivated.",
    reactivated: "Account reactivated.",
    failed: (error) => `Changing the account failed: ${error}`,
  },
  resetPassword: {
    open: "Reset password",
    title: "Reset the password?",
    description: (email) => `${email} gets a new temporary password and must change it at sign-in.`,
    confirm: "Reset",
    cancel: "Cancel",
    failed: (error) => `Resetting the password failed: ${error}`,
    resultTitle: "New temporary password",
    resultDescription: (email) => `Hand this password to ${email}. It is shown only once.`,
  },
  tempPassword: {
    title: "Temporary password",
    description: (email) => `Hand this password to ${email}. It is shown only once.`,
    copy: "Copy password",
    copyFailed: "Copying failed. Please select and copy the password by hand.",
    close: "Close",
  },
};
