import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeQuery, generateSqlPreview, type SqlGenerationConfig } from "./sql-generation.ts";
import type { IntentClassification, ModelJsonClient, QueryColumnSpec } from "./types.ts";

const columns: QueryColumnSpec[] = [
  { name: "issuer", type: "text", description: "supplier name" },
  { name: "company_code", type: "text", description: "our company" },
  { name: "amount_gross", type: "number", description: "gross amount" },
  { name: "document_date", type: "date", description: "invoice date" },
  { name: "due_date", type: "date", description: "due date" },
  { name: "paid_at", type: "date", description: "when it was paid" },
];

const modelAlwaysAnswering = (whereClause: string | null): ModelJsonClient => ({
  completeJson: async () => ({
    data: { whereClause, unsupportedAspects: [], extraClauseDescription: null },
    usage: null,
  }),
});

const config = (model: ModelJsonClient): SqlGenerationConfig => ({
  intentModel: model,
  promptExamples: { companyCode: "ACME", supplierName: "E.ON" },
  columns,
  entityMappings: [],
  scope: {
    active: ["archived_at is null", "not_relevant_at is null"],
    archived: ["archived_at is not null", "not_relevant_at is null"],
  },
  dateColumns: { document: "document_date", due: "due_date" },
  listColumns: "id, issuer, amount_gross",
  listOrderBy: "document_date desc nulls last",
  groupKeyExpressions: { issuer: "issuer", company: "coalesce(company_code, 'NZO')" },
  aggregateColumns: {
    gross: "amount_gross",
    net: "amount_net",
    vat: "vat_amount",
    paidAt: "paid_at",
  },
  sqlTable: "v_documents_search",
});

const classify = (
  intent: string,
  entities: Partial<IntentClassification["entities"]> = {},
): IntentClassification =>
  ({
    intent,
    confidence: 1,
    language: "en",
    entities: { archived: false, ...entities },
  }) as IntentClassification;

// The search reads the same rows as the list beside it. It used to read v_documents_review, the
// review queue, which drops a document the moment it is settled -- so a client whose invoices were
// all paid got "no match" for every question they asked.
describe("composeQuery targets the view the list uses", () => {
  for (const intent of ["list_invoices", "total_amount", "count_invoices", "rank_breakdown"]) {
    test(intent, () => {
      const sql = composeQuery(
        classify(intent),
        "issuer ilike '%KMAG%'",
        config(modelAlwaysAnswering(null)),
      );
      assert.ok(sql, "expected SQL");
      assert.match(sql, /from v_documents_search/);
      assert.doesNotMatch(sql, /v_documents_review|v_invoices_review/);
    });
  }
});

describe("composeQuery shapes the query to the question that was asked", () => {
  const cfg = config(modelAlwaysAnswering(null));

  test("a plain question lists rows", () => {
    const sql = composeQuery(classify("list_invoices"), null, cfg);
    assert.match(sql!, /^select id, issuer, amount_gross/);
    assert.match(sql!, /order by document_date desc nulls last/);
  });

  test("a total question sums", () => {
    const sql = composeQuery(classify("total_amount"), null, cfg);
    assert.match(sql!, /sum\(amount_gross\)/);
    assert.match(sql!, /sum\(vat_amount\)/);
  });

  test("a count question counts", () => {
    const sql = composeQuery(classify("count_invoices"), null, cfg);
    assert.match(sql!, /count\(\*\) as invoice_count/);
  });

  test("a breakdown groups and ranks", () => {
    const sql = composeQuery(classify("rank_breakdown", { groupBy: "company" }), null, cfg);
    assert.match(sql!, /coalesce\(company_code, 'NZO'\) as group_key/);
    assert.match(sql!, /group by 1/);
    assert.match(sql!, /order by total_gross desc/);
  });

  test("an off-topic question produces nothing", () => {
    assert.equal(composeQuery(classify("off_topic"), null, cfg), null);
  });
});

describe("composeQuery keeps the archived scope separate", () => {
  const cfg = config(modelAlwaysAnswering(null));

  test("the normal question excludes archived rows", () => {
    assert.match(composeQuery(classify("list_invoices"), null, cfg)!, /archived_at is null/);
  });

  test("an archive question asks for them", () => {
    const sql = composeQuery(classify("list_invoices", { archived: true }), null, cfg)!;
    assert.match(sql, /archived_at is not null/);
  });

  test("the model's clause is anded onto the scope, never replacing it", () => {
    const sql = composeQuery(classify("list_invoices"), "issuer ilike '%KMAG%'", cfg)!;
    assert.match(sql, /archived_at is null/);
    assert.match(sql, /\(issuer ilike '%KMAG%'\)/);
  });
});

describe("generateSqlPreview", () => {
  test("passes a usable clause through", async () => {
    const preview = await generateSqlPreview(
      config(modelAlwaysAnswering("issuer ilike '%KMAG%'")),
      classify("list_invoices"),
      "Which invoices did we get from KMAG?",
    );
    assert.equal(preview.whereClause, "issuer ilike '%KMAG%'");
    assert.equal(preview.rejectedWhereClause, null);
  });

  // The prompt named review_problem_count and review_unchecked for a long time; neither exists in
  // any table or view here. An unknown column has to be refused rather than reach the database.
  test("refuses a clause naming a column the search does not have", async () => {
    const preview = await generateSqlPreview(
      config(modelAlwaysAnswering("review_problem_count > 0")),
      classify("list_invoices"),
      "Which invoices need review?",
    );
    assert.equal(preview.whereClause, null);
    assert.equal(preview.rejectedWhereClause, "review_problem_count > 0");
  });

  test("refuses a second statement", async () => {
    const preview = await generateSqlPreview(
      config(modelAlwaysAnswering("issuer ilike '%a%'; drop table documents")),
      classify("list_invoices"),
      "anything",
    );
    assert.equal(preview.whereClause, null);
  });

  test("an off-topic question never reaches the model", async () => {
    let called = false;
    const watched: ModelJsonClient = {
      completeJson: async () => {
        called = true;
        return { data: {}, usage: null };
      },
    };
    const preview = await generateSqlPreview(config(watched), classify("off_topic"), "hello");
    assert.equal(called, false);
    assert.equal(preview.sql, null);
    assert.equal(preview.whereClause, null);
  });
});

// A month number goes into the SQL text unquoted. The guard used to be `month !== null`, so a
// classification that simply left the field out produced "extract(month from document_date) =
// undefined" and threw the whole clause away.
describe("a month only becomes SQL when it really is a month", () => {
  const preview = async (entities: Record<string, unknown>) =>
    generateSqlPreview(
      config(modelAlwaysAnswering("issuer ilike '%KMAG%'")),
      classify("list_invoices", entities as never),
      "invoices from KMAG",
    );

  test("a real month is applied", async () => {
    const result = await preview({ dateMonth: 8 });
    assert.match(result.whereClause!, /extract\(month from document_date\) = 8/);
  });

  test("an absent month adds nothing", async () => {
    const result = await preview({});
    assert.equal(result.whereClause, "issuer ilike '%KMAG%'");
  });

  for (const bad of [0, 13, 7.5, "8", "1; drop table documents"]) {
    test(`${JSON.stringify(bad)} is refused`, async () => {
      const result = await preview({ dateMonth: bad });
      assert.equal(result.whereClause, "issuer ilike '%KMAG%'");
      assert.doesNotMatch(result.whereClause!, /extract\(month/);
    });
  }
});
