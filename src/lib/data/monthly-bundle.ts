// Client side of the monthly document export.
//
// Turns the server function's base64 archive back into a Blob and hands it to the drawer, which
// does the download itself. Shaped to match Eiffler's `downloadMonthlyBundle` exactly, so the
// shared DATEV feature folder calls one signature in every Hub regardless of whether the archive
// is built by a server function (here) or an edge function (Eiffler).
import { buildMonthlyBundle, type BundleSummary } from "@/lib/api/document-bundle.functions";

export type { BundleSummary };

export interface BundleResult {
  blob: Blob;
  filename: string;
  summary: BundleSummary | null;
}

export async function downloadMonthlyBundle(args: {
  companyId: string;
  year: number;
  month: number;
}): Promise<BundleResult> {
  const res = await buildMonthlyBundle({ data: args });

  // atob gives one char per byte; Uint8Array.from maps those to the bytes themselves. Building the
  // Blob from a plain string instead would re-encode it as UTF-8 and corrupt the archive.
  const binary = atob(res.base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

  return {
    blob: new Blob([bytes], { type: "application/zip" }),
    filename: res.filename,
    summary: res.summary ?? null,
  };
}
