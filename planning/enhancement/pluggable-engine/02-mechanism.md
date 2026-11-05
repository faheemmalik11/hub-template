# The mechanism: config shape, interfaces, resolver

Identical for every client, copied verbatim. Contains no client name, no vendor call, and no
`tenant_id` — see the tenancy decision in the README.

## The config namespace

`tenant_settings.config` is already a JSONB column; this adds no columns, only a shape and three
accessor functions, following the `run_now_enabled()` precedent in `0011_functions.sql`. Every
default below reproduces today's hardcoded behaviour exactly, so landing this changes nothing until
a row is edited.

```sql
create or replace function public.tenant_locale_settings() returns jsonb
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'locale' from public.tenant_settings where single_row),
        '{"dateFormat": "dd.MM.yyyy", "decimalSeparator": ",", "currency": "EUR"}'::jsonb
    )
$$;

create or replace function public.tenant_tax_regime() returns jsonb
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'tax' from public.tenant_settings where single_row),
        '{"country": "DE", "defaultVatRate": 19, "taxModel": "flat"}'::jsonb
    )
$$;

create or replace function public.tenant_banking_provider() returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'banking' ->> 'provider' from public.tenant_settings where single_row),
        'banksapi'
    )
$$;

create or replace function public.tenant_card_provider() returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'cards' ->> 'provider' from public.tenant_settings where single_row),
        'pleo'
    )
$$;
```

| Namespace | Shape | Default (= today's hardcoded behaviour) |
|---|---|---|
| `config.locale` | `{ dateFormat, decimalSeparator, currency }` | German date/decimal, EUR |
| `config.tax` | `{ country, defaultVatRate, taxModel }` | `DE`, `19`, `flat` |
| `config.banking.provider` | string | `banksapi` |
| `config.cards.provider` | string | `pleo` |

`config.banking.provider` is a vendor choice, resolved once at the point of use. It is a different
axis from `BANKSAPI_MODE` (mock vs. live), which stays an environment variable — see finding 5.

## `ILocaleParser`

Replaces the inline assumptions in `src/lib/bank-import/normalize.ts` and the hardcoded
`Intl.NumberFormat("de-DE", ...)` in `src/lib/data/format.ts`. One interface, one default
implementation that reproduces current behaviour, a registry keyed by the same strings
`tenant_locale_settings()` can return.

```ts
// src/lib/locale/locale-parser.ts
export interface LocaleSettings {
  dateFormat: "dd.MM.yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  decimalSeparator: "," | ".";
  currency: string;
}

export interface ILocaleParser {
  parseDate(value: string): string | null;
  parseAmount(value: string): number | null;
  formatCurrency(value: number): string;
}

export function createLocaleParser(settings: LocaleSettings): ILocaleParser {
  const amountPattern = settings.decimalSeparator === "," ? /[.,]/ : /,/g;
  return {
    parseDate(value) {
      return parseDateBySettings(value, settings.dateFormat);
    },
    parseAmount(value) {
      return parseAmountBySettings(value, settings.decimalSeparator);
    },
    formatCurrency(value) {
      return new Intl.NumberFormat(localeTagFor(settings), {
        style: "currency",
        currency: settings.currency,
      }).format(value);
    },
  };
}
```

`parseDateBySettings`/`parseAmountBySettings` carry the exact logic already in
`normalize.ts::parseFlexibleDate`/`parseFlexibleAmount`, parameterised on `settings` instead of
assuming German formatting inline. `localeTagFor` maps `decimalSeparator` + `currency` to an
`Intl`-compatible tag (`"de-DE"` today; `settings.currency === "EUR" && decimalSeparator === ","`
→ `"de-DE"`, else derived from `currency`).

## `TaxBreakdown`

Added to `src/lib/data/types.ts`, beside the existing `Document` interface — additive, `vat_rate`
is not removed:

```ts
export interface TaxBreakdownLine {
  rate: number;
  net: number;
  vat_amount: number;
  /** Which tax this row is, for regimes where two rows can share a rate: "federal", "provincial",
   *  "room", "breakfast". Null for a plain single-rate VAT line, where the rate alone is enough. */
  component: string | null;
}

export type TaxBreakdown = TaxBreakdownLine[];

// on Document:
//   tax_breakdown?: TaxBreakdown; // from document_taxes; absent on a single-rate document
```

Needs one additive column on the table this already reads from:

```sql
alter table public.document_taxes
  add column if not exists component text;
```

Without `component`, two taxes at the same rate (GST + PST, both provincial and federal VAT at an
identical percentage) are indistinguishable rows. `rate` stays the grouping key for a plain VAT
regime where it is already unique per document; `component` is the key for regimes where it is not.
Kept relational rather than a JSONB blob on `documents`: `numeric` typing on `net`/`vat_amount` and
`sum(vat_amount) group by component` stay possible without unnesting JSON on every report, and the
table is already registered in `TABLE.documentTaxes` with nothing else pointing at it yet to
disturb.

Separately, whether a client's tax engine *supports* more than one component at all is a tenant-level
question, not a per-document one — it belongs in `tenant_tax_regime()`'s shape
(`{ country, defaultVatRate, taxModel: "flat" | "composite" }`), not as a column repeated on every
document. A document's own row count in `document_taxes` already answers "is this one flat or
composite" for that document; storing the same fact again per document would just be a second copy
that can drift from the first.

## `IBankingAdapter` / `ICardAdapter`

Deno-side only — the browser never calls a banking vendor directly, it reads rows `bank-sync`
already wrote. One generic row shape, so `bank-sync`'s matching/classification code stops caring
which vendor produced a row.

```ts
// supabase/functions/_shared/banking-adapter.ts
export interface GenericBankAccount {
  providerAccountRef: string;
  providerRef: string | null;
  accountName: string | null;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bankName: string | null;
  currency: string;
  balance: number | null;
  balanceDate: string | null;
  isOwnAccount: boolean;
}

export interface GenericBankTransaction {
  providerHash: string;
  amount: number;
  currency: string;
  bookingDate: string | null;
  valueDate: string | null;
  paymentReference: string | null;
  bookingText: string | null;
  counterpartyHolder: string | null;
  counterpartyIban: string | null;
  counterpartyBic: string | null;
  raw: Record<string, unknown>;
}

export interface IBankingAdapter {
  readonly providerKey: string;
  listAccounts(accessRef: string): Promise<GenericBankAccount[]>;
  listTransactions(accountRef: string, since: string | null): Promise<GenericBankTransaction[]>;
}

export interface CardSpender {
  key: string;
  name: string | null;
  email: string | null;
  count: number;
  total: number;
  lastBooking: string | null;
}

export interface ICardAdapter {
  readonly providerKey: string;
  listSpenders(): Promise<CardSpender[]>;
}
```

`BanksapiAdapter` (`supabase/functions/_shared/adapters/banksapi-adapter.ts`) wraps the existing
`getBanksapi()` + `mappers.ts` and implements `IBankingAdapter`; `PleoCardAdapter`
(`.../adapters/pleo-card-adapter.ts`) wraps `_shared/pleo.ts` and implements `ICardAdapter`,
returning `CardSpender` where `src/data/bank/bank.ts` today builds `PleoSpender` inline. Each
adapter is the one file per vendor that differs — the same arrangement
`src/features/datev-handover/adapter.ts` already proves.

## The resolver

Mirrors `tenantCredential()` (`src/lib/inbox/channel-credentials.server.ts`): cached per process,
60 seconds, read from the database, never from `.env`. Two copies for the two runtimes, the same
dual-maintenance convention as `src/config/tables.ts` / `supabase/functions/_shared/tables.ts`.

```ts
// src/lib/tenant-config.server.ts  (Node — TanStack Start server functions)
export async function tenantLocaleSettings(): Promise<LocaleSettings> { ... }
export async function tenantTaxRegime(): Promise<{ country: string; defaultVatRate: number }> { ... }
```

```ts
// supabase/functions/_shared/tenant-config.ts  (Deno — Edge Functions)
export async function tenantLocaleSettings(): Promise<LocaleSettings> { ... }
export async function tenantTaxRegime(): Promise<{ country: string; defaultVatRate: number }> { ... }
export async function resolveBankingAdapter(): Promise<IBankingAdapter> {
  const provider = await tenantBankingProvider();
  if (provider === "banksapi") return banksapiAdapter();
  throw new Error(`no banking adapter registered for provider "${provider}"`);
}
export async function resolveCardAdapter(): Promise<ICardAdapter> {
  const provider = await tenantCardProvider();
  if (provider === "pleo") return pleoCardAdapter();
  throw new Error(`no card adapter registered for provider "${provider}"`);
}
```

Both read through the same `tenant_settings` row the SQL functions above read, so a client editing
their config in the admin panel and a report run from SQL never disagree. `bank-sync`,
`bank-connect`, `bank-disconnect` and `payment-initiate` call `resolveBankingAdapter()` once per
invocation instead of `getBanksapi()` directly; everything downstream of that call already works in
terms of `GenericBankAccount`/`GenericBankTransaction`, so swapping the registered provider is the
only thing that changes.

## What this file must never contain

A client's name, a `tenant_id` column, or a vendor call made outside an adapter file. If a second
banking vendor is ever added, it is a new file beside `banksapi-adapter.ts` and one more branch in
`resolveBankingAdapter()` — nothing else changes.
