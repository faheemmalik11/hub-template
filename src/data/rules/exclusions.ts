import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { fetchAllRows, invalidateMatchState, requiredReason } from "@/data/shared";
import { OPOS_TERM_MIN_LENGTH } from "@/lib/data/opos";
import type {
  Exclusion,
  OposCategory,
  OposWhitelistRule,
  OposWhitelistScope,
} from "@/lib/data/types";

// ---- Import exclusion rules (ingest_exclusions; migrations 0008/0015 scopes, 0016 RLS) ----
// A rule excludes matching mail/invoices from import. Table postdates the generated Database type,
// so read/write via the untyped `sb`. Soft-deletable; deactivating a rule keeps the row.

/**
 * How much a not-yet-saved exclusion rule would actually catch.
 *
 * An over-broad exclusion is the hardest rule in the app to notice after the fact: a wrong
 * assignment/VAT/approval rule still leaves the invoice visible somewhere to be corrected, but an
 * exclusion means the invoice is never created, so nothing appears anywhere to be missing. The
 * dialog offered no preview at all, while the three comparable rule dialogs all do.
 *
 * Only the scopes with a truthful local source are supported:
 *   sender / subject  -> processing_log, which is what the pre-read scopes actually match against
 *   party / supplier  -> invoices.issuer, the post-read counterparty
 * filename, envelope, body, company and property have no column here that means the same thing, so
 * they report `supported: false` rather than a fabricated zero -- a preview that silently says "0"
 * for a scope it cannot check is worse than no preview.
 */
export type ExclusionImpact =
  { supported: false } | { supported: true; match: number; population: number; source: string };

export function useExclusionImpact(scope: string, term: string, enabled: boolean) {
  const searchTerm = term.trim();
  return useQuery({
    queryKey: ["exclusion_impact", scope, searchTerm],
    enabled: enabled && searchTerm.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<ExclusionImpact> => {
      const source =
        scope === "sender" || scope === "subject"
          ? { table: TABLE.processingLog, column: scope }
          : scope === "party" || scope === "supplier"
            ? { table: TABLE.documents, column: "issuer" }
            : null;
      if (!source) return { supported: false };

      // % and _ are LIKE wildcards; a term containing them would silently widen the preview
      // relative to the rule it is previewing. Postgres LIKE takes backslash as the escape by default.
      const escaped = searchTerm.replace(/([\\%_])/g, "\\$1");

      const [match, total] = await Promise.all([
        (async () => {
          const { count, error } = await sb
            .from(source.table)
            .select("id", { count: "exact", head: true })
            .ilike(source.column, `%${escaped}%`);
          if (error) throw error;
          return count ?? 0;
        })(),
        (async () => {
          const { count, error } = await sb
            .from(source.table)
            .select("id", { count: "exact", head: true });
          if (error) throw error;
          return count ?? 0;
        })(),
      ]);
      return { supported: true, match, population: total, source: source.table };
    },
  });
}

export function useExclusions() {
  return useQuery({
    queryKey: ["exclusions"],
    staleTime: STALE,
    queryFn: async (): Promise<Exclusion[]> => {
      const { data, error } = await sb
        .from(TABLE.ingestExclusions)
        .select("*")
        .is("deleted_at", null)
        .order("scope", { ascending: true })
        .order("term", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Exclusion[];
    },
  });
}

export function useCreateExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      scope: Exclusion["scope"];
      term: string;
      note?: string | null;
    }): Promise<Exclusion> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.ingestExclusions)
        .insert({
          scope: values.scope,
          term: values.term.trim(),
          is_active: true,
          note: values.note?.trim() || null,
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Exclusion;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exclusions"] }),
  });
}

export function useUpdateExclusion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: Partial<Pick<Exclusion, "is_active" | "term" | "note" | "scope">>,
    ) => {
      const payload: Record<string, unknown> = { ...changes, updated_at: new Date().toISOString() };
      if (typeof payload.term === "string") payload.term = (payload.term as string).trim();
      const { error } = await sb.from(TABLE.ingestExclusions).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exclusions"] }),
  });
}

// Soft-delete (audit-preserving): stamp deleted_* and turn the rule off so it stops matching.
export function useDeleteExclusion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.ingestExclusions)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: "removed via UI",
          is_active: false,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exclusions"] }),
  });
}

// ---- OPOS whitelist rules (opos_whitelist_rules; pipeline migration 0018) ----
// Transactions that can never have a receipt must be hideable, otherwise the real missing receipt gets
// lost in the open-items list (Briefing Screen 10). A matching rule parks the transaction in
// matching_status='ignored' — the state the Offene-Posten query and the bank-sync matcher already
// skip. Same shape and same soft-delete behaviour as the exclusion rules above.

// Both invalidations belong together: every write on this screen can change which transactions a
// rule is credited with, and the Treffer column is read straight off that.
function invalidateOposRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["opos_whitelist_rules"] });
  qc.invalidateQueries({ queryKey: ["opos_rule_hit_counts"] });
}

// The row itself records created_by and deleted_by and nothing more, so a term or a category could
// be rewritten with no trace of who changed it or what it used to say — on a rule set that has no
// company_id and therefore hides bookkeeping for every company at once (#7). change_history is the
// generic log /protokoll already reads.
//
// Best-effort on purpose: the rule write has already committed by the time this runs, and failing
// the mutation afterwards would report "Anlegen fehlgeschlagen" for a rule that now exists. Same
// treatment as the match-learning step further down for the same reason.
async function logOposRuleChange(
  id: string,
  type: string,
  text: string | null,
  data: Record<string, unknown> | null = null,
) {
  try {
    await insertChangeHistory("opos_whitelist_rules", id, type, text, data);
  } catch (e) {
    console.warn("change_history entry for OPOS whitelist rule failed", e);
  }
}

export function useOposWhitelistRules() {
  return useQuery({
    queryKey: ["opos_whitelist_rules"],
    staleTime: STALE,
    queryFn: async (): Promise<OposWhitelistRule[]> => {
      const { data, error } = await sb
        .from(TABLE.openItemWhitelistRules)
        .select("*")
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("term", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OposWhitelistRule[];
    },
  });
}

export function useCreateOposWhitelistRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      scope: OposWhitelistScope;
      category: OposCategory;
      term: string;
      note?: string | null;
    }): Promise<OposWhitelistRule> => {
      const actor = await actorEmail();
      const { data, error } = await sb
        .from(TABLE.openItemWhitelistRules)
        .insert({
          scope: values.scope,
          category: values.category,
          term: values.term.trim(),
          is_active: true,
          note: values.note?.trim() || null,
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) throw error;
      const rule = data as OposWhitelistRule;
      await logOposRuleChange(rule.id, "angelegt", rule.term, {
        scope: rule.scope,
        category: rule.category,
        note: rule.note,
      });
      return rule;
    },
    onSuccess: () => invalidateOposRules(qc),
  });
}

export function useUpdateOposWhitelistRule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      changes: Partial<
        Pick<OposWhitelistRule, "is_active" | "term" | "note" | "scope" | "category">
      >,
    ) => {
      const payload: Record<string, unknown> = { ...changes, updated_at: new Date().toISOString() };
      if (typeof payload.term === "string") payload.term = (payload.term as string).trim();
      const { error } = await sb.from(TABLE.openItemWhitelistRules).update(payload).eq("id", id);
      if (error) throw error;
      await logOposRuleChange(id, "geaendert", null, changes);
    },
    // Toggling a rule off stops it matching from here on, but does NOT by itself release the
    // transactions it already hid: apply_opos_whitelist() only re-decides a row when one of the
    // columns in its trigger's UPDATE OF list is written, and switching a rule off writes none of
    // them. That used to be documented on screen as "run pipeline/apply_opos_whitelist.py --revert",
    // a script that exists in no repo here. useReapplyOposWhitelist is the in-product replacement
    // (migration 20260819190000).
    onSuccess: () => invalidateOposRules(qc),
  });
}

// Soft-delete (audit-preserving): stamp deleted_* and turn the rule off so it stops matching.
export function useDeleteOposWhitelistRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const actor = await actorEmail();
      // This used to write the constant "removed via UI" with no way for anyone to say why. The
      // Papierkorb screen renders delete_reason in its Grund column, so every whitelist rule ever
      // removed sat there under the same uninformative, non-German string (#9). The table already
      // carries the trash_require_delete_reason trigger, so a reason is a database-level
      // requirement as well — pflichtGrund is that same rule one step earlier, in a sentence.
      const reason = requiredReason(args.reason);
      const { error } = await sb
        .from(TABLE.openItemWhitelistRules)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: reason,
          is_active: false,
        })
        .eq("id", args.id);
      if (error) throw error;
      await logOposRuleChange(args.id, "geloescht", reason);
    },
    onSuccess: () => invalidateOposRules(qc),
  });
}

// How many transactions each rule is currently hiding — shown on the rules screen so a rule that is
// suppressing far more than expected is visible.
export function useOposRuleHitCounts() {
  return useQuery({
    queryKey: ["opos_rule_hit_counts"],
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, number>> => {
      // Paged. This was a single unpaged select that grows by one row per hidden transaction
      // forever, so crossing the platform's per-request row cap would have made the Treffer column
      // quietly under-report instead of failing (#10) — the worst possible failure on a column
      // people decide to delete rules by. fetchAllRows exists in this file for exactly that.
      const rows = await fetchAllRows<{ whitelist_rule_id: string }>((from, to, withCount) =>
        sb
          .from(TABLE.bankTransactions)
          .select("whitelist_rule_id", withCount ? { count: "exact" } : undefined)
          .not("whitelist_rule_id", "is", null)
          .range(from, to),
      );
      const counts = new Map<string, number>();
      for (const row of rows) {
        counts.set(row.whitelist_rule_id, (counts.get(row.whitelist_rule_id) ?? 0) + 1);
      }
      return counts;
    },
  });
}

/** What a term would catch, counted before the rule exists. */
export interface OposTermImpact {
  match: number;
  population: number;
}

// A rule was saveable with any non-empty string and no indication of what it would take out of the
// reviewer's field of view (#6). The match is a plain substring over normalised text, so a
// two-character term hides most of a ledger, and with scope "any" it is matched against reference,
// counterparty, IBAN and booking text concatenated. /zuordnungsregeln already previews its
// candidates; this is the same idea, counted rather than listed.
//
// An estimate, and labelled as one on screen: opos_norm() also collapses runs of whitespace, which
// ilike does not, so a term containing a double space reads low here. Outgoing only, matching
// apply_opos_whitelist()'s own `amount < 0` guard — incoming credits are never hidden by a rule.
export function useOposTermImpact(scope: OposWhitelistScope, term: string, enabled: boolean) {
  const searchTerm = term.trim();
  return useQuery({
    queryKey: ["opos_term_impact", scope, searchTerm],
    enabled: enabled && searchTerm.length >= OPOS_TERM_MIN_LENGTH,
    staleTime: 30_000,
    queryFn: async (): Promise<OposTermImpact> => {
      // % and _ are LIKE wildcards; a term containing one would silently widen the preview
      // relative to the rule it is previewing. Postgres LIKE takes backslash as the escape.
      const escaped = searchTerm.replace(/([\\%_])/g, "\\$1");
      const columns: Record<OposWhitelistScope, string[]> = {
        reference: ["payment_reference"],
        counterparty: ["counterparty_holder"],
        iban: ["counterparty_iban"],
        booking_text: ["booking_text"],
        any: ["payment_reference", "counterparty_holder", "counterparty_iban", "booking_text"],
      };
      const column = columns[scope];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter = (query: any) => {
        if (column.length === 1) return query.ilike(column[0], `%${escaped}%`);
        // Inside an or() PostgREST reads commas and parentheses as structure, so the value is
        // quoted — and inside those quotes a backslash or a quote has to be escaped in turn.
        const quoted = escaped.replace(/(["\\])/g, "\\$1");
        return query.or(column.map((c) => `${c}.ilike."%${quoted}%"`).join(","));
      };

      const [match, total] = await Promise.all([
        (async () => {
          const { count, error } = await filter(
            sb
              .from(TABLE.bankTransactions)
              .select("id", { count: "exact", head: true })
              .lt("amount", 0),
          );
          if (error) throw error;
          return (count as number | null) ?? 0;
        })(),
        (async () => {
          const { count, error } = await sb
            .from(TABLE.bankTransactions)
            .select("id", { count: "exact", head: true })
            .lt("amount", 0);
          if (error) throw error;
          return (count as number | null) ?? 0;
        })(),
      ]);
      return { match, population: total };
    },
  });
}

// Re-run the whitelist decision over the transactions a rule is currently hiding
// (opos_reapply_whitelist, migration 20260819190000). Deactivating or deleting a rule stops it
// matching, but nothing rewrites the rows it already hid, so they stayed out of Offene Posten
// carrying the id of a rule that is switched off or gone from the screen — with the transaction
// detail able to say only "durch Regel", never which one (#1, #3). Passing no id re-evaluates
// every rule-hidden transaction. Returns how many rows actually changed.
export function useReapplyOposWhitelist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId?: string | null): Promise<number> => {
      const { data, error } = await sb.rpc("opos_reapply_whitelist", { p_rule_id: ruleId ?? null });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: () => {
      invalidateOposRules(qc);
      // A released transaction reappears in Offene Posten and in the matching lists, so the
      // screens reading those have to drop their cached copies too.
      invalidateMatchState(qc);
    },
  });
}
