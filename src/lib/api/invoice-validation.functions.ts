// Validating an invoice against what the database actually holds, server-side.
//
// The SAME function the screens use: `belegNachgeprueft` in
// src/features/invoice-detail/nachpruefung.ts, which is a rule-for-rule port of the ingest
// pipeline's own validate() (book-keeping, src/core/rules/packs/german_invoice). One
// implementation, three callers: the invoice list, the detail screen, and this endpoint.
//
// Why an endpoint exists at all: an integration or a job that wants "is this invoice still in
// review, and why" should not have to reimplement fourteen checks in SQL. Read-only, and it
// stores nothing: the verdict is derived from the row every time it is asked for.
//
// `validation_detail` is never written here. That column is the record of what the extraction
// found, and a correction must not be able to erase it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { belegNachgeprueft } from "@/features/invoice-detail/nachpruefung";
import { validierungDetail } from "@/features/invoice-detail/pruefung";
import type { Beleg } from "@/lib/data/types";
import { NotFoundError } from "./errors";
import { TABLE } from "@/lib/data/tables";

// invoices is not in the generated Database type, so reads/writes go through an untyped client,
// same convention as the rest of src/lib/api.
type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const Eingabe = z.object({ invoiceId: z.string().uuid() });

export interface PruefErgebnis {
  invoiceId: string;
  /** Every check, merged: the pipeline's verdict with the verified corrections over the top. */
  checks: Record<string, { status: string; source?: string; message?: string }>;
  /** The checks that are still a problem. Same list the review card renders. */
  offen: string[];
  /** The checks that pass only because the data was corrected after ingest. */
  korrigiert: string[];
}

export const validateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Eingabe.parse(input))
  .handler(async ({ data, context }): Promise<PruefErgebnis> => {
    // The middleware puts a service-role client on the context; typed loosely here because
    // `invoices` is not in the generated Database type.
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from(TABLE.documents)
      .select("*")
      .eq("id", data.invoiceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundError(`No invoice ${data.invoiceId}`);
    const beleg = row as Beleg;

    // The supplier's IBAN, so the three transfer checks can run. Without it they are skipped and
    // whatever the row already recorded for them is kept: not knowing is not the same as failing.
    let lieferantIban: string | null | undefined;
    if (beleg.supplier_id) {
      const { data: lieferant } = await db
        .from(TABLE.suppliers)
        .select("iban")
        .eq("id", beleg.supplier_id)
        .maybeSingle();
      lieferantIban = (lieferant as { iban: string | null } | null)?.iban ?? null;
    }

    const geprueft = belegNachgeprueft(beleg, { lieferantIban });
    const detail = validierungDetail(geprueft) ?? {};

    const checks: PruefErgebnis["checks"] = {};
    const offen: string[] = [];
    const korrigiert: string[] = [];
    for (const [feld, eintrag] of Object.entries(detail)) {
      const status = (eintrag.status ?? "").trim().toLowerCase();
      checks[feld] = { status, source: eintrag.source, message: eintrag.message };
      // Same allow-list the review card uses: 'ok' passed, 'not_applicable'/'skipped' never ran,
      // anything else is a problem. See detailFehlgeschlagen in pruefung.ts.
      if (status && status !== "ok" && status !== "not_applicable" && status !== "skipped") {
        offen.push(feld);
      }
      if (eintrag.source) korrigiert.push(feld);
    }

    return { invoiceId: beleg.id, checks, offen, korrigiert };
  });
