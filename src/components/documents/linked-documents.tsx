import { Link } from "@tanstack/react-router";

import { useDocumentLinks } from "@/data";
import { useTranslation } from "@/lib/i18n";

export function LinkedDocuments({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const { data: links } = useDocumentLinks(documentId);
  if (!links || links.length === 0) return null;

  return (
    <ul className="mb-3 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      {links.map((link) => (
        <li key={link.linkId} className="flex flex-wrap items-center gap-x-1.5">
          <span>{t(`documents.links.${link.kind}.${link.direction}`)}</span>
          <Link
            to="/incoming-invoices/$nr"
            params={{ nr: link.documentId }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {[link.invoiceNumber, link.issuer].filter(Boolean).join(" · ") ||
              t("documents.links.unnamed")}
          </Link>
        </li>
      ))}
    </ul>
  );
}
