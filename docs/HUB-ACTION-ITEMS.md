# Hub / Front-End — Action Items (my side)

> **Scope:** This is what **I (Faheem)** own — the `immonetz` front-end repo (TanStack
> Start + Supabase reads). The ingestion pipeline (Gmail/Drive → OpenAI → Supabase) is the
> **client's** responsibility and lives outside this repo — see `docs/PIPELINE-OVERVIEW.md`.
>
> Legend: 🟢 I can do it now · 🟡 needs input/decision first · 🔴 blocked on someone else
> · ⛔ not my job (tracked for awareness).

---

## 0. First — confirm what's mine vs. the client's

The pipeline (email reading, OCR, AI extraction, GCP realtime worker, mailbox cleanup) is
**100% the client's side.** I do **not** build or host that. My side is the Hub UI on top of
Supabase, plus wiring the front end to the RAG/voice backend the client already built.

- ⛔ Gmail/Drive ingestion, OCR/AI extraction, dedup — client (`pipeline/`).
- ⛔ Realtime worker + GCP billing/Cloud Run — client + Philipp.
- ⛔ Mailbox cleanup (mark read / labels) — client.

---

## 1. Clarifications to get from the client before building

| #   | Question                                                                                                                                                                                       | Why it matters                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟡 Can I get the **`pipeline/db_schema.sql`** (canonical schema) + the `status`/`workflow_status` CHECK constraints?                                                                           | The schema is **not version-controlled in this repo**. I need it to build against real column values and to keep the generated Supabase types accurate. |
| 2   | 🟡 For the **RAG chat + voice search**, do you want the endpoint as a **Supabase Edge Function** or a **server route in the Hub**? Who deploys `ask.py` behind it?                             | `ask.py` is Python and lives in the pipeline. The Hub can't call it directly — it needs an HTTP endpoint. This decides my integration approach.         |
| 3   | 🟡 Should reviewers be able to **set/change `lieferant_id`** (link an invoice to a supplier) in the Hub, or is that always the pipeline's job?                                                 | Today the UI can only edit free-text `rechnungssteller`; it cannot attach a supplier record. Known functional gap.                                      |
| 4   | 🟡 How should the **status indicator** read for a user? Currently there are two overlapping concepts: extraction `status` (`erkannt`/`zu_pruefen`) and `workflow_status` (the approval chain). | The list/Kanban today only use extraction `status`; the workflow columns are placeholders. I need one clear "where is this invoice" model.              |
| 5   | 🟡 Is the OpenAI **Whisper** call (`/v1/audio/transcriptions`) made from the Hub with an API key, or proxied through the same backend endpoint as the chat?                                    | Determines where the OpenAI key lives (must not be in the browser).                                                                                     |

---

## 2. Front-end build tasks (client-requested features, backend ready)

### 2a. 🟡 Chat window (NL / RAG questions)

Backend `pipeline/ask.py` exists (text-to-SQL + semantic search + LLM). My work:

- [ ] Build the chat UI panel in the Hub (question box → answer, with aggregated totals).
- [ ] Answer must **list and link to the underlying `belege`** and **suggest filters** (per the client's request).
- [ ] Call the RAG endpoint (form decided in Clarification #2). Keep normal search intact — chat is additive.
- [ ] Handle loading/empty/error states consistently with existing `query-states.tsx`.

### 2b. 🟡 Voice search (OpenAI Whisper)

- [ ] Add a mic button to the search bar → record → transcribe (`/v1/audio/transcriptions`) → drop text into the existing search.
- [ ] On Enter → results; multiple hits → show multiple (existing list behavior).
- [ ] Ensure the OpenAI key is **server-side**, never in the browser (depends on Clarification #5).

### 2c. 🟡 Supplier linking (fills a known gap)

- [ ] If the client approves (Clarification #3): add UI on the detail page (`$nr.tsx`) to attach/detach `lieferant_id` from the supplier list, writing via a new mutation in `queries.ts`.

---

## 3. Front-end improvements I can start now (no client input needed)

- 🟢 **Fix the hardcoded Zeitraum filter.** `/eingangsrechnungen` currently hardcodes April/May/June 2026 + "Jahr 2026". Derive the month/year options from the actual `beleg_datum` values so it never goes stale. _(File: `src/routes/eingangsrechnungen/index.tsx`, `inZeitraum` + the `<Select>` options.)_
- 🟢 **Regenerate Supabase types** once I have the schema, so `Database` isn't the empty/`never` type that forces the `as unknown as` and `sb as any` casts in `queries.ts`.
- 🟢 **Audit the Kanban board.** 3 of 5 columns are "Stufe 2" placeholders and there's no drag-and-drop. Decide (with Clarification #4) whether to wire them to `workflow_status` or hide them until ready.
- 🟢 Keep `docs/EINGANGSRECHNUNGEN_FEATURE.md` and this file updated as the source of truth for the Hub side.

---

## 4. Coordination / awareness (not my deliverables, but they affect me)

- 🔴 **Realtime worker (auto-ingest)** is blocked on **GCP billing** (Philipp). Until then, data only appears when the client runs the scripts manually — so during demos/testing, **new invoices won't show up on their own.** Plan test data accordingly.
- 🟡 **Selective Drive ingest** decision (which folders count as incoming invoices) is pending Philipp/Anja. If they reload Drive docs, some existing `belege` IDs may change — don't hardcode against current rows.
- ⛔ **Pipeline `.env` note:** their `service_role` key is invalid and the pipeline writes directly to Postgres. Irrelevant to the front end (I use the anon/publishable key), just noted so I don't rely on `service_role` behavior.

---

## 5. Suggested order

1. **Send the client Clarifications #1–#5** (esp. the schema + the RAG endpoint decision) — unblocks the biggest items.
2. **Start the no-input wins** (§3: Zeitraum fix, types regen once schema arrives, Kanban audit).
3. **Build the RAG chat + voice search** (§2) once the endpoint shape is agreed.
4. **Add supplier linking** (§2c) if approved.

---

_Created 2026-07-02. Companion to `docs/PIPELINE-OVERVIEW.md` (client's side) and
`docs/EINGANGSRECHNUNGEN_FEATURE.md` (the invoices screen)._
