import { ExternalLink } from "lucide-react";

import type { Deal } from "@/data";
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { useTranslation } from "@/lib/i18n";
import { unmaintainedCrmFieldsOf } from "./unmaintained-crm-fields";
import { cn } from "@/lib/utils";

export function UnmaintainedCrmFieldsCard({ deal, className }: { deal: Deal; className?: string }) {
  const { t } = useTranslation();
  const missing = unmaintainedCrmFieldsOf(deal);
  const externalId = deal.property?.external_id;

  if (missing.length === 0) return null;

  return (
    <section className={cn("rounded-xl border border-amber-300 bg-amber-50 p-4", className)}>
      <h2 className="text-sm font-semibold text-amber-900">
        {t("commissionDeals.unmaintainedFields.title")}
      </h2>
      <p className="mt-1 text-xs text-amber-900">
        {t("commissionDeals.unmaintainedFields.explain")}
      </p>
      <ul className="mt-2 space-y-1">
        {missing.map((field) => (
          <li key={field} className="text-xs text-amber-900">
            • {t(`commissionDeals.unmaintainedFields.field.${field}`)}
          </li>
        ))}
      </ul>
      {externalId && (
        <a
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 underline underline-offset-2"
          href={propstackUnitUrl(externalId)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden className="size-3.5" />
          {t("commissionDeals.unmaintainedFields.openProperty")}
        </a>
      )}
    </section>
  );
}
