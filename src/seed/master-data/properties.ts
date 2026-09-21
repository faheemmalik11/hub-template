import type { Property } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

/**
 * A property belongs to companies through `property_companies`, never by a column of its own, so
 * the link is a fixture in its own right below.
 */
export const properties: Property[] = [
  {
    id: sampleId(40, 1),
    code: "HAF-12",
    name: "Hafenstraße 12",
    address: "Hafenstraße 12, 24103 Kiel",
    vat_status: null,
    created_at: "2026-01-10T09:00:00Z",
    updated_at: "2026-01-10T09:00:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  } as Property,
  {
    id: sampleId(40, 2),
    code: "MUE-4",
    name: "Mühlenweg 4",
    address: "Mühlenweg 4, 24103 Kiel",
    vat_status: null,
    created_at: "2026-01-10T09:05:00Z",
    updated_at: "2026-01-10T09:05:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  } as Property,
  // Linked to nothing, which is the row that catches a join written as an inner one.
  {
    id: sampleId(40, 3),
    code: "NEW-1",
    name: "Neubau, noch nicht zugeordnet",
    address: null,
    vat_status: null,
    created_at: "2026-04-02T14:00:00Z",
    updated_at: "2026-04-02T14:00:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  } as Property,
];

/** Which company each property belongs to, as the join table holds it. */
export const propertyCompanies = [
  { property_id: sampleId(40, 1), company_id: COMPANIES[1].id },
  { property_id: sampleId(40, 2), company_id: COMPANIES[0].id },
];
