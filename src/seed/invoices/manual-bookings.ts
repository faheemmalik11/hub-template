import type { ManualBooking } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  note: null,
  recurrence_until: null,
  created_by: null,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  deleted_at: null,
  deleted_by: null,
  delete_reason: null,
};

/** One that repeats every month and one entered once, since the list marks the two apart. */
export const manualBookings: ManualBooking[] = [
  {
    ...base,
    id: sampleId(100, 1),
    company_id: COMPANIES[0].id,
    property_id: sampleId(40, 2),
    category_id: sampleId(60, 2),
    period: "2026-09",
    amount: 180,
    is_recurring: true,
    recurrence_until: "2026-12",
  } as ManualBooking,
  {
    ...base,
    id: sampleId(100, 2),
    company_id: COMPANIES[1].id,
    property_id: sampleId(40, 1),
    category_id: sampleId(60, 3),
    period: "2026-09",
    amount: 640,
    is_recurring: false,
    note: "Reparatur Heizung, Beleg folgt",
  } as ManualBooking,
];
