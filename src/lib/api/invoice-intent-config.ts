import {
  openAiModelClient,
  type AiSearchVocabulary,
  type IntentClassifierConfig,
  type EntityMappingSpec,
  type QueryColumnSpec,
  type SqlGenerationConfig,
  type WorkflowStepSpec,
} from "@/kit/lib/ai-search-sql";

import { AppError } from "./errors";
import { TABLE } from "@/config/tables";
import { tenantCredential } from "@/lib/postfach/channel-credentials.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DEFAULT_MODEL = "gpt-4o-mini";

/** The tenant's OpenAI key, stored by the admin panel, never read from .env. */
function requireOpenAiKey(): Promise<string> {
  return tenantCredential("OPENAI_API_KEY");
}

const workflowSteps: WorkflowStepSpec[] = [
  { value: "received", meaning: "received, not yet in the approval process" },
  {
    value: "in_review",
    meaning: "in review (review stage, NOT an approval stage), assistant is checking it",
  },
  {
    value: "query",
    meaning:
      'returned with a query during review (NOT an approval stage). The word "query" or "Rückfrage" alone names EXACTLY this one step, precisely, never several steps at once',
  },
  { value: "approved_first", meaning: "approved by the assistant (an approval stage)" },
  {
    value: "approved_final",
    meaning: "approved by the supervisor, awaiting payment (an approval stage)",
  },
  { value: "paid", meaning: "paid" },
  { value: "handed_over", meaning: "handed to DATEV" },
  { value: "closed", meaning: "completed" },
  { value: "rejected", meaning: "rejected" },
  { value: "not_relevant", meaning: "marked not relevant" },
];

export async function buildIntentClassifierConfig(): Promise<IntentClassifierConfig> {
  return {
    intentModel: openAiModelClient({
      apiKey: await requireOpenAiKey(),
      model: process.env.OPENAI_NL_SEARCH_INTENT_MODEL || DEFAULT_MODEL,
    }),
    promptExamples: { companyCode: "STAY", supplierName: "E.ON" },
    unassignedCompanyCode: "NZO",
    workflowSteps,
  };
}

const queryColumns: QueryColumnSpec[] = [
  {
    name: "company_code",
    type: "text",
    description: "our own company's code; NULL when no company is assigned",
  },
  { name: "property_code", type: "text", description: "property code the invoice belongs to" },
  { name: "issuer", type: "text", description: "supplier name as written on the invoice" },
  { name: "invoice_number", type: "text", description: "invoice number printed on the document" },
  { name: "cost_category", type: "text", description: "cost category name (German)" },
  {
    name: "service_description",
    type: "text",
    description: "free text describing the invoiced service",
  },
  { name: "document_date", type: "date", description: "invoice date" },
  { name: "service_date", type: "date", description: "service or delivery date" },
  { name: "due_date", type: "date", description: "payment due date" },
  {
    name: "amount_gross",
    type: "number",
    description:
      "gross amount in the invoice currency; a bare amount without net or VAT wording means this column",
    label: "Amount",
    terms: ["amount", "Betrag"],
  },
  {
    name: "amount_net",
    type: "number",
    description: "net amount",
    label: "Net amount",
    terms: ["net amount", "Nettobetrag", "netto"],
  },
  {
    name: "vat_amount",
    type: "number",
    description: "VAT amount",
    label: "VAT amount",
    terms: ["VAT amount", "Steuerbetrag", "Mehrwertsteuerbetrag"],
  },
  {
    name: "vat_rate",
    type: "number",
    description: "VAT rate in percent",
    values: ["0", "7", "10", "19", "20", "22"],
  },
  { name: "currency", type: "text", description: "invoice currency", values: ["EUR", "USD"] },
  {
    name: "status",
    type: "text",
    description: "extraction status",
    values: ["recognised", "needs_review"],
  },
  {
    name: "workflow_status",
    type: "text",
    description: `approval workflow step. One value per line:\n${workflowSteps
      .map((step) => `  - ${step.value}: ${step.meaning}`)
      .join("\n")}`,
    values: workflowSteps.map((step) => step.value),
  },
  {
    name: "document_type",
    type: "text",
    description: "document kind",
    values: ["rechnung", "credit_note", "sonstiges"],
  },
  {
    name: "traffic_light",
    type: "text",
    description: "recognition traffic light",
    values: ["green", "yellow", "red"],
  },
  {
    name: "review_problem_count",
    type: "number",
    description: "how many validation checks failed; exactly what the review badge shows",
  },
  {
    name: "review_unchecked",
    type: "boolean",
    description: "no validation check has run on this invoice yet",
  },
  {
    name: "review_score",
    type: "number",
    description: "review priority used for sorting only; never use it to filter needs-review",
    label: "Pruef-Prioritaet",
    terms: ["review score", "priority score"],
  },
  {
    name: "confidence_score",
    type: "number",
    description:
      "AI recognition confidence between 0 and 1; the page shows it as a percent, so 70% means 0.7",
    label: "KI-Erkennung",
    terms: [
      "score",
      "Punkte",
      "Punktzahl",
      "Erkennung",
      "Konfidenz",
      "recognition",
      "confidence",
      "ai score",
      "ai recognition",
      "ai confidence",
      "KI score",
      "KI Bewertung",
    ],
  },
  {
    name: "paid_at",
    type: "date",
    description: "settlement timestamp; NULL means unpaid; use only IS NULL / IS NOT NULL",
  },
  {
    name: "handed_over_at",
    type: "date",
    description: "DATEV handover timestamp; use only IS NULL / IS NOT NULL",
  },
  {
    name: "has_confirmed_bank_match",
    type: "boolean",
    description: "a bank transaction match is confirmed",
  },
  {
    name: "has_suggested_bank_match",
    type: "boolean",
    description: "a bank transaction match is suggested and waiting",
  },
  {
    name: "payment_method",
    type: "text",
    description: "free text; direct debit when it contains lastschrift, einzug or abbuch",
  },
  {
    name: "intake_channel",
    type: "text",
    description: "how the document arrived",
    values: ["drive", "email"],
  },
];

const entityMappings: EntityMappingSpec[] = [
  {
    entity: "entities.companies",
    rule: "an entry that equals a known company code -> company_code = 'CODE' (several -> IN list). An entry that is NOT a known code is an unresolved name typed by the user: match it as text with company_code ILIKE '%name%'.",
  },
  {
    entity: "entities.suppliers",
    rule: "each entry -> issuer ILIKE '%entry%'; several suppliers are OR-ed with each other. When company codes in entities.companies were resolved from the SAME ambiguous name as a supplier fragment (one bare name in the question, not two separately named entities), produce a single OR group: (issuer ILIKE '%name%' OR company_code IN ('CODE1', ...)), never two AND-ed conditions. Distinct named entities stay AND-ed.",
  },
  {
    entity: "entities.paymentState",
    rule: "'paid' -> paid_at IS NOT NULL; 'open' -> paid_at IS NULL; 'overdue' -> paid_at IS NULL AND due_date < today's date.",
  },
  {
    entity: "entities.reviewState",
    rule: "'needed' -> (review_problem_count > 0 OR (review_unchecked = true AND status = 'needs_review')); 'clear' -> review_problem_count = 0 AND NOT (review_unchecked = true AND status = 'needs_review'). Never use review_score for this.",
  },
  {
    entity: "entities.bankMatch",
    rule: "'matched' -> has_confirmed_bank_match = true; 'suggested' -> has_suggested_bank_match = true AND has_confirmed_bank_match = false; 'unmatched' -> has_confirmed_bank_match = false AND has_suggested_bank_match = false; 'any' -> (has_confirmed_bank_match = true OR has_suggested_bank_match = true).",
  },
  { entity: "entities.unassignedCompany", rule: "true -> company_code IS NULL." },
  {
    entity: "entities.datevHandover",
    rule: "'done' -> handed_over_at IS NOT NULL; 'pending' -> handed_over_at IS NULL.",
  },
  {
    entity: "entities.trafficLight",
    rule: "a color -> traffic_light = 'green'/'yellow'/'red'; 'flagged' -> traffic_light IN ('yellow', 'red').",
  },
  { entity: "entities.documentType", rule: "use the document_type column with its known values." },
  {
    entity: "entities.workflowStep",
    rule: "match the wording against workflow_status known values. Vague wording that plausibly covers several steps uses an IN list over ALL of them - never pick one reading.",
  },
  { entity: "entities.amountMin/amountMax", rule: "amount_gross >= / <=." },
  { entity: "entities.category", rule: "cost_category = 'the exact category name'." },
  {
    entity: "entities.property",
    rule: "property_code = 'CODE' when it is a known code, else property_code ILIKE '%name%'.",
  },
  {
    entity: "entities.directDebit",
    rule: "true -> (payment_method ILIKE '%lastschrift%' OR payment_method ILIKE '%einzug%' OR payment_method ILIKE '%abbuch%'); false -> payment_method IS NOT NULL AND NOT that same OR group; null -> nothing.",
  },
  {
    entity: "entities.topic",
    rule: "express it ONLY when a listed column clearly states it (for example a VAT-rate phrase -> vat_rate = 19). When no column expresses it, put the phrase into unsupportedAspects instead - NEVER approximate and NEVER drop it silently.",
  },
];

const queryScope = {
  active: ["archived_at is null", "not_relevant_at is null"],
  archived: ["archived_at is not null", "not_relevant_at is null"],
};

export async function buildSqlPreviewConfig(): Promise<SqlGenerationConfig> {
  return {
    ...(await buildIntentClassifierConfig()),
    columns: queryColumns,
    entityMappings,
    scope: queryScope,
    dateColumns: { document: "document_date", due: "due_date" },
    listColumns:
      "id, invoice_number, issuer, document_date, due_date, amount_gross, company_code, property_code, cost_category, paid_at",
    listOrderBy: "document_date desc nulls last",
    groupKeyExpressions: {
      company: "coalesce(company_code, 'NZO')",
      issuer: "issuer",
      property: "property_code",
      category: "cost_category",
    },
    aggregateColumns: {
      gross: "amount_gross",
      net: "amount_net",
      vat: "vat_amount",
      paidAt: "paid_at",
    },
    sqlTable: "v_invoices_review",
  };
}

export async function loadIntentVocabulary(db: Db): Promise<AiSearchVocabulary> {
  const [companies, properties, categories, suppliers, aliases, categoryAliases] =
    await Promise.all([
      db.from(TABLE.companies).select("code, name"),
      db.from(TABLE.properties).select("code, name").is("deleted_at", null),
      db.from(TABLE.categories).select("id, name").eq("is_active", true).is("deleted_at", null),
      db.from(TABLE.suppliers).select("name").is("deleted_at", null).limit(250),
      db
        .from(TABLE.entityAliases)
        .select("entity_type, entity_code, alias")
        .eq("is_active", true)
        .is("deleted_at", null),
      db.from(TABLE.categoryAliases).select("category_id, alias").eq("is_active", true),
    ]);
  if (companies.error) throw companies.error;
  if (properties.error) throw properties.error;
  if (categories.error) throw categories.error;
  if (suppliers.error) throw suppliers.error;
  if (aliases.error) throw aliases.error;
  if (categoryAliases.error) throw categoryAliases.error;

  const categoryRows = (categories.data ?? []) as { id: string; name: string }[];
  const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));
  const categoryAliasMap: Record<string, string[]> = {};
  for (const row of (categoryAliases.data ?? []) as { category_id: string; alias: string }[]) {
    const name = categoryNameById.get(row.category_id);
    if (!name) continue;
    categoryAliasMap[name] = [...new Set([...(categoryAliasMap[name] ?? []), row.alias])];
  }

  const aliasRows = (aliases.data ?? []) as {
    entity_type: string;
    entity_code: string;
    alias: string;
  }[];
  const aliasesFor = (entityType: string, code: string): string[] => [
    ...new Set(
      aliasRows
        .filter((row) => row.entity_type === entityType && row.entity_code === code)
        .map((row) => row.alias),
    ),
  ];
  return {
    companies: ((companies.data ?? []) as { code: string; name: string | null }[]).map((row) => ({
      code: row.code,
      name: row.name ?? null,
      aliases: aliasesFor("gesellschaft", row.code),
    })),
    properties: ((properties.data ?? []) as { code: string; name: string | null }[]).map((row) => ({
      code: row.code,
      name: row.name ?? null,
      aliases: aliasesFor("objekt", row.code),
    })),
    categories: [...new Set(categoryRows.map((row) => row.name))],
    categoryAliases: categoryAliasMap,
    suppliers: [
      ...new Set([
        ...((suppliers.data ?? []) as { name: string }[]).map((row) => row.name),
        ...aliasRows.filter((row) => row.entity_type === "lieferant").map((row) => row.alias),
      ]),
    ],
  };
}
