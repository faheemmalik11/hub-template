---
name: ai-invoice-search
description: The AI search box on the incoming-invoices screen — a question in German or English becomes a validated WHERE clause, never raw SQL from a model. Load this before touching the prompt, the intent classifier, the where-clause validator, or any invoices_search_* RPC, and before adding a column you expect the search to filter on.
---

# AI invoice search

A person types a question on `/incoming-invoices`. A model turns it into one WHERE clause, the
clause is parsed and validated against a column catalogue, and the surviving text goes to a
Postgres function that ANDs it onto a fixed scope. The matched ids feed the list that is already on
screen. **No model output ever reaches the database unparsed.**

## The chain

| Step | Where |
|---|---|
| Panel and its labels | `src/components/documents/intent-console-panel.tsx` |
| Server function | `src/lib/api/invoice-intent.functions.ts` — `searchInvoicesByQuestion` |
| Prompt and column catalogue | `src/lib/api/invoice-intent-config.ts` |
| Classify, generate, validate | `src/kit/lib/ai-search-sql/` |
| Rows, totals, ranking | `invoices_search_ids`, `invoices_search_totals`, `invoices_search_breakdown` |

Four intents come back from the classifier: `search_invoices` lists, `total_amount` sums,
`count_invoices` counts, `rank_breakdown` groups. `off_topic` short-circuits before the model is
asked for a clause at all.

## The rules, each of which was once broken

- **It reads `v_documents_search`, the same rows as the list beside it.** It used to read
  `v_documents_review`, the review queue, which drops a document the moment it is settled — so a
  client whose invoices were all paid got "no match" for every question they asked, about invoices
  they could see on screen.
- **The column list comes from `nl_search_columns()`, never from a hand-written list.** The ported
  prompt named `review_problem_count` and `review_unchecked`, which exist in no table or view here;
  the validator rejected every clause that used them. A column the search cannot offer is one the
  database does not have.
- **Column values come from `nl_search_column_values()` too.** A client still storing a pre-rename
  value (`status = 'zu_pruefen'` rather than `needs_review`) could not be asked about it when the
  prompt hard-coded the English set. Live values are merged with the documented ones.
- **An entity mapping may only name columns that exist.** The catalogue filter removes a phantom
  column from what the model is offered, but a `rule:` string in `entityMappings` still *instructs*
  the model to use one. Both have to agree.
- **A number interpolated into SQL is validated first.** `dateMonth` goes in unquoted, so
  `isARealMonth()` checks it is an integer 1–12. The guard used to be `month !== null`, which let an
  absent field through as the literal text `undefined`.
- **Every question records what it ran.** `assistant_usage` stores `where_clause`,
  `rejected_where_clause` and `match_count` alongside the question, language and intent. Without it
  a wrong clause and an honestly empty result look identical, and the only way to tell them apart is
  guesswork.

## Adding a column the search should filter on

1. The column must exist on `v_documents_search` — `nl_search_columns()` reads it from there.
2. Add a `QueryColumnSpec` to `queryColumns` in `invoice-intent-config.ts` with a `description` the
   model can act on, and `values` for a low-cardinality column. Type must be one of
   `text | number | date | boolean`; the validator branches on exactly those four.
3. Only if a phrase needs interpreting, add an `entityMappings` rule — and name only real columns.
4. A column absent from the view is dropped at runtime, so a client without it degrades rather than
   failing.

## What the validator refuses

`validateWhereClause` (`src/kit/lib/ai-search-sql/where-parser.ts`) is the boundary. It rejects an
unknown column, a second statement, a comment, a subquery, a condition on no column, an empty
clause, and more than 12 conditions. `invoices_search_ids` refuses `;`, `--` and `/*` again on its
own side. Both layers stay.

## Proving it still works

```bash
npm test -- src/kit/lib/ai-search-sql/
```

37 tests cover the validator and the generation layer, with a stubbed model so they need no network.
`where-parser.ts` carries no TypeScript parameter properties and `sql-generation.ts` imports with an
explicit `.ts` extension — both are required for `node --test` to load them at all, which is why the
suite that came with the port could never run.

For a live check, ask a question and read back what it did:

```sql
select question, language, intent, where_clause, match_count
from assistant_usage where where_clause is not null
order by created_at desc limit 10;
```

Test in German as well as English — the audience is German-speaking, and the two languages take
different paths through the classifier's payment rules.

## Not here

The microphone beside the box is a separate feature behind `documents.voice_search`, needing
`ELEVENLABS_API_KEY` in that client's credentials. An embeddings-based implementation
(`askInvoiceQuestion`, pgvector ranking, `invoices_filtered_*`) once existed alongside this one,
reachable from no component; it was deleted on 23.11.2026. `docs/NATURAL_LANGUAGE_SEARCH.md` is its
history and describes a design that no longer runs.
