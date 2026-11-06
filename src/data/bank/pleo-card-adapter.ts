import { useQuery } from "@tanstack/react-query";

import { EDGE_FUNCTION } from "@/config/edge-functions";
import { sb } from "@/data/client";
import { edgeFunctionErrorText } from "@/lib/data/format";

/**
 * One person spending on a Pleo card, with what they have actually spent.
 *
 * WALLET entries are NOT in here, see PLEO_NICHT_MITARBEITER below.
 *
 * WHY THIS IS DERIVED AND NOT FETCHED. Pleo's public API has no cards endpoint: the documented
 * families are accounting entries, export, tags, tax codes, webhooks, employees and the app
 * marketplace, and `GET /v2/employees` returns id, company, name, email, code, job title and phone
 * with no card data on it at all. There is no way to ask Pleo which cards exist. What we do have is
 * the spender on every entry it delivers -- `spenderOf()` in pleo-sync writes `spender_name` and
 * `spender_email` onto every row (migrations 20260901190000 and 20260901200000) -- so the people
 * holding the cards are already in the database, together with what they spent.
 */
export interface PleoSpender {
  /** Stable grouping key: the lower-cased email, falling back to the name, "" when Pleo gave neither. */
  key: string;
  name: string | null;
  email: string | null;
  count: number;
  /** Sum of the signed amounts, so card spend is negative and a refund reduces it, exactly as on
   *  the statement. `signedAmount()` in _shared/pleo.ts negates Pleo's own positive "spent". */
  total: number;
  lastBooking: string | null;
}

/** One person with a Pleo account, as the `pleo-employees` function returns them. */
export interface PleoEmployee {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  code: string | null;
  jobTitle: string | null;
}

/**
 * Everyone with a Pleo account, read live from Pleo through the `pleo-employees` function.
 *
 * NOT from bank_transactions, which is where this list used to come from. A list derived from
 * movements can only ever contain people who have SPENT, so a colleague holding a card they have
 * never used is invisible in it. That is the one thing the mirror cannot answer, and the only
 * reason this makes a live call at all: everything about spend stays where pleo-sync already put
 * it, and asking Pleo for it again would only produce a second answer that disagrees between syncs.
 *
 * It does not return cards. Pleo's public API has no cards endpoint, so an employee row is the
 * closest thing to "who has a card", and it carries no card number, status or limit.
 *
 * Five minutes of cache rather than the usual sixty seconds: headcount changes at the pace of
 * hiring, and every refetch is a round trip out to Pleo rather than a query against our own
 * database.
 */
export function usePleoEmployees(enabled = true) {
  return useQuery({
    queryKey: ["pleo_employees"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PleoEmployee[]> => {
      const { data, error } = await sb.functions.invoke(EDGE_FUNCTION.expenseToolEmployees, {
        body: {},
      });
      if (error) throw new Error(await edgeFunctionErrorText(error));
      return ((data ?? {}) as { employees?: PleoEmployee[] }).employees ?? [];
    },
  });
}
