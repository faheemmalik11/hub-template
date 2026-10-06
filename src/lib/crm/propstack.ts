export const PROPSTACK_SOURCE = "propstack";
export const PROPSTACK_API_URL = "https://api.propstack.de/v1";
export const PROPSTACK_PAGE_SIZE = 100;

type LabelledValue<T> = { label?: string | null; value?: T | null } | null | undefined;

export interface PropstackUnit {
  id: number;
  title?: LabelledValue<string>;
  street?: string | null;
  house_number?: string | null;
  zip_code?: string | null;
  city?: string | null;
  property_status?: { id: number; name: string } | null;
  marketing_type?: string | null;
  rs_type?: string | null;
  object_type?: string | null;
  price?: LabelledValue<number | string>;
  sold_price?: LabelledValue<number | string>;
  sold_date?: string | null;
  living_space?: LabelledValue<number | string>;
  plot_area?: LabelledValue<number | string>;
  number_of_rooms?: LabelledValue<number | string>;
  courtage?: LabelledValue<string>;
  broker_id?: number | null;
  broker?: {
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  relationships?: Array<{ internal_name?: string | null; client_id?: number | null }> | null;
  archived?: boolean | null;
  updated_at?: string | null;
}

export interface PropstackUnitPage {
  data: PropstackUnit[];
  meta?: { total_count?: number };
}

export interface SyncedParty {
  role: string;
  external_id: string;
}

export interface SyncedProperty {
  external_id: string;
  code: string;
  name: string;
  address: string | null;
  crm_status: string | null;
  crm_status_id: string | null;
  marketing_type: string | null;
  property_type: string | null;
  usage_type: string | null;
  asking_price: number | null;
  sold_price: number | null;
  sold_on: string | null;
  living_space: number | null;
  plot_area: number | null;
  room_count: number | null;
  commission_note: string | null;
  broker_external_id: string | null;
  broker_name: string | null;
  broker_email: string | null;
  parties: SyncedParty[];
  archived_in_crm: boolean;
  crm_updated_at: string | null;
  crm_data: Record<string, unknown>;
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function amount(field: LabelledValue<number | string>): number | null {
  const value = field?.value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function streetLine(unit: PropstackUnit): string | null {
  return text([unit.street, unit.house_number].filter(Boolean).join(" "));
}

export function addressLine(unit: PropstackUnit): string | null {
  const town = text([unit.zip_code, unit.city].filter(Boolean).join(" "));
  return text([streetLine(unit), town].filter(Boolean).join(", "));
}

export function propertyCode(unit: PropstackUnit): string {
  return `CRM-${unit.id}`;
}

function brokerName(unit: PropstackUnit): string | null {
  const broker = unit.broker;
  if (!broker) return null;
  return text(broker.name) ?? text([broker.first_name, broker.last_name].filter(Boolean).join(" "));
}

export function toSyncedProperty(unit: PropstackUnit): SyncedProperty {
  const street = streetLine(unit);
  const city = text(unit.city);
  const location = street && city ? `${street}, ${city}` : (street ?? city);
  return {
    external_id: String(unit.id),
    code: propertyCode(unit),
    name: text(unit.title?.value) ?? location ?? propertyCode(unit),
    address: addressLine(unit),
    crm_status: text(unit.property_status?.name),
    crm_status_id: unit.property_status ? String(unit.property_status.id) : null,
    marketing_type: text(unit.marketing_type),
    property_type: text(unit.rs_type),
    usage_type: text(unit.object_type),
    asking_price: amount(unit.price),
    sold_price: amount(unit.sold_price),
    sold_on: text(unit.sold_date)?.slice(0, 10) ?? null,
    living_space: amount(unit.living_space),
    plot_area: amount(unit.plot_area),
    room_count: amount(unit.number_of_rooms),
    commission_note: text(unit.courtage?.value),
    broker_external_id: unit.broker_id ? String(unit.broker_id) : null,
    broker_name: brokerName(unit),
    broker_email: text(unit.broker?.email),
    parties: (unit.relationships ?? []).flatMap((relationship) =>
      relationship.internal_name && relationship.client_id
        ? [{ role: relationship.internal_name, external_id: String(relationship.client_id) }]
        : [],
    ),
    archived_in_crm: unit.archived === true,
    crm_updated_at: text(unit.updated_at),
    crm_data: unit as unknown as Record<string, unknown>,
  };
}
