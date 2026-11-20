import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { NoAccess } from "@/components/layout/no-access";
import { EmptyState, ErrorState } from "@/components/documents/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/config/brand";
import { PERMISSIONS } from "@/config/permissions";
import { useDealsWithUnmaintainedFields } from "@/data";
import type { DealWithUnmaintainedFields } from "@/data";
import { useAuth } from "@/lib/auth";
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { formatDate } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/unmaintained-fields/")({
  head: () => ({ meta: [{ title: pageTitle("Nicht gepflegte Felder") }] }),
  staticData: { titleKey: "unmaintainedFields" },
  component: UnmaintainedFieldsGuard,
});

function UnmaintainedFieldsGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageUnmaintainedFields)) return <NoAccess />;
  return <UnmaintainedFieldsPage />;
}

function UnmaintainedFieldsPage() {
  const { t } = useTranslation();
  const q = useDealsWithUnmaintainedFields();

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("unmaintainedFields.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("unmaintainedFields.subtitle")}
      </p>

      <div className="mt-6">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <Skeleton className="h-64 w-full" />
        ) : q.data.length === 0 ? (
          <EmptyState title={t("unmaintainedFields.empty")} />
        ) : (
          <DealTable rows={q.data} />
        )}
      </div>
    </div>
  );
}

function DealTable({ rows }: { rows: readonly DealWithUnmaintainedFields[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("unmaintainedFields.column.property")}</th>
            <th className="px-3 py-2 font-medium">{t("unmaintainedFields.column.notarisedOn")}</th>
            <th className="px-3 py-2 font-medium">{t("unmaintainedFields.column.missing")}</th>
            <th className="px-3 py-2 font-medium">{t("unmaintainedFields.column.open")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.deal_id} className="border-t border-border/60">
              <td className="px-3 py-2">
                <Link
                  className="font-medium text-foreground underline underline-offset-2"
                  to="/commission-deals/$id"
                  params={{ id: row.deal_id }}
                >
                  {row.property_label ?? t("unmaintainedFields.noLabel")}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.notarised_on ? formatDate(row.notarised_on) : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.missing_fields
                  .map((field) => t(`commissionDeals.unmaintainedFields.field.${field}`))
                  .join(", ")}
              </td>
              <td className="px-3 py-2">
                {row.property_external_id && (
                  <a
                    className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                    href={propstackUnitUrl(row.property_external_id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden className="size-3.5" />
                    {t("unmaintainedFields.openInPropstack")}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
