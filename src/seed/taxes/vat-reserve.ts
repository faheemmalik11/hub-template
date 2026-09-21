import type { VatReserve } from "@/lib/data/types";
import { COMPANIES } from "../shared";

/**
 * One company whose VAT is fully resolved and one with documents still unresolved, because the
 * unresolved count is the figure the screen exists to surface: a reserve computed from incomplete
 * data is worse than no reserve, and it has to say so.
 */
export const vatReserve: VatReserve[] = [
  {
    company_id: COMPANIES[0].id,
    fromDate: "2026-07-01",
    toDate: "2026-09-30",
    input_vat_total: 1820.4,
    input_vat_deductible: 1820.4,
    input_vat_nondeductible: 0,
    input_vat_unresolved_count: 0,
    input_vat_unresolved_amount: 0,
    output_vat: 4560,
    reserve: 2739.6,
  },
  {
    company_id: COMPANIES[1].id,
    fromDate: "2026-07-01",
    toDate: "2026-09-30",
    input_vat_total: 610.2,
    input_vat_deductible: 402.8,
    input_vat_nondeductible: 98.5,
    input_vat_unresolved_count: 3,
    input_vat_unresolved_amount: 108.9,
    output_vat: 0,
    reserve: -402.8,
  },
];
