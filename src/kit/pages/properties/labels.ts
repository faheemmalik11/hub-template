import type { PropertyVatStatus } from "../../adapters/properties";

export interface PropertiesLabels {
  vatStatus: Record<PropertyVatStatus, string>;
  noneOption: string;
  requiredFieldTitle: string;
  invoiceStatusLabel: (status: string) => string;
  sort: {
    label: string;
    ascending: string;
    descending: string;
  };
  moreRows: (count: number) => string;
  companyChip: {
    missing: string;
    missingTitle: string;
  };
  vatBadge: {
    abbreviation: string;
    relevantTitle: string;
    exempt: string;
    exemptTitle: string;
    unclear: string;
    unclearTitle: string;
    mixed: string;
    mixedTitle: (rates: string) => string;
  };
  companyAssignment: {
    label: string;
    placeholder: string;
    required: string;
  };
  nameVariants: {
    title: string;
    count: (count: number) => string;
    hint: string;
    placeholder: string;
    add: string;
    remove: string;
    empty: string;
    confirmTitle: string;
    confirmDescription: (variant: string) => string;
    confirmCancel: string;
    confirmRemove: string;
    added: (variant: string) => string;
    removed: (variant: string) => string;
    alreadyExists: string;
    claimedByOther: (variant: string) => string;
    failed: (error: string) => string;
  };
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    columns: {
      property: string;
      company: string;
      booked: string;
      createdAt: string;
      updatedAt: string;
    };
    invoiceCount: (count: number) => string;
    empty: string;
    create: {
      button: string;
      title: string;
      description: string;
      codeLabel: string;
      codePlaceholder: string;
      nameLabel: string;
      namePlaceholder: string;
      addressLabel: string;
      addressPlaceholder: string;
      vatStatusLabel: string;
      cancel: string;
      submit: string;
      submitting: string;
      codeRequired: string;
      codeTooLong: string;
      codeTaken: string;
      created: string;
      createdWithoutCompany: (code: string, error: string) => string;
      createFailed: (error: string) => string;
    };
  };
  detail: {
    back: string;
    editTitle: string;
    editDescription: string;
    notInMasterDataBefore: string;
    notInMasterDataAfter: string;
    createNow: string;
    masterDataSection: string;
    bookedSection: string;
    fields: {
      code: string;
      name: string;
      address: string;
      company: string;
      vatStatus: string;
    };
    invoiceCount: (count: number) => string;
    noInvoices: string;
    columns: {
      supplier: string;
      company: string;
      date: string;
      vat: string;
      amount: string;
      status: string;
    };
    withoutNumber: string;
    edit: string;
    cancel: string;
    save: string;
    saving: string;
    companyMismatchWarning: (count: number, assignedCodes: string) => string;
    companyMismatchRow: string;
    noChanges: string;
    saved: string;
    partiallySaved: (error: string) => string;
    saveFailed: (error: string) => string;
  };
}

export const englishPropertiesLabels: PropertiesLabels = {
  vatStatus: {
    taxable: "Taxable",
    taxExempt: "Tax-exempt",
    mixed: "Mixed",
  },
  noneOption: "None",
  requiredFieldTitle: "Required field",
  invoiceStatusLabel: (status) => status,
  sort: {
    label: "Sort by",
    ascending: "Ascending",
    descending: "Descending",
  },
  moreRows: (count) => `… ${count} more ${count === 1 ? "entry" : "entries"}`,
  companyChip: {
    missing: "No company",
    missingTitle: "not assigned to a company",
  },
  vatBadge: {
    abbreviation: "VAT",
    relevantTitle: "VAT relevant (input tax)",
    exempt: "VAT exempt",
    exemptTitle:
      "The document states 0 % VAT, for example an exempt supply or a small-business supplier.",
    unclear: "VAT unclear",
    unclearTitle: "No VAT rate was recognized on this document.",
    mixed: "VAT mixed",
    mixedTitle: (rates) =>
      `This document has more than one VAT rate (${rates} %). The split is shown in the detail view.`,
  },
  companyAssignment: {
    label: "Company/companies",
    placeholder: "Select company/companies",
    required: "At least one company is required.",
  },
  nameVariants: {
    title: "Name variants",
    count: (count) => `${count} ${count === 1 ? "variant" : "variants"}`,
    hint: "Name variants this property appears under on documents. The pipeline uses them to assign documents automatically.",
    placeholder: "New variant …",
    add: "Add",
    remove: "Remove",
    empty: "No name variants on file.",
    confirmTitle: "Remove variant?",
    confirmDescription: (variant) =>
      `“${variant}” will no longer be listed as a name variant. It can be added again at any time.`,
    confirmCancel: "Cancel",
    confirmRemove: "Remove",
    added: (variant) => `Variant “${variant}” added.`,
    removed: (variant) => `Variant “${variant}” removed.`,
    alreadyExists: "That variant is already on file.",
    claimedByOther: (variant) =>
      `“${variant}” already belongs to another entity. A variant can name only one, so remove it there first.`,
    failed: (error) => `Could not save: ${error}`,
  },
  list: {
    title: "Properties",
    subtitle: "Property master data: real estate/projects invoices are assigned to.",
    searchPlaceholder: "Search property …",
    columns: {
      property: "Property (code / address)",
      company: "Company",
      booked: "Booked",
      createdAt: "Created",
      updatedAt: "Updated",
    },
    invoiceCount: (count) => `${count} ${count === 1 ? "invoice" : "invoices"}`,
    empty: "No properties in the master data.",
    create: {
      button: "New",
      title: "New property",
      description: "Create property master data. The code must be unique.",
      codeLabel: "Code",
      codePlaceholder: "e.g. WIBO7",
      nameLabel: "Name",
      namePlaceholder: "Label",
      addressLabel: "Address",
      addressPlaceholder: "Street, city",
      vatStatusLabel: "VAT status",
      cancel: "Cancel",
      submit: "Create",
      submitting: "Creating …",
      codeRequired: "Please enter a code, e.g. MA-OMS.",
      codeTooLong: "The code may be at most 32 characters long.",
      codeTaken: "This code is already taken.",
      created: "Property created.",
      createdWithoutCompany: (code, error) =>
        `Property ${code} created, but the company/companies could not be saved: ${error}. Please add it on the property page.`,
      createFailed: (error) => `Creation failed: ${error}`,
    },
  },
  detail: {
    back: "Properties",
    editTitle: "Edit property",
    editDescription: "Edit property master data.",
    notInMasterDataBefore: "This property (",
    notInMasterDataAfter:
      ') is not in the property master data. The code comes from AI extraction. Create it under "Properties" to permanently assign invoices to it.',
    createNow: "Create now",
    masterDataSection: "Master data",
    bookedSection: "Booked to this property",
    fields: {
      code: "Code",
      name: "Name",
      address: "Address",
      company: "Company",
      vatStatus: "VAT status",
    },
    invoiceCount: (count) => `${count} ${count === 1 ? "invoice" : "invoices"}`,
    noInvoices: "No invoices are booked to this property.",
    columns: {
      supplier: "Supplier / no.",
      company: "Co.",
      date: "Date",
      vat: "VAT",
      amount: "Amount",
      status: "Status",
    },
    withoutNumber: "no number",
    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving …",
    companyMismatchWarning: (count, assignedCodes) =>
      count === 1
        ? `1 invoice is booked to a company this property is not assigned to (assigned: ${assignedCodes}).`
        : `${count} invoices are booked to companies this property is not assigned to (assigned: ${assignedCodes}).`,
    companyMismatchRow: "Company differs from this property's assignment.",
    noChanges: "No changes.",
    saved: "Saved.",
    partiallySaved: (error) =>
      `Master data saved, but the company/companies could not be updated: ${error}`,
    saveFailed: (error) => `Saving failed: ${error}`,
  },
};
