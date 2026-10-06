import { useMemo, useState } from "react";

import { FactList, type Fact } from "@/components/records/fact-list";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePropertyCrmData, usePropertyListings } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { useAuth } from "@/lib/auth";
import { describeRemainingCrmFields, type CrmField } from "@/lib/crm/fields";
import { formatDate, formatDateTime, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { marketingTypeLabel, propertyTypeLabel } from "./listing-labels";

function area(value: number | null): string | null {
  return value === null ? null : `${value.toLocaleString("de-DE")} m²`;
}

function SimpleValue({ value }: { value: string | number | boolean | null }) {
  const { t } = useTranslation();
  if (typeof value === "boolean") {
    return <>{value ? t("propertyListings.allFields.yes") : t("propertyListings.allFields.no")}</>;
  }
  if (typeof value === "number")
    return <>{value.toLocaleString("de-DE", { maximumFractionDigits: 10 })}</>;
  return <span className="break-words">{value}</span>;
}

function FieldValue({ field }: { field: CrmField }) {
  const { t } = useTranslation();
  if (field.kind === "empty") return <span className="text-muted-foreground">—</span>;
  if (field.kind === "simple") return <SimpleValue value={field.value} />;
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground">
        {t("propertyListings.allFields.entries", { count: field.entryCount ?? 0 })}
      </summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">
        {JSON.stringify(field.structured, null, 2)}
      </pre>
    </details>
  );
}

/**
 * Everything the CRM says about one property, in one section: the facts that matter on top, and
 * every other field it sends below them, searchable.
 */
export function CrmPropertySection({ propertyCode }: { propertyCode: string }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const enabled = can(PERMISSIONS.propertiesCrmSync);
  const listingsQ = usePropertyListings({ enabled });
  const dataQ = usePropertyCrmData(propertyCode, { enabled });
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const listing = useMemo(
    () => listingsQ.data?.find((candidate) => candidate.code === propertyCode),
    [listingsQ.data, propertyCode],
  );
  const fields = useMemo(
    () => (dataQ.data ? describeRemainingCrmFields(dataQ.data) : []),
    [dataQ.data],
  );
  const filled = fields.filter((field) => field.kind !== "empty").length;
  const needle = search.trim().toLowerCase();
  const visible = fields.filter(
    (field) =>
      (showEmpty || field.kind !== "empty") &&
      (!needle || `${field.label} ${field.key}`.toLowerCase().includes(needle)),
  );

  if (!enabled || (!listing && !dataQ.data)) return null;

  const owners = listing?.parties.filter((party) => party.role === "owner").length ?? 0;
  const partners = listing?.parties.filter((party) => party.role === "partner").length ?? 0;
  const facts: Fact[] = listing
    ? [
        { label: t("propertyListings.columns.status"), value: listing.crm_status },
        {
          label: t("propertyListings.fields.propertyType"),
          value: propertyTypeLabel(t, listing.property_type),
        },
        {
          label: t("propertyListings.fields.marketingType"),
          value: marketingTypeLabel(t, listing.marketing_type),
        },
        {
          label: t("propertyListings.fields.askingPrice"),
          value: listing.asking_price === null ? null : formatEUR(listing.asking_price),
        },
        {
          label: t("propertyListings.fields.soldPrice"),
          value: listing.sold_price === null ? null : formatEUR(listing.sold_price),
        },
        {
          label: t("propertyListings.fields.soldOn"),
          value: listing.sold_on ? formatDate(listing.sold_on) : null,
        },
        { label: t("propertyListings.fields.livingSpace"), value: area(listing.living_space) },
        { label: t("propertyListings.fields.plotArea"), value: area(listing.plot_area) },
        {
          label: t("propertyListings.fields.rooms"),
          value: listing.room_count?.toLocaleString("de-DE") ?? null,
        },
        { label: t("propertyListings.columns.commission"), value: listing.commission_note },
        { label: t("propertyListings.columns.broker"), value: listing.broker_name },
        { label: t("propertyListings.fields.owners"), value: String(owners) },
        { label: t("propertyListings.fields.partners"), value: String(partners) },
        { label: t("propertyListings.fields.externalId"), value: listing.external_id, mono: true },
      ]
    : [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {t("propertyListings.cardTitle")}
        </h2>
        {listing && (
          <span className="text-xs text-muted-foreground">
            {t("propertyListings.lastSynced", { when: formatDateTime(listing.crm_synced_at) })}
          </span>
        )}
      </div>
      {facts.length > 0 && <FactList facts={facts} columns={2} className="mt-4" />}

      {dataQ.data && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-foreground">
            {t("propertyListings.allFields.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("propertyListings.allFields.subtitle", { filled, total: fields.length })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Input
              className="max-w-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("propertyListings.allFields.search")}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
              {t("propertyListings.allFields.showEmpty")}
            </label>
          </div>
          <dl className="mt-4 divide-y divide-border">
            {visible.map((field) => (
              <div
                key={field.key}
                className="grid gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
              >
                <dt className="min-w-0 text-sm">
                  <span className="block text-foreground">{field.label}</span>
                  {field.label !== field.key && (
                    <span className="block break-all font-mono text-xs text-muted-foreground">
                      {field.key}
                    </span>
                  )}
                </dt>
                <dd className="min-w-0 text-sm text-foreground">
                  <FieldValue field={field} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
