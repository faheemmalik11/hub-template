import type { Company } from "@/lib/data/types";
import { demoCompanyAndPropertyCodes } from "@/features/onboarding-practice/practice-placeholder-values";
import { COMPANIES, sampleId } from "../shared";
import { team } from "../admin/team";

const { demoCompanyCode } = demoCompanyAndPropertyCodes(team[0].id);

export const DEMO_COMPANY_ID = sampleId(41, 1);

/** Two real companies plus the one the onboarding practice task asks a person to pick by code. */
export const companies: Company[] = [
  ...COMPANIES.map(
    (one, at) =>
      ({
        id: one.id,
        code: one.code,
        name: one.name,
        booking_basis: at === 0 ? "invoice_date" : "payment_date",
        created_at: "2026-01-08T10:00:00Z",
        updated_at: "2026-01-08T10:00:00Z",
      }) as Company,
  ),
  {
    id: DEMO_COMPANY_ID,
    code: demoCompanyCode,
    name: "Practice company",
    booking_basis: "invoice_date",
    created_at: "2026-01-08T10:00:00Z",
    updated_at: "2026-01-08T10:00:00Z",
  } as Company,
];
