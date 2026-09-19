export interface InvoiceUploadLabels {
  back: string;
  title: string;
  subtitle: string;
  dropHint: string;
  dropRelease: string;
  fileTypes: string;
  chooseFiles: string;
  selectedCount: (count: number) => string;
  removeAll: string;
  removeAllTitle: string;
  removeAllDescription: string;
  removeAllCancel: string;
  removeAllConfirm: string;
  savedTag: string;
  cancelFile: string;
  removeFile: string;
  toOverview: string;
  cancel: string;
  uploading: string;
  uploadCount: (count: number) => string;
  uploadGeneric: string;
  footer: string;
  toastTooBig: (count: number, limit: string) => string;
  toastIgnored: (count: number) => string;
  toastSaved: (count: number) => string;
  toastFailed: (error: string) => string;
}

export const englishInvoiceUploadLabels: InvoiceUploadLabels = {
  back: "Back",
  title: "Upload invoices",
  subtitle: "Add invoices by hand instead of waiting for the pipeline to pick them up.",
  dropHint: "Drag files here",
  dropRelease: "Release to add",
  fileTypes: "PDF, JPG, PNG, XML",
  chooseFiles: "Choose files",
  selectedCount: (count) => `${count} file${count === 1 ? "" : "s"} selected`,
  removeAll: "Remove all",
  removeAllTitle: "Remove all files?",
  removeAllDescription: "This clears the list. Nothing has been uploaded yet.",
  removeAllCancel: "Cancel",
  removeAllConfirm: "Remove all",
  savedTag: "Saved",
  cancelFile: "Cancel",
  removeFile: "Remove",
  toOverview: "Back to invoices",
  cancel: "Cancel",
  uploading: "Uploading…",
  uploadCount: (count) => `Upload ${count}`,
  uploadGeneric: "Upload",
  footer: "Files are queued here first; nothing is saved until you press Upload.",
  toastTooBig: (count, limit) =>
    `${count} file${count === 1 ? " is" : "s are"} larger than ${limit} and were skipped.`,
  toastIgnored: (count) =>
    `${count} file${count === 1 ? " was" : "s were"} an unsupported type and were skipped.`,
  toastSaved: (count) => `${count} file${count === 1 ? "" : "s"} uploaded.`,
  toastFailed: (error) => `Upload failed: ${error}`,
};
