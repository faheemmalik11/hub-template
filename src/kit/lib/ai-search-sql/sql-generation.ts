import type { ModelJsonClient } from "./types";
import type {
  DateColumnSpec,
  EntityMappingSpec,
  IntentClassification,
  IntentClassifierConfig,
  IntentEntities,
  QueryColumnSpec,
  QueryScopeSpec,
} from "./types";
import { validateWhereClause, WhereClauseError } from "./where-parser";

export interface SqlGenerationConfig extends IntentClassifierConfig {
  columns: QueryColumnSpec[];
  entityMappings: EntityMappingSpec[];
  scope: QueryScopeSpec;
  dateColumns: DateColumnSpec;
  listColumns: string;
  listOrderBy: string;
  groupKeyExpressions: Record<string, string>;
  aggregateColumns: { gross: string; net: string; vat: string; paidAt: string };
  sqlTable: string;
  sqlModel?: ModelJsonClient;
  maxConditions?: number;
}

export interface SqlPreview {
  classification: IntentClassification;
  whereClause: string | null;
  rejectedWhereClause: string | null;
  unsupportedAspects: string[];
  extraClauseDescription: string | null;
  sql: string | null;
}

const WHERE_SCHEMA = {
  type: "object",
  properties: {
    whereClause: { type: ["string", "null"] },
    unsupportedAspects: { type: "array", items: { type: "string" } },
    extraClauseDescription: { type: ["string", "null"] },
  },
  required: ["whereClause", "unsupportedAspects", "extraClauseDescription"],
  additionalProperties: false,
} as const;

function columnLabel(name: string, columns: QueryColumnSpec[]): string {
  const column = columns.find((entry) => entry.name === name);
  return column?.label ?? name.replace(/_/g, " ");
}

function withDeterministicAmbiguities(
  modelAspects: string[],
  matches: ColumnWordingMatches,
  columns: QueryColumnSpec[],
): string[] {
  void matches;
  return modelAspects.map((aspect) =>
    columns.reduce(
      (text, column) => text.replaceAll(column.name, columnLabel(column.name, columns)),
      aspect,
    ),
  );
}

function wordingHints(matches?: ColumnWordingMatches): string {
  if (!matches || (matches.selected.length === 0 && matches.ambiguous.length === 0)) return "";
  const lines: string[] = [
    "",
    "WORDING MATCHES computed from the catalog (these are FACTS — obey them over your own reading):",
  ];
  for (const entry of matches.selected) {
    lines.push(
      `- the question's wording "${entry.wording}" names the column ${entry.column}: a constraint using this wording MUST be expressed on ${entry.column}, never marked unsupported.`,
    );
  }
  for (const entry of matches.ambiguous) {
    lines.push(
      `- the question's word "${entry.wording}" matches SEVERAL columns (${entry.candidates.join(", ")}): for a TEXT match express it on all of them with OR; for a NUMERIC threshold do NOT express it — describe it in unsupportedAspects in the user's language, asking which of these it meant (plain words, no column identifiers).`,
    );
  }
  return lines.join("\n");
}

function columnCatalog(columns: QueryColumnSpec[]): string {
  return columns
    .map((column) => {
      const values = column.values?.length ? ` Known values: ${column.values.join(", ")}.` : "";
      const terms = column.terms?.length
        ? ` Users also call this: ${column.terms.join(", ")}.`
        : "";
      return `- ${column.name} (${column.type}): ${column.description}${terms}${values}`;
    })
    .join("\n");
}

interface ColumnWordingMatches {
  selected: { column: string; wording: string }[];
  ambiguous: { wording: string; candidates: string[] }[];
}

function normalizeWording(text: string): string {
  return text.toLowerCase().replace(/[_]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchColumnWording(
  question: string,
  columns: QueryColumnSpec[],
): ColumnWordingMatches {
  const normalizedQuestion = ` ${normalizeWording(question)} `;
  const questionTokens = [...new Set(normalizedQuestion.split(" ").filter(Boolean))];
  const wordAppears = (word: string) =>
    questionTokens.some(
      (token) =>
        token === word ||
        (word.length >= 4 &&
          token.length >= 4 &&
          (token.startsWith(word) || word.startsWith(token))),
    );
  const phraseAppears = (phrase: string) =>
    phrase.includes(" ") ? normalizedQuestion.includes(` ${phrase} `) : wordAppears(phrase);

  const phraseOwners = new Map<string, Set<string>>();
  for (const column of columns) {
    const phrases = [normalizeWording(column.name), ...(column.terms ?? []).map(normalizeWording)];
    for (const phrase of phrases) {
      if (!phrase) continue;
      if (!phraseOwners.has(phrase)) phraseOwners.set(phrase, new Set());
      phraseOwners.get(phrase)!.add(column.name);
    }
  }

  const selected: { column: string; wording: string }[] = [];
  const ambiguous: { wording: string; candidates: string[] }[] = [];
  const coveredTokens = new Set<string>();
  for (const [phrase, owners] of phraseOwners) {
    if (!phraseAppears(phrase)) continue;
    if (owners.size === 1) {
      selected.push({ column: [...owners][0], wording: phrase });
      for (const token of phrase.split(" ")) coveredTokens.add(token);
    } else {
      ambiguous.push({ wording: phrase, candidates: [...owners].sort() });
    }
  }

  const tokenOwners = new Map<string, Set<string>>();
  for (const [phrase, owners] of phraseOwners) {
    for (const token of phrase.split(" ")) {
      if (token.length < 3) continue;
      if (!tokenOwners.has(token)) tokenOwners.set(token, new Set());
      for (const owner of owners) tokenOwners.get(token)!.add(owner);
    }
  }
  for (const [token, owners] of tokenOwners) {
    if (owners.size < 2) continue;
    if (coveredTokens.has(token)) continue;
    if (ambiguous.some((entry) => entry.wording === token)) continue;
    if (!wordAppears(token)) continue;
    ambiguous.push({ wording: token, candidates: [...owners].sort() });
  }
  return { selected, ambiguous };
}

export function buildWhereGenerationInstructions(
  config: SqlGenerationConfig,
  retryError?: string,
  wordingMatches?: ColumnWordingMatches,
): string {
  const retryNote = retryError
    ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the safety validator with this error: "${retryError}". Produce a corrected clause that satisfies every rule below.`
    : "";
  const now = config.now ? config.now() : new Date();
  const today = now.toISOString().slice(0, 10);
  return `Today is ${today}. You translate a classified invoice-search request into ONE PostgreSQL boolean expression (the content of a WHERE clause). You never write a full statement — no SELECT, no FROM, no ORDER BY, no semicolon. The expression is validated by a strict parser and rejected on any violation.${retryNote}

Allowed columns (the ONLY identifiers you may use — never invent one):
${columnCatalog(config.columns)}
${wordingHints(wordingMatches)}

Allowed syntax, nothing else:
- comparisons: = <> > >= < <= on number and date columns; = <> on text and boolean columns
- text matching: column ILIKE '%fragment%' (escape a literal % or _ in the fragment with a backslash)
- lists: column IN ('a', 'b'); negation: NOT, <>
- ranges: column BETWEEN x AND y (number or date columns)
- null checks: column IS NULL, column IS NOT NULL
- month/year of a date column: extract(month from column) = N, extract(year from column) = N (whole numbers; the ONLY function allowed)
- combining: AND, OR, parentheses
- literals: numbers plain (1500.5), dates as 'YYYY-MM-DD' strings, text in single quotes ('' for a quote), booleans true/false

You receive the user's question plus its classified intent and entities. The entities are ALREADY validated — company codes are real, dates are resolved. Build the expression from them.

DATE AND MONTH ENTITIES ARE NOT YOURS: entities.dateFrom, entities.dateTo, entities.dateMonth, entities.dueDateFrom, entities.dueDateTo and entities.dueDateMonth are ALREADY fully applied automatically by the system outside your clause — that part of the question is FULLY handled, not partially. NEVER express them yourself, never mention the invoice-date or due-date columns for them, and never re-derive a date or month from the question's own wording — even the exact word the question used (a month name, "last month", a date). Just as importantly: NEVER add the wording that named one of these entities to unsupportedAspects either — it is not unsupported, it is handled, and listing it there would falsely tell the user their date/due-date constraint was dropped when it was not. Silently say nothing about it in either place. If the question also carries some OTHER constraint that happens to use date-like wording, express only that other constraint, on its own listed column, exactly as its mapping below says.

HOW EACH REMAINING ENTITY MAPS TO COLUMNS (this app's own configuration — follow it exactly):
${config.entityMappings.map((mapping) => `- ${mapping.entity}: ${mapping.rule}`).join("\n")}

General rules:
- Different entities are AND-ed unless a mapping above says otherwise.
- MATCH BY MEANING, IN ANY LANGUAGE: the question may use German or English wording, and the column names, descriptions and user terms may be in either language too. A phrase selects a column when its MEANING matches that column's name, description or listed user terms — translate freely in both directions. Nothing outside this catalog defines what a word means.
- AMBIGUOUS NAME OR TEXT terms cover every reading: a text match that could refer to several text columns is expressed on all of them combined with OR — a text either matches or it does not, so the union stays precise.
- AMBIGUOUS NUMERIC terms are different: a threshold has ONE subject, and OR-ing two different measures answers a looser question than the one asked. When the measure a number applies to could be more than one listed column, do NOT express it — put it into unsupportedAspects, in the user's language, asking which measure was meant.
- Every comparison needs a column its wording actually selects. A number whose accompanying word matches NO listed column at all goes into unsupportedAspects — never onto whichever column usually holds numbers.
- SCALES AND UNITS: every comparison value must use the column's own scale as stated in its description — convert the question's units when they differ (a percentage against a 0-to-1 column becomes a fraction). Never compare raw question numbers against a column whose description states a different scale.
- MANY CONSTRAINTS IN ONE QUESTION IS NORMAL: a question naming several separate numeric or text conditions together is not itself a reason for ambiguity — judge EACH constraint independently, by its OWN wording against the catalog, exactly as if it were the only constraint in the question. Do not let the presence of other constraints make you more cautious about one that is otherwise a clear, single-column match (especially one already given to you as a MUST-express fact above).
- entities.archived is handled outside your clause. The system itself adds this base scope — never restate any part of it: ${config.scope.active.join(" and ")}.

unsupportedAspects entries are shown to the END USER: write each one in the SAME language as the question, as a short, warm, everyday sentence — the way a helpful colleague would say it out loud, never like an error message or a technical report. NEVER include internal column identifiers, catalog language, or words like "attributes", "context", "defined" or "not clearly" — describe a candidate column by the meaning its description states (for example the plain words for a recognition confidence or a review priority), and when a term was ambiguous, ask in that entry which meaning was intended.
  RIGHT: "We couldn't tell what you meant by 'query' here."
  WRONG: "The topic 'query' is not clearly defined in terms of invoice attributes." — this is jargon, not something you'd say to a colleague.

whereClause is null when there is NOTHING FOR YOU to filter — this includes a question that is entirely date/due-date/month wording, since that part is already fully handled elsewhere: return whereClause: null and unsupportedAspects: [] in that case, never the question's own text. whereClause is otherwise null when there is nothing to filter (no entities and no expressible topic). unsupportedAspects lists ONLY the stated constraints that are NOT in your whereClause — a constraint you expressed must NEVER also appear there, and one you could not express must ALWAYS appear there. When you are unsure whether to express a constraint or mark it unsupported, mark it unsupported and leave it out of the clause. Losing a constraint silently is the worst possible outcome; guessing is the second worst.

If exactly ONE listed column matches the wording (by its name, description or user terms), express it on that column and do not mention it in unsupportedAspects.

Worked examples of the ambiguity rule — follow them exactly (T stands for any term the question uses, in any language):
  Question says "T below 70" and the measure T plausibly matches TWO listed numeric columns:
    RIGHT: whereClause omits it; unsupportedAspects asks, in the user's language and without column identifiers, which measure was meant
    WRONG: whereClause contains column_a < 70 (a guessed single reading)
    WRONG: whereClause contains (column_a < 0.7 or column_b < 70) — a threshold has one subject; the union answers a looser question
  Question says "T below 70 percent" and the meaning of T matches ONLY column_a, whose description says it is stored 0 to 1:
    RIGHT: whereClause contains column_a < 0.7; unsupportedAspects: []
    WRONG: unsupportedAspects: ["T below 70 percent (could mean column_a)"] — one candidate is a match, not an ambiguity

extraClauseDescription is shown to the END USER, next to a sentence the app already builds for you out of the entities (company, supplier, payment/review/bank-match state, document type, workflow step, amount, category, property, unassigned company, traffic light, DATEV handover, direct debit, dates — the ones the entity mappings above cover). That sentence has no way to describe anything else, so: whenever your whereClause contains a comparison on a catalog column that NONE of the entity mappings above name, write ONE short phrase, in the SAME language as the question, describing ONLY that extra comparison — worded so it reads naturally appended after "invoices that belong to X" (for example "have an AI score above 80%", "arrived by email", "are missing a review"). Same voice as unsupportedAspects: warm and plain, no column identifiers, no SQL, no jargon. When your whereClause is fully covered by the entity-mapped columns (even a complex one), or is null, return extraClauseDescription: null — do not describe something the sentence already says.

A column appearing in WORDING MATCHES above is NOT the same as being covered by an entity mapping — WORDING MATCHES only tells you which column to filter on, it says nothing about whether the app's sentence can describe it. Judge extraClauseDescription ONLY against the entity mapping list. Concrete example: the question asks for a company AND "ai score above 80" / "confidence over 90%", and the catalog's recognition-confidence column is matched via WORDING MATCHES but named in NO entity mapping — your whereClause correctly includes both comparisons, and extraClauseDescription is NOT null: it says something like "have an AI score above 80%". Returning null there is WRONG even though the comparison itself was correctly expressed.

Return only JSON in the shape { "whereClause": string | null, "unsupportedAspects": string[], "extraClauseDescription": string | null }.`;
}

function dateClauseFragment(
  column: string,
  from: string | null,
  to: string | null,
  month: number | null,
): string | null {
  if (month !== null) return `extract(month from ${column}) = ${month}`;
  if (from && to) return `${column} between '${from}' and '${to}'`;
  if (from) return `${column} >= '${from}'`;
  if (to) return `${column} <= '${to}'`;
  return null;
}

function buildDeterministicDateClauses(
  entities: IntentEntities,
  dateColumns: DateColumnSpec,
): string[] {
  const clauses: string[] = [];
  const document = dateClauseFragment(
    dateColumns.document,
    entities.dateFrom,
    entities.dateTo,
    entities.dateMonth,
  );
  if (document) clauses.push(document);
  const due = dateClauseFragment(
    dateColumns.due,
    entities.dueDateFrom,
    entities.dueDateTo,
    entities.dueDateMonth,
  );
  if (due) clauses.push(due);
  return clauses;
}

export async function generateWhereClause(
  config: SqlGenerationConfig,
  classification: IntentClassification,
  query: string,
): Promise<{
  whereClause: string | null;
  rejectedWhereClause: string | null;
  unsupportedAspects: string[];
  extraClauseDescription: string | null;
}> {
  const model = config.sqlModel ?? config.intentModel;
  let lastError: string | undefined;
  let rejected: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wordingMatches = matchColumnWording(query, config.columns);
    const completion = await model.completeJson({
      instructions: buildWhereGenerationInstructions(config, lastError, wordingMatches),
      input: JSON.stringify({ question: query, classification }, null, 2),
      schemaName: "invoice_where_clause",
      schema: WHERE_SCHEMA,
      temperature: 0,
    });
    if (completion.usage) {
      config.onModelUsage?.(completion.usage, { stage: "sql_generate", attempt: attempt + 1 });
    }
    const raw = completion.data as {
      whereClause?: unknown;
      unsupportedAspects?: unknown;
      extraClauseDescription?: unknown;
    };
    const unsupportedAspects = Array.isArray(raw.unsupportedAspects)
      ? raw.unsupportedAspects.filter(
          (aspect): aspect is string => typeof aspect === "string" && aspect.trim() !== "",
        )
      : [];
    const extraClauseDescription =
      typeof raw.extraClauseDescription === "string" && raw.extraClauseDescription.trim() !== ""
        ? raw.extraClauseDescription.trim()
        : null;
    const finalAspects = withDeterministicAmbiguities(
      unsupportedAspects,
      wordingMatches,
      config.columns,
    );
    const candidate = typeof raw.whereClause === "string" ? raw.whereClause.trim() : null;
    const missingFacts = wordingMatches.selected.filter((entry) => {
      if (entry.column === config.dateColumns.document || entry.column === config.dateColumns.due) {
        return false;
      }
      return !candidate || !new RegExp(`\\b${entry.column}\\b`, "i").test(candidate);
    });
    const forbiddenDateColumns = [config.dateColumns.document, config.dateColumns.due].filter(
      (column) => candidate && new RegExp(`\\b${column}\\b`, "i").test(candidate),
    );
    const entityMappedColumns = new Set(
      config.columns
        .map((column) => column.name)
        .filter((name) =>
          config.entityMappings.some((mapping) => new RegExp(`\\b${name}\\b`).test(mapping.rule)),
        ),
    );
    const uncoveredMatchedColumns = wordingMatches.selected.filter((entry) => {
      if (entry.column === config.dateColumns.document || entry.column === config.dateColumns.due) {
        return false;
      }
      if (entityMappedColumns.has(entry.column)) return false;
      return candidate !== null && new RegExp(`\\b${entry.column}\\b`, "i").test(candidate);
    });
    const missingExtraDescription = uncoveredMatchedColumns.length > 0 && !extraClauseDescription;
    if (
      (missingFacts.length > 0 || forbiddenDateColumns.length > 0 || missingExtraDescription) &&
      attempt < 3
    ) {
      const messages: string[] = [];
      if (missingFacts.length > 0) {
        messages.push(
          `You marked ${missingFacts.map((fact) => `"${fact.wording}"`).join(", ")} unsupported, but this app's own configuration says ${
            missingFacts.length === 1
              ? "it names a column that MUST"
              : "each names a column that MUST"
          } be expressed, never marked unsupported: ${missingFacts
            .map((fact) => `wording "${fact.wording}" names column ${fact.column}`)
            .join("; ")}.`,
        );
      }
      if (forbiddenDateColumns.length > 0) {
        messages.push(
          `Your whereClause mentions ${forbiddenDateColumns.join(" and/or ")} directly. Date and month entities are applied automatically outside your clause — remove every comparison on ${forbiddenDateColumns.join(" and ")} from your whereClause entirely, even if it looks like it matches the entities.`,
        );
      }
      if (missingExtraDescription) {
        messages.push(
          `Your whereClause uses ${uncoveredMatchedColumns.map((entry) => entry.column).join(" and ")}, which no entity mapping covers, but you returned extraClauseDescription: null. The app's sentence cannot describe this comparison on its own — you MUST fill extraClauseDescription with a short plain-language phrase describing it (in the question's language), so it is not silently dropped from what the user is told.`,
        );
      }
      lastError = messages.join(" ");
      continue;
    }
    const deterministicClauses = buildDeterministicDateClauses(
      classification.entities,
      config.dateColumns,
    );
    const parts = [...(candidate ? [candidate] : []), ...deterministicClauses];
    if (parts.length === 0) {
      return {
        whereClause: null,
        rejectedWhereClause: null,
        unsupportedAspects: finalAspects,
        extraClauseDescription: null,
      };
    }
    const combined = parts.length === 1 ? parts[0] : parts.map((part) => `(${part})`).join(" and ");
    try {
      const normalized = validateWhereClause(combined, config.columns, config.maxConditions);
      return {
        whereClause: normalized,
        rejectedWhereClause: null,
        unsupportedAspects: finalAspects,
        extraClauseDescription,
      };
    } catch (error) {
      if (!(error instanceof WhereClauseError)) throw error;
      lastError = error.message;
      rejected = combined;
    }
  }
  return {
    whereClause: null,
    rejectedWhereClause: rejected,
    unsupportedAspects: ["the filter condition could not be safely validated"],
    extraClauseDescription: null,
  };
}

export function composeQuery(
  classification: IntentClassification,
  whereClause: string | null,
  config: SqlGenerationConfig,
): string | null {
  if (classification.intent === "off_topic") return null;
  const table = config.sqlTable;
  const { gross, net, vat, paidAt } = config.aggregateColumns;
  const scope = [
    ...(classification.entities.archived ? config.scope.archived : config.scope.active),
  ];
  if (whereClause) scope.push(`(${whereClause})`);
  const where = scope.join("\n  and ");

  if (classification.intent === "count_invoices") {
    return `select count(*) as invoice_count\nfrom ${table}\nwhere ${where};`;
  }
  if (classification.intent === "total_amount") {
    return (
      `select\n  count(*) as invoice_count,\n  coalesce(sum(${gross}), 0) as total_gross,\n` +
      `  coalesce(sum(${net}), 0) as total_net,\n  coalesce(sum(${vat}), 0) as total_vat,\n` +
      `  coalesce(sum(${gross}) filter (where ${paidAt} is not null), 0) as paid_gross,\n` +
      `  coalesce(sum(${gross}) filter (where ${paidAt} is null), 0) as open_gross\n` +
      `from ${table}\nwhere ${where};`
    );
  }
  if (classification.intent === "rank_breakdown") {
    const dimension = classification.entities.groupBy ?? "issuer";
    const groupKey = config.groupKeyExpressions[dimension] ?? config.groupKeyExpressions.issuer;
    return (
      `select\n  ${groupKey} as group_key,\n  count(*) as invoice_count,\n` +
      `  coalesce(sum(${gross}), 0) as total_gross,\n` +
      `  coalesce(sum(${gross}) filter (where ${paidAt} is not null), 0) as paid_gross,\n` +
      `  coalesce(sum(${gross}) filter (where ${paidAt} is null), 0) as open_gross\n` +
      `from ${table}\nwhere ${where}\ngroup by 1\nhaving ${groupKey} is not null\norder by total_gross desc\nlimit 5;`
    );
  }
  return `select ${config.listColumns}\nfrom ${table}\nwhere ${where}\norder by ${config.listOrderBy};`;
}

export async function generateSqlPreview(
  config: SqlGenerationConfig,
  classification: IntentClassification,
  query: string,
): Promise<SqlPreview> {
  if (classification.intent === "off_topic") {
    return {
      classification,
      whereClause: null,
      rejectedWhereClause: null,
      unsupportedAspects: [],
      extraClauseDescription: null,
      sql: null,
    };
  }
  const generated = await generateWhereClause(config, classification, query);
  return {
    classification,
    whereClause: generated.whereClause,
    rejectedWhereClause: generated.rejectedWhereClause,
    unsupportedAspects: generated.unsupportedAspects,
    extraClauseDescription: generated.extraClauseDescription,
    sql: composeQuery(classification, generated.whereClause, config),
  };
}
