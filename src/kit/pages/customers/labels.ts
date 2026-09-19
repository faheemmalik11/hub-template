export interface CustomersLabels {
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    empty: string;
    columns: {
      name: string;
      company: string;
      email: string;
      invoices: string;
      amount: string;
      overdue: string;
    };
  };
  sort: {
    label: string;
    ascending: string;
    descending: string;
  };
  fields: {
    name: string;
    company: string;
    contactPerson: string;
    customerNumber: string;
    address: string;
    street: string;
    zip: string;
    city: string;
    vatId: string;
    phone: string;
    email: string;
  };
  examples: {
    name: string;
    street: string;
    zip: string;
    city: string;
    email: string;
  };
  validation: {
    company: string;
    name: string;
    zip: string;
    email: string;
  };
  requiredField: string;
  copy: {
    action: (fieldLabel: string) => string;
    copied: (fieldLabel: string) => string;
    failed: string;
  };
  companyChip: {
    missing: string;
    missingTitle: string;
  };
  newCustomer: {
    button: string;
    title: string;
    description: string;
    companyPlaceholder: string;
    isCompany: string;
    cancel: string;
    create: string;
    creating: string;
    formIncomplete: string;
    created: string;
    createFailed: (error: string) => string;
  };
  detail: {
    back: string;
    notFoundTitle: string;
    toList: string;
    editButton: string;
    deleteButton: string;
    masterDataSection: string;
    masterDataHint: string;
    invoicesSection: string;
    invoiceTotal: (count: number) => string;
    notCounted: (count: number) => string;
    invoicesEmpty: string;
    draftNumber: string;
    invoiceColumns: {
      number: string;
      date: string;
      amount: string;
      status: string;
    };
    invoiceStatus: {
      draft: string;
      open: string;
      overdue: string;
      paid: string;
      voided: string;
    };
    deleteDialog: {
      title: string;
      description: string;
      reasonPlaceholder: string;
      cancel: string;
      confirm: string;
      deleted: string;
      failed: (error: string) => string;
    };
    editDialog: {
      title: string;
      description: string;
      cancel: string;
      save: string;
      saving: string;
      saved: string;
      failed: (error: string) => string;
    };
  };
}

export const englishCustomersLabels: CustomersLabels = {
  list: {
    title: "Customers",
    subtitle: "Customer master data and their outgoing invoices.",
    searchPlaceholder: "Search name, email or company …",
    empty: "No customers found.",
    columns: {
      name: "Name",
      company: "Company",
      email: "Email",
      invoices: "Invoices",
      amount: "Amount",
      overdue: "Overdue",
    },
  },
  sort: {
    label: "Sort by",
    ascending: "Ascending",
    descending: "Descending",
  },
  fields: {
    name: "Name",
    company: "Company",
    contactPerson: "Contact person",
    customerNumber: "Customer number",
    address: "Address",
    street: "Street",
    zip: "Postal code",
    city: "City",
    vatId: "VAT ID",
    phone: "Phone",
    email: "Email",
  },
  examples: {
    name: "e.g. Acme Ltd",
    street: "e.g. Main Street 12",
    zip: "e.g. 10115",
    city: "e.g. Berlin",
    email: "e.g. billing@acme.com",
  },
  validation: {
    company: "Please choose a company.",
    name: "Please enter a name.",
    zip: "Please enter a valid postal code.",
    email: "Please enter a valid email address.",
  },
  requiredField: "Required field",
  copy: {
    action: (fieldLabel) => `Copy ${fieldLabel}`,
    copied: (fieldLabel) => `${fieldLabel} copied.`,
    failed: "Copying failed.",
  },
  companyChip: {
    missing: "No company",
    missingTitle: "No company is assigned yet.",
  },
  newCustomer: {
    button: "New customer",
    title: "Create customer",
    description: "Create a new customer record.",
    companyPlaceholder: "Choose a company …",
    isCompany: "This customer is a company",
    cancel: "Cancel",
    create: "Create",
    creating: "Creating …",
    formIncomplete: "Please complete the highlighted fields.",
    created: "Customer created.",
    createFailed: (error) => `Creating the customer failed: ${error}`,
  },
  detail: {
    back: "Back to customers",
    notFoundTitle: "Customer not found.",
    toList: "To the customer list",
    editButton: "Edit",
    deleteButton: "Delete",
    masterDataSection: "Master data",
    masterDataHint: "Use the Edit button above to change these fields.",
    invoicesSection: "Outgoing invoices",
    invoiceTotal: (count) => `Total of ${count} ${count === 1 ? "invoice" : "invoices"}`,
    notCounted: (count) =>
      count === 1
        ? "1 draft or voided invoice is not counted"
        : `${count} draft or voided invoices are not counted`,
    invoicesEmpty: "No invoices for this customer yet.",
    draftNumber: "Draft",
    invoiceColumns: {
      number: "Number",
      date: "Date",
      amount: "Amount",
      status: "Status",
    },
    invoiceStatus: {
      draft: "Draft",
      open: "Open",
      overdue: "Overdue",
      paid: "Paid",
      voided: "Voided",
    },
    deleteDialog: {
      title: "Delete this customer?",
      description: "The customer is removed from the list and can be restored later.",
      reasonPlaceholder: "Reason for deleting …",
      cancel: "Cancel",
      confirm: "Delete",
      deleted: "Customer deleted.",
      failed: (error) => `Deleting the customer failed: ${error}`,
    },
    editDialog: {
      title: "Edit customer",
      description: "Change the customer's master data.",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving …",
      saved: "Customer saved.",
      failed: (error) => `Saving the customer failed: ${error}`,
    },
  },
};
