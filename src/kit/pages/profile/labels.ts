export interface ProfileLabels {
  title: string;
  subtitle: string;
  picture: {
    title: string;
    description: string;
    choose: string;
    replace: string;
    remove: string;
    uploading: string;
    hint: (maxSize: string) => string;
    wrongType: string;
    tooBig: (maxSize: string) => string;
    saved: string;
    removed: string;
    failed: (error: string) => string;
    removeTitle: string;
    removeDescription: string;
    confirmRemove: string;
    cancel: string;
  };
  details: {
    title: string;
    description: string;
    name: string;
    email: string;
    emailHint: string;
    emailLocked: string;
    nameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    save: string;
    saving: string;
    saved: string;
    failed: (error: string) => string;
  };
  password: {
    title: string;
    description: string;
    current: string;
    next: string;
    repeat: string;
    show: string;
    hide: string;
    tooShort: (minLength: number) => string;
    doesNotMatch: string;
    sameAsCurrent: string;
    change: string;
    changing: string;
    changed: string;
    failed: (error: string) => string;
    locked: string;
  };
  access: {
    title: string;
    description: string;
    roleLabel: string;
    permissionsLabel: string;
    /** Sits next to the "Permissions" heading, so the bare number reads as a count. */
    permissionCount: (count: number) => string;
    /** Says where a change is made, which differs per viewer: an owner holds everything anyway, an
     *  administrator changes it themselves, everybody else has to ask one. */
    readOnlyNote: string;
    categoryLabel: (categoryKey: string) => string;
    roleLabelText: (roleName: string) => string;
    empty: string;
  };
}

export const englishProfileLabels: ProfileLabels = {
  title: "My profile",
  subtitle: "Your name, your sign-in details and what your account may do.",
  picture: {
    title: "Profile picture",
    description: "Shown next to your name across the app.",
    choose: "Upload a picture",
    replace: "Replace picture",
    remove: "Remove",
    uploading: "Uploading …",
    hint: (maxSize) => `A square image works best. At most ${maxSize}.`,
    wrongType: "That file is not an image we can use.",
    tooBig: (maxSize) => `That picture is larger than ${maxSize}.`,
    saved: "Profile picture updated.",
    removed: "Profile picture removed.",
    failed: (error) => `Saving the picture failed: ${error}`,
    removeTitle: "Remove your profile picture?",
    removeDescription: "Your initials are shown instead. You can upload a new picture any time.",
    confirmRemove: "Remove",
    cancel: "Cancel",
  },
  details: {
    title: "Name and email",
    description: "How you appear to your colleagues and how you sign in.",
    name: "Name",
    email: "Email",
    emailHint: "Changing the email also changes the address you sign in with.",
    emailLocked: "Your email is managed outside this app and cannot be changed here.",
    nameRequired: "A name is required.",
    emailRequired: "An email address is required.",
    emailInvalid: "This email address does not look valid.",
    save: "Save",
    saving: "Saving …",
    saved: "Saved.",
    failed: (error) => `Saving failed: ${error}`,
  },
  password: {
    title: "Password",
    description: "Choose a password you do not use anywhere else.",
    current: "Current password",
    next: "New password",
    repeat: "Repeat the new password",
    show: "Show passwords",
    hide: "Hide passwords",
    tooShort: (minLength) => `The new password needs at least ${minLength} characters.`,
    doesNotMatch: "The two new passwords are not the same.",
    sameAsCurrent: "The new password is the same as the current one.",
    change: "Change password",
    changing: "Changing …",
    changed: "Password changed.",
    failed: (error) => `Changing the password failed: ${error}`,
    locked: "Your password is managed outside this app and cannot be changed here.",
  },
  access: {
    title: "Role and permissions",
    description: "What your account may do.",
    roleLabel: "Role",
    permissionsLabel: "Permissions",
    permissionCount: (count) => String(count),
    readOnlyNote: "This list shows what you hold. It is not changed on this screen.",
    categoryLabel: (categoryKey) => categoryKey,
    roleLabelText: (roleName) => roleName,
    empty: "No permissions are set for your account.",
  },
};
