/**
 * The cost centre an invoice books to, worked out rather than chosen.
 *
 * Nobody picks a number. A reviewer picks a property or Gemeinkosten, and the number follows from
 * that plus the company. It has to be both, because the tax adviser's workbook numbers the same
 * building differently per company: Ludwigshafen is 6 for this client and 101 for Impuls. That is why the
 * number lives on the property/company link (`property_companies.cost_centre_number`) and not on
 * the property, and why the overhead counterpart lives on the company
 * (`companies.overhead_cost_centre`).
 *
 * See docs/COST_CENTRES.md.
 */

import { useMemo } from "react";

import { useGesellschaften, useObjekte, usePropertyCompanies } from "./queries";

export interface Kostenstelle {
  /**
   * Null where the pairing carries no number yet. That is a master-data gap worth showing as one,
   * so callers must not fall back to the company's overhead number to fill it.
   */
  nummer: number | null;
  gemeinkosten: boolean;
  /** The company the number belongs to, so a gap can link to where it is filled in. */
  gesellschaftId: string;
  /**
   * Whether the property is assigned to the company at all. False means there is no row to hold a
   * number yet, which is a different fix (assign it on the property) from a row without a number.
   * Always true for Gemeinkosten, whose number lives on the company itself.
   */
  verknuepft: boolean;
}

/** What the resolver needs to answer for one invoice. */
export interface KostenstelleEingabe {
  companyCode: string | null | undefined;
  propertyCode: string | null | undefined;
  /** `invoices.is_overhead`, or the form's Gemeinkosten sentinel while editing. */
  gemeinkosten: boolean;
}

interface KostenstelleStammdaten {
  gesellschaften: { id: string; code: string; overhead_cost_centre: number | null }[];
  objekte: { id: string; code: string }[];
  links: { property_id: string; company_id: string; cost_centre_number: number | null }[];
}

/**
 * Null means "no cost centre can be named", which is NOT the same as a pairing without a number:
 * the company is unknown, or a property was chosen that is not in the master data. Callers render
 * nothing for null and "no cost centre recorded" for `nummer === null`.
 */
export function resolveKostenstelle(
  eingabe: KostenstelleEingabe,
  stammdaten: KostenstelleStammdaten,
): Kostenstelle | null {
  const firma = stammdaten.gesellschaften.find((g) => g.code === eingabe.companyCode) ?? null;
  if (!firma) return null;

  if (eingabe.gemeinkosten) {
    return {
      nummer: firma.overhead_cost_centre ?? null,
      gemeinkosten: true,
      gesellschaftId: firma.id,
      verknuepft: true,
    };
  }

  const propId = stammdaten.objekte.find((o) => o.code === eingabe.propertyCode)?.id;
  if (!propId) return null;

  const link = stammdaten.links.find((l) => l.property_id === propId && l.company_id === firma.id);
  return {
    nummer: link?.cost_centre_number ?? null,
    gemeinkosten: false,
    gesellschaftId: firma.id,
    verknuepft: !!link,
  };
}

/**
 * The resolver bound to the three master-data queries, for screens that resolve many rows.
 *
 * One shared function for a whole list rather than a hook per row: all three queries are unscoped
 * single requests that React Query already dedupes, so the cost of a list is the cost of one row.
 * `bereit` is separate because a row that renders before the master data lands must show nothing,
 * not "no cost centre recorded" -- an absent number and a number that has not arrived yet are
 * different statements.
 */
export function useKostenstelleResolver(): {
  bereit: boolean;
  resolve: (eingabe: KostenstelleEingabe) => Kostenstelle | null;
} {
  const gesellschaftenQ = useGesellschaften();
  const objekteQ = useObjekte();
  const linksQ = usePropertyCompanies();

  const bereit =
    gesellschaftenQ.data !== undefined && objekteQ.data !== undefined && linksQ.data !== undefined;

  return useMemo(() => {
    const stammdaten: KostenstelleStammdaten = {
      gesellschaften: gesellschaftenQ.data ?? [],
      objekte: objekteQ.data ?? [],
      links: linksQ.data ?? [],
    };
    return {
      bereit,
      resolve: (eingabe: KostenstelleEingabe) =>
        bereit ? resolveKostenstelle(eingabe, stammdaten) : null,
    };
  }, [gesellschaftenQ.data, objekteQ.data, linksQ.data, bereit]);
}
