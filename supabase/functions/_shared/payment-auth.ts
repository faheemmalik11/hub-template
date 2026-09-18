import { TABLE } from "./tables.ts";
// Shared caller-identity + role check for the payment-* Edge Functions (payment-initiate,
// payment-cancel) — the only Edge Functions in this project that independently verify the
// caller's role server-side, since they move money or change the audit trail of a money-moving
// record, and payment_orders' own RLS only gates the client-writable draft insert, not what these
// functions actually do afterward.

// deno-lint-ignore no-explicit-any
type Db = any;

// The gateway already verified this JWT's signature before invoking the function (verify_jwt is
// NOT disabled for these endpoints in config.toml, unlike the public bank-callback/payment-callback
// endpoints) -- decoding the payload here to read the `email` claim is the same trust boundary
// Postgres's own auth.jwt()->>'email' relies on inside has_company_access()/current_role_name().
export function callerEmailFromAuthHeader(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export interface PaymentCaller {
  id: string;
  name: string | null;
}

// Mirrors istLastschrift() in src/lib/data/format.ts. Duplicated rather than imported: an Edge
// Function cannot reach into the Vite app's source. Keep the two in step -- same three substrings.
export function isDirectDebit(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  const s = paymentMethod.toLowerCase();
  return s.includes("lastschrift") || s.includes("einzug") || s.includes("abbuch");
}

// Returns WHO the caller is, not just whether they may pass. The two-person rule needs the
// identity to compare against invoices.approved_by, and resolving it twice would let the two
// lookups disagree.
// The permission the payment endpoints require. The only project-specific string in this module;
// it matches PERMISSIONS.invoicesPay in src/lib/permissions.ts and the key in
// supabase/permissions.seed.sql. A different Hub swaps those two and this one.
const PAY_PERMISSION = "invoices.pay";

export async function requirePaymentRight(db: Db, email: string | null): Promise<PaymentCaller> {
  if (!email) throw new Error("no caller identity on the request");
  const { data: caller } = await db
    .from(TABLE.appUsers)
    .select("id, name, is_active, role_id")
    .ilike("email", email)
    .maybeSingle();
  const row = caller as unknown as {
    id: string;
    name: string | null;
    is_active: boolean;
    role_id: string | null;
  } | null;
  if (!row || !row.is_active) {
    throw new Error("account is not active");
  }

  // Resolved the same way current_permissions() does: a personal override wins, otherwise the
  // role's default. Not a role check -- a hardcoded role list here would silently override the
  // Payment switch on Team & Rollen, so switching it on for someone would not actually let them
  // pay. This runs on the service-role client, which has no JWT, so has_permission() (which reads
  // auth.jwt()) cannot be used and the same rule is applied explicitly.
  const { data: override } = await db
    .from(TABLE.userPermissions)
    .select("granted")
    .eq("user_id", row.id)
    .eq("permission_key", PAY_PERMISSION)
    .maybeSingle();

  let allowed = (override as { granted: boolean } | null)?.granted ?? null;
  if (allowed === null) {
    const { data: fromRole } = await db
      .from(TABLE.rolePermissions)
      .select("permission_key")
      .eq("role_id", row.role_id)
      .eq("permission_key", PAY_PERMISSION)
      .maybeSingle();
    allowed = !!fromRole;
  }
  if (!allowed) {
    throw new Error("this account does not have the payment permission");
  }
  return { id: row.id, name: row.name };
}

// The two-person rule (Vier-Augen-Prinzip): the person who gave the final approval may not release
// the payment. Enforced here as well as in payment_orders' INSERT policy, because this is the only
// layer that can say WHY, and a silent RLS refusal on a money-moving call reads as a broken button.
export function refuseIfApprover(
  caller: PaymentCaller,
  invoice: { approved_by?: string | null },
): void {
  if (invoice.approved_by && invoice.approved_by === caller.id) {
    throw new Error(
      "the person who approved this invoice may not also pay it — a second person has to release the payment",
    );
  }
}
