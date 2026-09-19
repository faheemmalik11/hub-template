export interface UploadedFileResult {
  storageBucket: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface InvoiceUploadInput {
  invoiceId: string;
  filename: string;
  mime: string;
  size: number;
  storageBucket: string;
  storagePath: string;
  checksumSha256: string;
}

export interface InvoiceUploadAdapter {
  acceptedExtensions: string[];
  maxFileSizeBytes: number;
  uploadFile(
    file: File,
    opts: { signal: AbortSignal; onProgress: (percent: number) => void },
  ): Promise<UploadedFileResult>;
  createInvoices(inputs: InvoiceUploadInput[]): Promise<void>;
  openInvoiceList: () => void;
}
