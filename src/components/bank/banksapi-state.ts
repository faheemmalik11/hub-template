import type { BankAccount } from "@/lib/data/types";

/**
 * Whether BANKSapi is feeding an account, could feed it, or has nothing to do with it.
 *
 * Three distinct states, not two. The badge that used to show this read `provider_ref`
 * alone and reported "Kein Provider" for accounts BANKSapi was actively feeding: that column
 * belongs to the CONNECT step (which provider to use for an account not yet connected, FK
 * `bank_providers`, an empty table here), and `bank-sync` never writes it. What proves an account
 * is on the feed is `connection_id` + `provider_account_ref`.
 *
 * Its own module rather than living beside the table that renders it: the accounts filter needs the
 * same rule, and a file that exports both a component and a helper loses Fast Refresh.
 */
export type BanksapiState = "connected" | "linkable" | "none";

export function banksapiState(a: BankAccount): BanksapiState {
  if (a.connection_id && a.provider_account_ref) return "connected";
  if (a.provider_ref || a.provider_id) return "linkable";
  return "none";
}
