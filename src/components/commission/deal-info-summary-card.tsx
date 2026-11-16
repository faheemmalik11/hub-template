import { FileText } from "lucide-react";

import { useEmployees } from "@/data";
import type { Deal } from "@/data";
import { useTranslation } from "@/lib/i18n";

export function DealInfoSummaryCard({ deal, onEdit }: { deal: Deal; onEdit?: () => void }) {
  const { t } = useTranslation();
  const employeesQ = useEmployees();
  const nameOf = (userId: string | null) =>
    employeesQ.data?.find((employee) => employee.id === userId)?.name ??
    employeesQ.data?.find((employee) => employee.id === userId)?.email ??
    t("commissionDeals.bonuses.nobody");
  const yesNo = (value: boolean) =>
    value ? t("commissionDeals.info.yes") : t("commissionDeals.info.no");

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <FileText aria-hidden className="size-4" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            {t("commissionDeals.info.title")}
          </h2>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
          >
            {t("commissionDeals.info.edit")}
          </button>
        )}
      </div>
      <dl className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <dt className="font-medium text-foreground">{t("commissionDeals.facts.ownLead")}</dt>
          <dd className="text-muted-foreground">{yesNo(deal.own_lead)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <dt className="font-medium text-foreground">{t("commissionDeals.facts.fromViewing")}</dt>
          <dd className="text-muted-foreground">{yesNo(deal.from_viewing)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <dt className="font-medium text-foreground">{t("commissionDeals.facts.handledBy")}</dt>
          <dd className="text-muted-foreground">{nameOf(deal.handled_by)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <dt className="font-medium text-foreground">{t("commissionDeals.facts.acquiredBy")}</dt>
          <dd className="text-muted-foreground">{nameOf(deal.acquired_by)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <dt className="font-medium text-foreground">{t("commissionDeals.facts.costsClosed")}</dt>
          <dd className="text-muted-foreground">{yesNo(deal.costs_closed_at !== null)}</dd>
        </div>
      </dl>
    </section>
  );
}
