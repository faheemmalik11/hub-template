import type { Company } from "@/lib/data/types";
import { COMPANIES } from "../shared";

/** Two companies, because one hides every bug about scoping and picking. */
export const companies: Company[] = COMPANIES.map(
  (one, at) =>
    ({
      id: one.id,
      code: one.code,
      name: one.name,
      booking_basis: at === 0 ? "invoice_date" : "payment_date",
      created_at: "2026-01-08T10:00:00Z",
      updated_at: "2026-01-08T10:00:00Z",
    }) as Company,
);
