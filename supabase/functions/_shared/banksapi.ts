// BANKSapi wrapper — single interface, two implementations selected by BANKSAPI_MODE
// ("mock" default | "live"). Return shapes are identical in both modes so the sync,
// mapping, and matching code is mode-agnostic. BANKSapi secrets live only in the
// function env (Supabase secrets) — never in the frontend.
//
// Live flow (ONE/Connect, tenant `oneconnect`, cut over 2026-08-05 from the old
// wtdigitaltest/Basic-Auth tenant — see docs/BANKSAPI_SANDBOX_ONBOARDING.md):
//   X-API-KEY -> POST /one/bc-token -> single token, good for providers AND customer
//   endpoints (confirmed live: its scope already covers customer/read, customer/modify,
//   customer/ueberweisung, provider/read — no separate client/user grant needed).
//   POST /customer/v2/bankzugaenge -> 451 + Location (REG/Protect webform)
// Gotchas baked in: .trim() every token; Customer-IP-Address must be a public IPv4;
// error bodies may be non-JSON.

import mockAccounts from "./mock/accounts.json" with { type: "json" };
import mockTransactions from "./mock/transactions.json" with { type: "json" };
import mockPayments from "./mock/payments.json" with { type: "json" };

export interface BanksapiAccount {
  produktId: string;
  kontoName: string;
  iban: string;
  bic: string;
  inhaber: string;
  produktTyp: string;
  kreditinstitut: string;
  waehrung: string;
  saldo: number | null;
  saldoDatum: string | null;
  eigenesKonto?: boolean;
  hasTransactions: boolean;
}

export interface BanksapiTransaction {
  produktId?: string; // mock routing helper only; absent in live responses
  hash: string;
  betrag: number;
  waehrung?: string; // absent in live kontoumsaetze — defaults to EUR
  buchungsdatum: string | null;
  wertstellungsdatum: string | null;
  verwendungszweck: string | null;
  buchungstext: string | null;
  gegenkontoInhaber: string | null;
  gegenkontoIban: string | null;
  gegenkontoBic: string | null;
}

export interface BanksapiAccess {
  accessId: string;
  providerId: string;
  providerName: string;
  bankName: string;
  bankprodukte: BanksapiAccount[];
}

export interface BankConnectSession {
  webformUrl: string;
  accessId: string;
}

// Payment-initiation types (docs/BANKSAPI_PAYMENT_INITIATION.md §3). Kept separate from the
// read-side BanksapiWrapper on purpose -- see getBanksapiForPayments()'s own mode switch below.
export interface BanksapiPaymentRequest {
  recipientIban: string;
  recipientBic?: string;
  recipientName: string;
  amount: number;
  currency: string;
  reference: string;
  // SEPA end-to-end id -- our only reliable hook back to the originating payment_orders
  // row once the transfer leaves our system. Callers should pass a stable id of their own
  // (e.g. the payment_orders row id), not a human-readable string.
  endToEndId: string;
}

export interface BanksapiPaymentSession {
  paymentId: string;
  status: string;
  webformUrl?: string;
}

export interface BanksapiPaymentStatus {
  status: string;
  reason?: string;
}

export interface BanksapiPaymentWrapper {
  mode: "mock" | "live";
  initiatePayment(
    accessId: string,
    productId: string,
    request: BanksapiPaymentRequest,
    callbackUrl: string,
    customerIp: string,
  ): Promise<BanksapiPaymentSession>;
  getPaymentStatus(accessId: string, paymentId: string): Promise<BanksapiPaymentStatus>;
}

export interface BanksapiWrapper {
  mode: "mock" | "live";
  getProviders(): Promise<unknown>;
  getBankAccesses(): Promise<BanksapiAccess[]>;
  createBankAccessSession(callbackUrl: string, customerIp: string): Promise<BankConnectSession>;
  deleteRegProtectSessions(): Promise<{ rows: number }>;
  /**
   * Detach one bank access at BANKSapi: DELETE /customer/v2/bankzugaenge/{access-id}.
   *
   * The only per-bank removal the API offers. There is no per-ACCOUNT delete at all, which is why
   * switching a single account off in the Hub is a local flag and this is the whole-bank action.
   */
  deleteBankAccess(accessId: string): Promise<void>;
  getBankAccessIssues(accessId: string): Promise<unknown>;
  getTransactions(
    accessId: string,
    productId: string,
    opts?: { from?: string | null },
  ): Promise<BanksapiTransaction[]>;
  dateFilterRejected(): boolean;
}

// BANKS/Connect GetTransactions takes `from` as an ISO 8601 timestamp, not a date
// (example 2022-02-20T00:00:00). A bare YYYY-MM-DD is refused.
function fromTimestamp(isoDate: string): string {
  return isoDate.length === 10 ? `${isoDate}T00:00:00` : isoDate;
}

const MOCK_ACCESS_ID = "mock-access-1";

// ---------------------------------------------------------------------------
// Mock implementation — no network. Deterministic.
// ---------------------------------------------------------------------------
function mockWrapper(): BanksapiWrapper {
  const accounts = (mockAccounts as Partial<BanksapiAccount>[]).map((a) => ({
    kreditinstitut: "",
    hasTransactions: true,
    ...a,
  })) as BanksapiAccount[];
  const transactions = mockTransactions as BanksapiTransaction[];
  return {
    mode: "mock",
    getProviders: () =>
      Promise.resolve([{ id: "00000000-0000-0000-0000-000000000000", name: "Demo Provider" }]),
    getBankAccesses: () =>
      Promise.resolve([
        {
          accessId: MOCK_ACCESS_ID,
          providerId: "00000000-0000-0000-0000-000000000000",
          providerName: "Demo Provider",
          bankName: "Demo Bank",
          bankprodukte: accounts,
        },
      ]),
    createBankAccessSession: (callbackUrl: string) =>
      Promise.resolve({
        webformUrl: `https://example.invalid/mock-webform?callback=${encodeURIComponent(callbackUrl)}`,
        accessId: MOCK_ACCESS_ID,
      }),
    deleteRegProtectSessions: () => Promise.resolve({ rows: 0 }),
    deleteBankAccess: () => Promise.resolve(),
    getBankAccessIssues: () => Promise.resolve({ issues: [] }),
    getTransactions: (_accessId: string, productId: string, opts: { from?: string | null } = {}) =>
      Promise.resolve(
        transactions.filter(
          (t) => t.produktId === productId && (!opts.from || (t.buchungsdatum ?? "") >= opts.from),
        ),
      ),
    dateFilterRejected: () => false,
  };
}

// Mock scenario list (supabase/functions/_shared/mock/payments.json): each entry's `trigger`
// is matched against the payment reference so a test invoice can be named to force an outcome
// (mirrors the sandbox demo webform login `test_failing_payment`, docs/BANKSAPI_SANDBOX_ONBOARDING.md).
interface MockPaymentScenario {
  trigger: string;
  outcome: "executed" | "failed";
  reason?: string;
}
const MOCK_PAYMENT_SCENARIOS = mockPayments as MockPaymentScenario[];

// ---------------------------------------------------------------------------
// Mock payment implementation — no network, stateless. A Deno Edge Function instance cannot be
// relied on to keep memory between calls, so the outcome is encoded in the mock paymentId itself
// (e.g. mock-payment-failed-<uuid>) rather than held in a variable -- getPaymentStatus() decodes
// it back out instead of looking anything up.
// ---------------------------------------------------------------------------
function mockPaymentWrapper(): BanksapiPaymentWrapper {
  return {
    mode: "mock",
    initiatePayment: (_accessId, _productId, request, callbackUrl, _customerIp) => {
      const scenario = MOCK_PAYMENT_SCENARIOS.find((s) =>
        request.reference.toLowerCase().includes(s.trigger.toLowerCase()),
      );
      const outcome = scenario?.outcome ?? "executed";
      const paymentId = `mock-payment-${outcome}-${crypto.randomUUID()}`;
      return Promise.resolve({
        paymentId,
        status: "pending_sca",
        webformUrl: `https://example.invalid/mock-payment-webform?paymentId=${paymentId}&callback=${encodeURIComponent(callbackUrl)}`,
      });
    },
    getPaymentStatus: (_accessId, paymentId) => {
      const outcome = paymentId.includes("mock-payment-failed-") ? "failed" : "executed";
      const reason =
        outcome === "failed"
          ? MOCK_PAYMENT_SCENARIOS.find((s) => s.outcome === "failed")?.reason
          : undefined;
      return Promise.resolve({ status: outcome, reason });
    },
  };
}

// Raw shapes of /customer/v2/payment/bulk-transfer responses (only the fields we use).
// `messages[]` is how BANKSapi reports outcome for this endpoint -- there is no clean
// `status` field (confirmed against the OpenAPI spec's GetBulkTransfer/BulkTransferResult
// schema, matches earlier research on the single-transfer endpoint).
interface BulkTransferMessageRaw {
  level?: string; // "INFO" | "ERROR"
  code?: string; // e.g. "BA1111", see mapBulkTransferMessages
  message?: string;
  details?: string;
}
interface BulkTransferResultRaw {
  messages?: BulkTransferMessageRaw[];
  relations?: BanksapiRelationRaw[];
  transfer?: { paymentId?: string };
}

// Message-code -> our status mapping. Grounded in the OpenAPI spec's documented code
// glossary (BA1111/BA1112/error codes), NOT verified against a real completed payment --
// the sandbox bank never drives a transfer to a final booked state (see
// docs/BANKSAPI_PAYMENT_INITIATION.md's 2026-08-05 note). Deliberately conservative:
// anything unrecognized falls through to "pending" rather than a guessed "executed", since
// an under-detected completed payment is still caught later by ordinary bank-transaction
// matching, while a false "executed" would wrongly mark an invoice paid.
function mapBulkTransferMessages(
  messages: BulkTransferMessageRaw[] | undefined,
): BanksapiPaymentStatus {
  const list = messages ?? [];
  const errors = list.filter((m) => m.level === "ERROR");
  if (errors.length > 0) {
    return { status: "failed", reason: errors.map((m) => m.message ?? m.code).join("; ") };
  }
  if (list.some((m) => m.code === "BA1111")) return { status: "executed" };
  if (list.some((m) => m.code === "BA1112")) return { status: "authorized" };
  return { status: "pending" };
}

// ---------------------------------------------------------------------------
// Live payment implementation (docs/BANKSAPI_PAYMENT_INITIATION.md, 2026-08-05 update).
// Uses POST /customer/v2/payment/bulk-transfer (a single-element transferDetails[] even
// for one payment) -- confirmed by the client's own live-verified integration brief, and
// by the OpenAPI spec's PaymentInitializationDetails/BasicBulkTransferData/BulkTransferResult
// schemas. Same REG/Protect webform + 451 pattern as createBankAccessSession; VoP happens
// automatically inside that webform, there is no separate VoP API call.
// ---------------------------------------------------------------------------
function livePaymentWrapper(): BanksapiPaymentWrapper {
  const baseUrl = Deno.env.get("BANKSAPI_BASE_URL") ?? "https://banksapi.io";
  const apiKey = Deno.env.get("BANKSAPI_ONE_CONNECT_API_KEY") ?? "";

  // Own token cache, deliberately separate from liveWrapper()'s -- the two wrappers are
  // constructed independently (getBanksapi() vs getBanksapiForPayments()) and were already
  // split before this change; not worth merging them into shared module state for this fix.
  let token: { value: string; expiresAt: number } | null = null;
  async function getToken(): Promise<string> {
    const now = Date.now();
    if (token && token.expiresAt > now + 60_000) return token.value;
    const res = await fetch(`${baseUrl}/one/bc-token`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey },
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(
        `BANKSapi ONE/Connect token request failed (${res.status}): ${raw.slice(0, 300)}`,
      );
    }
    const json = JSON.parse(raw);
    if (!json.access_token) throw new Error("BANKSapi token response missing access_token");
    const value = String(json.access_token).trim();
    token = { value, expiresAt: now + 7_000_000 };
    return value;
  }

  return {
    mode: "live",
    initiatePayment: async (accessId, productId, request, callbackUrl, customerIp) => {
      const envIp = (Deno.env.get("BANKSAPI_CUSTOMER_IP") ?? "").trim();
      const ip = isPublicIpv4(customerIp)
        ? customerIp.trim()
        : isPublicIpv4(envIp)
          ? envIp
          : "203.0.113.1";

      const token = await getToken();

      // We don't persist a BANKSapi provider id anywhere in bank_connections -- look it up
      // live from the same bank-accesses response getBankAccesses() already reads.
      const accessesRaw = (await (async () => {
        const res = await fetch(`${baseUrl}/customer/v2/bankzugaenge`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`BANKSapi bankzugaenge lookup failed (${res.status})`);
        return (await res.json()) as Record<string, BanksapiAccessRaw>;
      })()) as Record<string, BanksapiAccessRaw>;
      const provider = accessesRaw[accessId]?.providerId;
      if (!provider) {
        throw new Error(`BANKSapi bank access ${accessId} not found or has no providerId`);
      }

      const url = new URL(`${baseUrl}/customer/v2/payment/bulk-transfer`);
      url.searchParams.set("callbackUrl", callbackUrl);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Customer-IP-Address": ip,
        },
        body: JSON.stringify({
          provider,
          product: productId,
          instant: false,
          transferDetails: [
            {
              recipient: request.recipientName,
              purpose: request.reference,
              iban: request.recipientIban,
              bic: request.recipientBic,
              currency: request.currency,
              amount: request.amount,
              endToEndId: request.endToEndId,
            },
          ],
        }),
        redirect: "manual",
      });

      if (res.status !== 451) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        throw new Error(`BANKSapi bulk-transfer failed (${res.status}): ${detail}`);
      }

      const location = res.headers.get("Location") ?? res.headers.get("Content-Location");
      const body = (await res.json().catch(() => null)) as BulkTransferResultRaw | null;
      const relations = body?.relations ?? [];
      const paymentId =
        body?.transfer?.paymentId ??
        relations
          .find((r) => r.rel === "self")
          ?.href.split("/")
          .pop();
      const webformHref = relations.find((r) => r.rel === "get_webform")?.href ?? location;
      if (!paymentId || !webformHref) {
        throw new Error(
          `BANKSapi bulk-transfer 451 response missing paymentId/webform link (Customer-IP-Address ${ip})`,
        );
      }

      const webformUrl = new URL(webformHref);
      webformUrl.searchParams.set("callbackUrl", callbackUrl);
      return { paymentId, status: "pending_sca", webformUrl: webformUrl.toString() };
    },
    getPaymentStatus: async (_accessId, paymentId) => {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/customer/v2/payment/bulk-transfer/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      if (!res.ok)
        throw new Error(`BANKSapi payment status failed (${res.status}): ${raw.slice(0, 300)}`);
      if (!raw || raw.trim() === "") return { status: "pending" };
      const body = JSON.parse(raw) as BulkTransferResultRaw & {
        messages?: BulkTransferMessageRaw[];
      };
      return mapBulkTransferMessages(body.messages);
    },
  };
}

export function getBanksapiForPayments(): BanksapiPaymentWrapper {
  // Deliberately independent of BANKSAPI_MODE (the read-side switch) -- see
  // docs/BANKSAPI_PAYMENT_INITIATION.md §1 for why reusing that flag would either force
  // reconciliation to mock just to test payments safely, or leave payments live by accident.
  const mode = (Deno.env.get("BANKSAPI_PAYMENT_MODE") ?? "mock").toLowerCase();
  return mode === "live" ? livePaymentWrapper() : mockPaymentWrapper();
}

// Raw shapes of the real /customer/v2/bankzugaenge response (only the fields we map).
interface BanksapiRelationRaw {
  rel: string;
  href: string;
}
interface BanksapiProduktRaw {
  id: string;
  bezeichnung?: string;
  kategorie?: string;
  iban?: string;
  bic?: string;
  inhaber?: string;
  waehrung?: string;
  saldo?: number;
  saldoDatum?: string;
  kreditinstitut?: string;
  relations?: BanksapiRelationRaw[];
}
interface BanksapiAccessRaw {
  id: string;
  providerId?: string;
  bankprodukte?: BanksapiProduktRaw[];
}

// Follow a BANKSapi next-page link if the kontoumsaetze response provides one (HAL-style
// `_links.next` or a `relations` entry). Returns a path (origin stripped so userGet can
// re-prepend the base URL), or "" when there is no further page.
// BANKSapi rejects Customer-IP-Address values that are not a routable public IPv4
// (127.0.0.1, RFC1918, CGNAT, link-local, and any IPv6 all come back as 400). Supabase
// forwards the real client IP in x-forwarded-for, which is frequently IPv6, so the value
// has to be screened before it is sent upstream.
export function isPublicIpv4(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return false;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (n.some((x) => x < 0 || x > 255)) return false;
  const [a, b] = n;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast / reserved
  return true;
}

function nextPageHref(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { _links?: { next?: unknown }; relations?: { rel?: string; href?: string }[] };
  let href: string | undefined;
  const next = d._links?.next;
  if (typeof next === "string") href = next;
  else if (next && typeof next === "object") href = (next as { href?: string }).href;
  if (!href && Array.isArray(d.relations)) {
    href = d.relations.find((r) => /next|naechste|weiter/i.test(String(r?.rel ?? "")))?.href;
  }
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) {
    const u = new URL(href);
    return u.pathname + u.search;
  }
  return href.startsWith("/") ? href : `/${href}`;
}

// ---------------------------------------------------------------------------
// Live implementation — real BANKSapi calls (exercised only when BANKSAPI_MODE=live).
// ---------------------------------------------------------------------------
function liveWrapper(): BanksapiWrapper {
  const baseUrl = Deno.env.get("BANKSAPI_BASE_URL") ?? "https://banksapi.io";
  const apiKey = Deno.env.get("BANKSAPI_ONE_CONNECT_API_KEY") ?? "";

  let token: { value: string; expiresAt: number } | null = null;
  let dateFilterRejected = false;

  async function getToken(): Promise<string> {
    const now = Date.now();
    if (token && token.expiresAt > now + 60_000) return token.value;
    const res = await fetch(`${baseUrl}/one/bc-token`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey },
    });
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(
        `BANKSapi ONE/Connect token request failed (${res.status}): ${raw.slice(0, 300)}`,
      );
    }
    const json = JSON.parse(raw);
    if (!json.access_token) throw new Error("BANKSapi token response missing access_token");
    const value = String(json.access_token).trim(); // trailing space breaks downstream calls
    token = { value, expiresAt: now + 7_000_000 }; // ~2h, refresh early
    return value;
  }

  async function userGet(path: string): Promise<unknown> {
    const token = await getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`BANKSapi GET ${path} failed (${res.status})`);
    if (!raw || raw.trim() === "") return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`BANKSapi GET ${path} returned non-JSON`);
    }
  }

  return {
    mode: "live",
    getProviders: async () => {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/providers/v2`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`BANKSapi providers failed (${res.status})`);
      return await res.json();
    },
    getBankAccesses: async () => {
      // /customer/v2/bankzugaenge is an object keyed by bank-access id; each access
      // holds bankprodukte[]. A product's `id` (often the IBAN) is what the
      // kontoumsaetze URL uses. Payment relations are intentionally ignored.
      const data = (await userGet("/customer/v2/bankzugaenge")) as Record<
        string,
        BanksapiAccessRaw
      >;
      return Object.values(data).map((entry) => {
        const produkte = entry.bankprodukte ?? [];
        const providerName = produkte[0]?.kreditinstitut ?? "";
        return {
          accessId: String(entry.id),
          providerId: String(entry.providerId ?? ""),
          providerName,
          bankName: providerName,
          bankprodukte: produkte.map((p) => ({
            produktId: String(p.id),
            kontoName: String(p.bezeichnung ?? p.kategorie ?? p.id),
            iban: String(p.iban ?? ""),
            bic: String(p.bic ?? ""),
            inhaber: String(p.inhaber ?? ""),
            produktTyp: String(p.kategorie ?? ""),
            kreditinstitut: String(p.kreditinstitut ?? ""),
            waehrung: String(p.waehrung ?? "EUR"),
            saldo: typeof p.saldo === "number" ? p.saldo : null,
            saldoDatum: p.saldoDatum ? String(p.saldoDatum).slice(0, 10) : null,
            eigenesKonto: true,
            hasTransactions: (p.relations ?? []).some((r) => r.rel === "get_kontoumsaetze"),
          })),
        };
      });
    },
    createBankAccessSession: async (callbackUrl: string, customerIp: string) => {
      // Fall back to a routable placeholder when the caller's IP is unusable (IPv6 client,
      // local dev). BANKSAPI_CUSTOMER_IP lets an operator pin a known-good public IPv4.
      const envIp = (Deno.env.get("BANKSAPI_CUSTOMER_IP") ?? "").trim();
      const ip = isPublicIpv4(customerIp)
        ? customerIp.trim()
        : isPublicIpv4(envIp)
          ? envIp
          : "203.0.113.1";

      const post = async () => {
        const token = await getToken();
        const accessId = crypto.randomUUID();
        // maxTransactions=all: default is 90 days only, and requesting more later on an
        // already-connected account almost always forces a fresh TAN per bank -- get it
        // right on first connect (client-verified, docs/BANKSAPI_SANDBOX_ONBOARDING.md).
        const res = await fetch(`${baseUrl}/customer/v2/bankzugaenge?maxTransactions=all`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Customer-IP-Address": ip,
          },
          body: JSON.stringify({ [accessId]: {} }),
          redirect: "manual",
        });
        // The webform URL arrives as a redirect target on 451; some gateways relay it in
        // Content-Location instead. Keep the body around: on failure it is the only clue.
        const location = res.headers.get("Location") ?? res.headers.get("Content-Location");
        const detail = location ? "" : (await res.text().catch(() => "")).slice(0, 500);
        return { res, accessId, location, detail };
      };

      let attempt = await post();
      if (!attempt.location) {
        // A REG/Protect session left open by an abandoned webform blocks new ones. Clearing
        // them is the documented recovery, and only ever discards incomplete sessions.
        try {
          const token = await getToken();
          await fetch(`${baseUrl}/customer/v2/regprotect/sessions`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Best effort — report the original failure below if the retry also fails.
        }
        attempt = await post();
      }

      const { res, accessId, location, detail } = attempt;
      if (!location) {
        throw new Error(
          `BANKSapi bank access failed (${res.status}, Customer-IP-Address ${ip})` +
            (detail ? `: ${detail}` : " — no Location header and no response body"),
        );
      }

      // Location may or may not already carry a query string; never assume a "?" is present.
      const webformUrl = new URL(location);

      // Embed OUR accessId into the callbackUrl before handing it over. Confirmed live
      // 2026-08-05: BANKSapi's redirect back carries ONLY `baReentry` -- no access id at all --
      // so without this the callback has nothing to match the connection row on, and every
      // connection stays "pending" even after a successful ACCOUNT_CREATED. BANKSapi preserves
      // query params already present on callbackUrl, which is the same mechanism
      // payment-callback relies on for its orderId (immonetz commit aa2284a).
      const cb = new URL(callbackUrl);
      cb.searchParams.set("accessId", accessId);
      webformUrl.searchParams.set("callbackUrl", cb.toString());
      return { webformUrl: webformUrl.toString(), accessId };
    },
    deleteRegProtectSessions: async () => {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/customer/v2/regprotect/sessions`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`BANKSapi delete sessions failed (${res.status})`);
      return await res.json();
    },
    deleteBankAccess: async (accessId: string) => {
      const token = await getToken();
      const res = await fetch(`${baseUrl}/customer/v2/bankzugaenge/${accessId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      // 404 counts as success: the access is gone, which is the whole point of the call. Treating
      // it as an error would leave a connection that cannot be detached because it already was.
      if (!res.ok && res.status !== 404) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `BANKSapi delete bank access failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }
    },
    getBankAccessIssues: (accessId: string) =>
      userGet(`/customer/v2/bankzugaenge/${accessId}/issues`),
    getTransactions: async (
      accessId: string,
      productId: string,
      opts: { from?: string | null } = {},
    ) => {
      const base = `/customer/v2/bankzugaenge/${accessId}/${productId}/kontoumsaetze`;

      const fetchAllPages = async (withFrom: boolean): Promise<BanksapiTransaction[]> => {
        const out: BanksapiTransaction[] = [];
        const seen = new Set<string>();
        const MAX_PAGES = 50; // safety cap: ~tens of thousands of lines at typical page sizes
        const params = new URLSearchParams();
        if (withFrom && opts.from) params.set("from", fromTimestamp(opts.from));
        let path: string = params.toString() ? `${base}?${params.toString()}` : base;

        for (let page = 0; page < MAX_PAGES && path; page++) {
          const data = (await userGet(path)) as
            { kontoumsaetze?: BanksapiTransaction[] } | BanksapiTransaction[];
          const list = Array.isArray(data) ? data : (data.kontoumsaetze ?? []);
          for (const t of list) {
            if (t?.hash) {
              if (seen.has(t.hash)) continue; // guard against overlapping pages
              seen.add(t.hash);
            }
            out.push(t);
          }
          path = Array.isArray(data) ? "" : nextPageHref(data);
        }
        return out;
      };

      if (!opts.from || dateFilterRejected) return await fetchAllPages(false);
      try {
        return await fetchAllPages(true);
      } catch {
        dateFilterRejected = true;
        return await fetchAllPages(false);
      }
    },
    dateFilterRejected: () => dateFilterRejected,
  };
}

export function getBanksapi(): BanksapiWrapper {
  const mode = (Deno.env.get("BANKSAPI_MODE") ?? "mock").toLowerCase();
  return mode === "live" ? liveWrapper() : mockWrapper();
}

// Whether a newly-created bank_connections row should be flagged is_sandbox. Mock mode never
// talks to BANKSapi at all, so it is always sandbox. Live mode calls BANKSapi for real, but
// BANKSapi's own account can still be pointed at their sandbox/demo-bank tenant rather than a
// real production bank -- mode alone can't tell those apart, so BANKSAPI_ENV is the operator's
// manual say-so for that case (defaults to sandbox; flip to "production" only once you're
// actually connecting the real bank). Called ONLY when a connection is first created
// (bank-connect, or bank-sync's fallback insert) -- never re-derived on later syncs, since that
// silently overwrote already-classified rows (see bank-sync/index.ts's connectionIsSandbox).
export function isSandboxConnection(mode: "mock" | "live"): boolean {
  if (mode === "mock") return true;
  return (Deno.env.get("BANKSAPI_ENV") ?? "sandbox") !== "production";
}
