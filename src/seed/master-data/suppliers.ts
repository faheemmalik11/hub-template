import type { Supplier } from "@/lib/data/types";
import { SUPPLIERS } from "../shared";

/**
 * One supplier with a confirmed bank account, one with none, one a duplicate spelling would merge
 * into: the three states the suppliers screen draws differently.
 */
export const suppliers: Supplier[] = [
  {
    id: SUPPLIERS[0].id,
    name: SUPPLIERS[0].name,
    iban: "DE02120300000000202051",
    vat_id: "DE136695976",
    created_at: "2026-01-09T09:00:00Z",
  } as Supplier,
  {
    id: SUPPLIERS[1].id,
    name: SUPPLIERS[1].name,
    vat_id: "DE123475223",
    created_at: "2026-02-14T11:30:00Z",
  } as Supplier,
  {
    id: SUPPLIERS[2].id,
    name: SUPPLIERS[2].name,
    iban: "DE89370400440532013000",
    created_at: "2026-03-01T08:15:00Z",
  } as Supplier,
];
