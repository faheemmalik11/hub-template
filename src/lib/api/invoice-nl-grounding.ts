import { TABLE } from "@/lib/data/tables";
// Shared "real tenant vocabulary" used by invoice-nl-retrieval.functions.ts (constrains
// Text-to-SQL filter values to real codes/categories via a JSON-schema enum) and
// voice-transcription.functions.ts / voice-entity-resolution.ts (bias speech transcription toward
// the same real company/property/supplier names, so a spoken/misheard company name resolves to
// the real one). Extracted out of invoice-nl-retrieval.functions.ts (ported from immonetz's
// invoice-grounding.ts) so voice input doesn't need its own duplicate copy of this query set.
//
// Read fresh via the caller's own RLS-scoped client each call, never cached — a company-restricted
// user's candidate lists (and therefore what they can even ask the model to filter by) must stay
// scoped to what they're granted, and a naive module-level cache shared across requests would risk
// serving one user's scoped grounding data to a different user in the same warm instance (this app
// already had one real cross-user data leak from a caching-adjacent RLS oversight — migration
// 0053's incident, cited in docs/NATURAL_LANGUAGE_SEARCH.md's "known gaps" section).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface Grounding {
  companyCodes: string[];
  // Raw names parallel to companyCodes (same order/length) -- voice input needs codes AND names
  // as separate keyterms/mishearing-correction targets; companyList is a pre-joined "CODE (Name)"
  // prompt string for the intent-extraction LLM call, not parseable back into individual names.
  companyNames: string[];
  companyList: string;
  propertyCodes: string[];
  propertyNames: string[];
  propertyList: string;
  categoryNames: string[];
  categoryList: string;
  supplierNames: string[];
  supplierList: string;
}

export async function loadGrounding(db: Db): Promise<Grounding> {
  const [companies, properties, categories, suppliers] = await Promise.all([
    // NOTE: no `.is("deleted_at", null)` filter here, even though `companies` has that column —
    // pre-existing behavior from before this file was extracted, not changed here since it's
    // outside this task's scope. Worth a follow-up: a soft-deleted company can currently still
    // appear as a valid grounding candidate.
    db.from(TABLE.companies).select("code, name"),
    db.from(TABLE.properties).select("code, name").is("deleted_at", null),
    db.from(TABLE.categories).select("name").eq("is_active", true).is("deleted_at", null),
    db.from(TABLE.suppliers).select("name").is("deleted_at", null).limit(250),
  ]);
  if (companies.error) throw companies.error;
  if (properties.error) throw properties.error;
  if (categories.error) throw categories.error;
  if (suppliers.error) throw suppliers.error;

  const companyRows = (companies.data ?? []) as { code: string; name: string }[];
  const propertyRows = (properties.data ?? []) as { code: string; name: string | null }[];
  const categoryRows = (categories.data ?? []) as { name: string }[];
  const supplierRows = (suppliers.data ?? []) as { name: string }[];

  const companyCodes = companyRows.map((c) => c.code);
  const companyNames = companyRows.map((c) => c.name);
  const propertyCodes = propertyRows.map((p) => p.code);
  const propertyNames = propertyRows.map((p) => p.name).filter((n): n is string => Boolean(n));
  const categoryNames = [...new Set(categoryRows.map((c) => c.name))];
  const supplierNames = [...new Set(supplierRows.map((s) => s.name))];

  return {
    companyCodes,
    companyNames,
    companyList:
      companyRows.map((c) => `${c.code} (${c.name})`).join(", ") || "(keine Gesellschaften)",
    propertyCodes,
    propertyNames,
    propertyList:
      propertyRows.map((p) => (p.name ? `${p.code} (${p.name})` : p.code)).join(", ") ||
      "(keine Objekte)",
    categoryNames,
    categoryList: categoryNames.join(", ") || "(keine Kategorien)",
    supplierNames,
    supplierList: supplierNames.join(", ") || "(keine Lieferanten)",
  };
}
