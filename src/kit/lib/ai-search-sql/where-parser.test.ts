import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { validateWhereClause, WhereClauseError } from "./where-parser.ts";
import type { QueryColumnSpec } from "./types.ts";

const columns: QueryColumnSpec[] = [
  { name: "issuer", type: "text", description: "supplier name" },
  { name: "cost_category", type: "text", description: "cost category" },
  { name: "amount_gross", type: "number", description: "gross amount" },
  { name: "document_date", type: "date", description: "invoice date" },
  { name: "paid_at", type: "date", description: "when it was paid" },
  { name: "has_confirmed_bank_match", type: "boolean", description: "reconciled" },
];

const rejects = (clause: string, because: RegExp) =>
  assert.throws(
    () => validateWhereClause(clause, columns),
    (error: Error) => {
      assert.ok(error instanceof WhereClauseError, `expected WhereClauseError, got ${error.name}`);
      assert.match(error.message, because);
      return true;
    },
  );

describe("validateWhereClause accepts what the model is meant to produce", () => {
  test("a supplier match", () => {
    assert.equal(validateWhereClause("issuer ilike '%KMAG%'", columns), "issuer ilike '%KMAG%'");
  });

  test("a number compared with a null check", () => {
    assert.equal(
      validateWhereClause("amount_gross > 100 and paid_at is null", columns),
      "amount_gross > 100 and paid_at is null",
    );
  });

  test("a date range", () => {
    assert.equal(
      validateWhereClause("document_date between '2025-01-01' and '2025-12-31'", columns),
      "document_date between '2025-01-01' and '2025-12-31'",
    );
  });

  test("a boolean", () => {
    assert.equal(
      validateWhereClause("has_confirmed_bank_match = true", columns),
      "has_confirmed_bank_match = true",
    );
  });

  test("two alternatives", () => {
    assert.equal(
      validateWhereClause("issuer ilike '%KMAG%' or issuer ilike '%EON%'", columns),
      "issuer ilike '%KMAG%' or issuer ilike '%EON%'",
    );
  });
});

// review_problem_count and review_unchecked were named in the prompt for a long time and exist in
// no table or view here -- they arrived with the port from another client. The clause reaches the
// database through invoices_search_ids, so an unknown column is a failed search, not a narrower
// one. buildSqlPreviewConfig now takes its column list from nl_search_columns(); this is the net
// underneath that.
describe("validateWhereClause refuses a column the search does not have", () => {
  for (const ghost of ["review_problem_count", "review_unchecked", "belegart"]) {
    test(ghost, () => rejects(`${ghost} > 0`, /not allowed/i));
  }
});

describe("validateWhereClause refuses anything but a filter", () => {
  test("a second statement", () => rejects("issuer ilike '%a%'; drop table documents", /";"/));

  test("a trailing comment", () => rejects("amount_gross > 100 -- hidden", /"-"/));

  test("a subquery", () => rejects("issuer in (select name from suppliers)", /quoted string/i));

  test("a condition on no column at all", () => rejects("1=1", /column name/i));

  test("an empty clause", () => rejects("", /empty/i));

  test("more conditions than the cap", () =>
    rejects(
      Array.from({ length: 13 }, () => "amount_gross > 1").join(" and "),
      /more than 12 conditions/,
    ));
});
