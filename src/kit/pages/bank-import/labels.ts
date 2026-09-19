export interface BankImportLabels {
  button: string;
  dialogTitle: string;
  dialogDescription: string;
  stepAccount: string;
  stepUpload: string;
  stepMapping: string;
  stepPreview: string;
  stepResult: string;
  accountPlaceholder: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadBusy: string;
  pdfNotSupported: string;
  mappingHint: string;
  fieldBookingDate: string;
  fieldAmount: string;
  fieldValueDate: string;
  fieldCurrency: string;
  fieldCounterpartyHolder: string;
  fieldCounterpartyIban: string;
  fieldPaymentReference: string;
  fieldBookingText: string;
  fieldAmountDebit: string;
  fieldAmountCredit: string;
  useSplitAmount: string;
  notMapped: string;
  continueButton: string;
  backButton: string;
  previewSummary: (count: number, from: string, to: string, sum: string) => string;
  issuesWarning: (count: number) => string;
  duplicateWarning: (count: number) => string;
  columnDate: string;
  columnAmount: string;
  columnCounterparty: string;
  columnReference: string;
  removeRow: string;
  importButton: string;
  importing: string;
  resultSummary: (imported: number, skipped: number, duplicates: number) => string;
  close: string;
  importFailed: (error: string) => string;
}

export const englishBankImportLabels: BankImportLabels = {
  button: "Import file",
  dialogTitle: "Import bank transactions",
  dialogDescription: "Upload a CSV or Excel export from your bank.",
  stepAccount: "Account",
  stepUpload: "Upload",
  stepMapping: "Columns",
  stepPreview: "Preview",
  stepResult: "Done",
  accountPlaceholder: "Choose an account",
  uploadPrompt: "Choose a CSV or Excel file",
  uploadHint: "or drag and drop it here",
  uploadBusy: "Reading file…",
  pdfNotSupported: "PDF statements are not supported here.",
  mappingHint: "Match each column in your file to the field it holds.",
  fieldBookingDate: "Booking date",
  fieldAmount: "Amount",
  fieldValueDate: "Value date",
  fieldCurrency: "Currency",
  fieldCounterpartyHolder: "Counterparty",
  fieldCounterpartyIban: "Counterparty IBAN",
  fieldPaymentReference: "Reference",
  fieldBookingText: "Booking text",
  fieldAmountDebit: "Debit column",
  fieldAmountCredit: "Credit column",
  useSplitAmount: "Amount is split across two columns (debit/credit)",
  notMapped: "Not mapped",
  continueButton: "Continue",
  backButton: "Back",
  previewSummary: (count, from, to, sum) => `${count} rows, ${from} to ${to}, total ${sum}.`,
  issuesWarning: (count) => `${count} rows could not be read and were skipped.`,
  duplicateWarning: (count) => `${count} rows look like duplicates of each other.`,
  columnDate: "Date",
  columnAmount: "Amount",
  columnCounterparty: "Counterparty",
  columnReference: "Reference",
  removeRow: "Remove row",
  importButton: "Import",
  importing: "Importing…",
  resultSummary: (imported, skipped, duplicates) =>
    `Imported ${imported}, skipped ${skipped}, ${duplicates} flagged as duplicates.`,
  close: "Close",
  importFailed: (error) => `Import failed: ${error}`,
};
