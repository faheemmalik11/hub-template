// MVP ZUGFeRD wrapper (DATEV handover, Briefing Screen 9): DATEV Unternehmen Online rejects naked
// e-invoice XML ("convert before sending" per the briefing). This does NOT produce a fully
// PDF/A-3-validated ZUGFeRD file — it generates a plain one-page visual summary from the
// invoice's own already-extracted fields and embeds the original XML as a named attachment. That
// satisfies the literal requirement ("not naked XML", the data travels both visually and
// machine-readably) but is a fidelity tradeoff, flagged for the tax advisor to confirm once real
// e-invoices flow through — not a blocker for this round.
import { PDFDocument, StandardFonts, AFRelationship } from "pdf-lib";

export interface ZugferdSummary {
  issuer: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  amountNet: number | null;
  vatAmount: number | null;
  amountGross: number | null;
  currency: string | null;
}

function formatAmount(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)} ${currency ?? "EUR"}`;
}

export async function wrapEinvoiceXmlAsPdf(
  xmlBytes: Uint8Array,
  summary: ZugferdSummary,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;
  const line = (label: string, value: string, size = 11) => {
    page.drawText(label, { x: 50, y, size, font: bold });
    page.drawText(value, { x: 220, y, size, font });
    y -= 22;
  };

  page.drawText("E-Rechnung — visuelle Zusammenfassung", { x: 50, y, size: 16, font: bold });
  y -= 40;
  line("Rechnungssteller:", summary.issuer ?? "—");
  line("Rechnungsnummer:", summary.invoiceNumber ?? "—");
  line("Rechnungsdatum:", summary.documentDate ?? "—");
  line("Nettobetrag:", formatAmount(summary.amountNet, summary.currency));
  line("USt.:", formatAmount(summary.vatAmount, summary.currency));
  line("Bruttobetrag:", formatAmount(summary.amountGross, summary.currency));

  y -= 20;
  page.drawText(
    "Die vollstaendigen, maschinenlesbaren Rechnungsdaten sind als Anhang " +
      '"factur-x.xml" in dieser PDF eingebettet (EN16931).',
    { x: 50, y, size: 9, font },
  );

  await pdfDoc.attach(xmlBytes, "factur-x.xml", {
    mimeType: "application/xml",
    description: "ZUGFeRD/Factur-X invoice data (EN16931)",
    afRelationship: AFRelationship.Alternative,
  });

  return pdfDoc.save();
}
