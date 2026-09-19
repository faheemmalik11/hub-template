export interface CompaniesLabels {
  requiredFieldTitle: string;
  sortLabel: string;
  sortAscending: string;
  sortDescending: string;
  validation: {
    codeRequired: string;
    codeTooLong: string;
    codeInvalidCharacters: string;
    nameRequired: string;
  };
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    showArchived: string;
    archivedBadge: string;
    columnCode: string;
    columnName: string;
    columnBookedTotal: string;
    columnCreatedAt: string;
    columnUpdatedAt: string;
    invoiceCount: (count: number) => string;
    empty: string;
    newCompanyButton: string;
    newCompanyTitle: string;
    newCompanyDescription: string;
    codeFieldLabel: string;
    codeFieldPlaceholder: string;
    nameFieldLabel: string;
    nameFieldPlaceholder: string;
    cancel: string;
    create: string;
    creating: string;
    createdToast: string;
    createFailedToast: (error: string) => string;
  };
  detail: {
    backToList: string;
    notFoundTitle: string;
    goToList: string;
    edit: string;
    restore: string;
    archive: string;
    archiveDialogTitle: string;
    archiveDialogDescription: string;
    archiveDialogInvoiceNote: (count: number) => string;
    archiveReasonPlaceholder: string;
    archiveCancel: string;
    archiveConfirm: string;
    archivedToast: string;
    archiveFailedToast: (error: string) => string;
    restoredToast: string;
    restoreFailedToast: (error: string) => string;
    archivedBanner: (date: string, reason: string) => string;
    archivedWithoutReason: string;
    masterDataSection: string;
    bookedSection: string;
    codeField: string;
    nameField: string;
    areaField: string;
    areaNone: string;
    areaLabel: (area: string) => string;
    propertiesHeading: string;
    invoiceTotalCaption: (count: number) => string;
    foreignPropertiesWarning: (count: number, totalAmount: string) => string;
    foreignPropertyHint: (propertyCode: string, companyCodes: string) => string;
    columnInvoice: string;
    columnProperty: string;
    columnDate: string;
    columnAmount: string;
    columnStatus: string;
    withoutInvoiceNumber: string;
    invoicesEmpty: string;
    loadMoreRemaining: (count: number) => string;
    invoiceStatusLabel: (status: string) => string;
    editDialogTitle: string;
    editDialogDescription: string;
    cancel: string;
    save: string;
    saving: string;
    savedToast: string;
    noChangesToast: string;
    saveFailedToast: (error: string) => string;
  };
  aliases: {
    title: string;
    count: (count: number) => string;
    hint: string;
    placeholder: string;
    add: string;
    addedToast: (alias: string) => string;
    alreadyExistsToast: string;
    claimedByOtherToast: (alias: string) => string;
    addFailedToast: (error: string) => string;
    removedToast: (alias: string) => string;
    remove: string;
    confirmTitle: string;
    confirmDescription: (alias: string) => string;
    confirmCancel: string;
    confirmRemove: string;
    empty: string;
  };
}

export const englishCompaniesLabels: CompaniesLabels = {
  requiredFieldTitle: "Required field",
  sortLabel: "Sort by",
  sortAscending: "Ascending",
  sortDescending: "Descending",
  validation: {
    codeRequired: "Please enter a code.",
    codeTooLong: "The code may be at most 16 characters long.",
    codeInvalidCharacters: "The code may only contain letters and digits.",
    nameRequired: "Please enter a name.",
  },
  list: {
    title: "Companies",
    subtitle: "All companies invoices are booked against.",
    searchPlaceholder: "Search code or name …",
    showArchived: "Show archived",
    archivedBadge: "Archived",
    columnCode: "Code",
    columnName: "Name",
    columnBookedTotal: "Booked",
    columnCreatedAt: "Created",
    columnUpdatedAt: "Updated",
    invoiceCount: (count) => `${count} ${count === 1 ? "invoice" : "invoices"}`,
    empty: "No companies found.",
    newCompanyButton: "New company",
    newCompanyTitle: "Create company",
    newCompanyDescription: "Code and name of the new company.",
    codeFieldLabel: "Code",
    codeFieldPlaceholder: "e.g. ACME",
    nameFieldLabel: "Name",
    nameFieldPlaceholder: "e.g. Acme GmbH",
    cancel: "Cancel",
    create: "Create",
    creating: "Creating …",
    createdToast: "Company created.",
    createFailedToast: (error) => `Creating the company failed: ${error}`,
  },
  detail: {
    backToList: "Back to companies",
    notFoundTitle: "Company not found.",
    goToList: "Go to the company list",
    edit: "Edit",
    restore: "Restore",
    archive: "Archive",
    archiveDialogTitle: "Archive this company?",
    archiveDialogDescription:
      "The company is hidden from the list but nothing is deleted. It can be restored at any time.",
    archiveDialogInvoiceNote: (count) =>
      `${count} ${count === 1 ? "invoice is" : "invoices are"} booked against it.`,
    archiveReasonPlaceholder: "Reason for archiving …",
    archiveCancel: "Cancel",
    archiveConfirm: "Archive",
    archivedToast: "Company archived.",
    archiveFailedToast: (error) => `Archiving failed: ${error}`,
    restoredToast: "Company restored.",
    restoreFailedToast: (error) => `Restoring failed: ${error}`,
    archivedBanner: (date, reason) => `Archived on ${date} — ${reason}`,
    archivedWithoutReason: "no reason given",
    masterDataSection: "Master data",
    bookedSection: "Booked invoices",
    codeField: "Code",
    nameField: "Name",
    areaField: "Area of responsibility",
    areaNone: "None",
    areaLabel: (area) => area,
    propertiesHeading: "Properties",
    invoiceTotalCaption: (count) => `Total (${count} ${count === 1 ? "invoice" : "invoices"})`,
    foreignPropertiesWarning: (count, totalAmount) =>
      `${count} ${count === 1 ? "invoice is" : "invoices are"} booked against properties that belong to a different company (${totalAmount}).`,
    foreignPropertyHint: (propertyCode, companyCodes) =>
      `Property ${propertyCode} belongs to: ${companyCodes}`,
    columnInvoice: "Invoice",
    columnProperty: "Property",
    columnDate: "Date",
    columnAmount: "Amount",
    columnStatus: "Status",
    withoutInvoiceNumber: "No number",
    invoicesEmpty: "No invoices yet.",
    loadMoreRemaining: (count) => `${count} more — keep scrolling to load`,
    invoiceStatusLabel: (status) => status,
    editDialogTitle: "Edit company",
    editDialogDescription: "Change the code, name or area of this company.",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving …",
    savedToast: "Changes saved.",
    noChangesToast: "Nothing was changed.",
    saveFailedToast: (error) => `Saving failed: ${error}`,
  },
  aliases: {
    title: "Known spellings",
    count: (count) => `${count} ${count === 1 ? "entry" : "entries"}`,
    hint: "Names on documents that should be recognized as this company.",
    placeholder: "Add a spelling …",
    add: "Add",
    addedToast: (alias) => `"${alias}" added.`,
    alreadyExistsToast: "This spelling already exists.",
    claimedByOtherToast: (alias) => `"${alias}" is already used by another entry.`,
    addFailedToast: (error) => `Adding the spelling failed: ${error}`,
    removedToast: (alias) => `"${alias}" removed.`,
    remove: "Remove spelling",
    confirmTitle: "Remove this spelling?",
    confirmDescription: (alias) => `"${alias}" will no longer be matched to this company.`,
    confirmCancel: "Cancel",
    confirmRemove: "Remove",
    empty: "No spellings recorded yet.",
  },
};
