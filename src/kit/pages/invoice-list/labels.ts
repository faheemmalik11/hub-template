export interface InvoiceListLabels {
  incoming: { title: string; subtitle: string };
  outgoing: { title: string; subtitle: string };
  searchPlaceholder: string;
  companyAll: string;
  companyPlaceholder: string;
  columnIssuer: string;
  columnCompany: string;
  columnAmount: string;
  columnDate: string;
  columnDueOn: (date: string) => string;
  columnConfidence: string;
  columnReview: string;
  columnPayment: string;
  columnBankMatch: string;
  invoiceNumber: (nr: string) => string;
  noInvoiceNumber: string;
  confidenceUnknown: string;
  confidenceScore: (percent: number) => string;
  vat: (rate: number) => string;
  paid: string;
  open: string;
  bankMatchConfirmed: string;
  bankMatchSuggested: string;
  empty: string;
  sortLabel: string;
  sortAscending: string;
  sortDescending: string;
}

export const englishInvoiceListLabels: InvoiceListLabels = {
  incoming: {
    title: "Incoming invoices",
    subtitle: "Invoices billed to you, from your suppliers.",
  },
  outgoing: { title: "Outgoing invoices", subtitle: "Invoices you issued to your customers." },
  searchPlaceholder: "Search issuer or invoice number",
  companyAll: "All companies",
  companyPlaceholder: "Company",
  columnIssuer: "Issuer",
  columnCompany: "Company",
  columnAmount: "Amount",
  columnDate: "Date",
  columnDueOn: (date) => `Due ${date}`,
  columnConfidence: "Confidence",
  columnReview: "Review",
  columnPayment: "Payment",
  columnBankMatch: "Bank match",
  invoiceNumber: (nr) => `No. ${nr}`,
  noInvoiceNumber: "No invoice number",
  confidenceUnknown: "Unknown",
  confidenceScore: (percent) => `${percent}%`,
  vat: (rate) => `VAT ${rate}%`,
  paid: "Paid",
  open: "Open",
  bankMatchConfirmed: "Matched",
  bankMatchSuggested: "Suggested match",
  empty: "No invoices found.",
  sortLabel: "Sort by",
  sortAscending: "Ascending",
  sortDescending: "Descending",
};
