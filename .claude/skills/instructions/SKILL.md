---
name: instructions
description: Standing working instructions for the this Hub — the team's non-negotiable rules and conventions to follow on EVERY task in this repo. Load this at the START of any work (reading, editing, planning, reviewing) before touching code. New rules get appended here over time; treat every entry as an active instruction, not background context.
---

# this Hub — standing instructions

Read and follow these on every task in this repo, before you start. These are active rules,
not reference notes. When the user gives a new standing instruction, append it here as a numbered

---

## 1. Code in English, show German in the UI

**Write all code for a global English-speaking developer audience — not only German readers.**

- **English** for everything in the code: comments, variable/function/component/type names,
  commit messages, internal docs, log messages, test names.
- **German** only for text the end user actually sees on screen — the site is German, and the
  user must see everything in German: labels, buttons, headings, placeholders, tooltips, toasts,
  empty/error/loading states, badge text, validation messages shown to users.
- **Exception — DB-derived names stay German** because they mirror the Supabase schema:
  `Beleg`, `Lieferant`, `Gesellschaft`, `gesellschaft_code`, `betrag_brutto`, `workflow_status`,
  etc. Do not rename these.

Rule of thumb: **if a string is rendered to the user → German; everything else → English.**

Note on existing code: parts of the codebase currently have German comments and identifiers (legacy).
**From now on, new code is written in English.** When you meaningfully touch a file, prefer migrating
the comments/identifiers you edit to English (without churning unrelated lines or renaming DB-derived
names / user-facing German strings).

Examples:

- ✅ `// Load the invoice's original file (bytea) — shown only in the detail view.`
- ❌ `// Original-Datei (bytea) eines Belegs. Wird nur im Detail geladen.`
- ✅ `function useSupplierInvoices() { ... }` returning a button labeled `"Beleg hochladen"`.
- ✅ Keep `betrag_brutto`, `workflow_status`, `Beleg` — these come from the DB schema.

---

<!-- Append future standing instructions below as "## 2. ...", "## 3. ...". -->

## 2. Write plainly. No em dashes, no AI-sounding prose

Applies to everything you write: UI strings (German and English), code comments, docs, commit
messages, and replies to the user.

- **No em dashes (`—`) and no en dashes used as punctuation.** Use a comma, a full stop, or
  brackets instead. Two short sentences beat one sentence held together by a dash.
- **No AI-writing tics.** Skip "not just X, but Y", "it's worth noting", "seamlessly",
  "leverage", "delve", "robust", "comprehensive", and the habit of restating the same point in
  three different ways. Say the thing once.
- Prefer short, concrete sentences with the plain word over the impressive one.

**User-facing text is done.** The locale files and the user-visible template literals were swept
on 18.08.2026 in all three Hubs, so no screen shows an em dash in prose any more. The one em dash
that stays is the empty-value glyph in a table cell or a picker (`—`, `— keiner —`), which is
typography rather than writing.

Code comments and docs still contain thousands of them. Leave those alone unless you are already
editing that line, then fix it in passing. New text follows this rule.

Examples:

- ✅ `"Das Konto wird nicht mehr importiert, auch wenn die Bank es weiterhin liefert."`
- ❌ `"Das Konto wird nicht mehr importiert — auch dann nicht, wenn die Bank es weiterhin liefert."`

---

## 3. No Claude attribution in commits

No `Co-Authored-By: Claude`, no "Generated with Claude Code", no bot name or emoji, and never
`noreply@anthropic.com` as author or committer. The commit reads as authored by the user alone.

## 4. Commit messages have their own skill

Before writing any commit message, load `.claude/skills/commit-messages`. It carries the subject
line pattern, when a body is warranted, and the checklist to run before `git commit`.
