---
name: commit-messages
description: When to commit at all, and how to word it. Load this BEFORE running `git commit`, amending, squashing, or writing any commit message. Covers the rule that nobody commits or raises committing until the user asks, the one-line subject, and the hard ban on any Claude, AI or co-author attribution.
---

# Commit messages

Read this before you write the message, not after. The commit list is client facing, read on
GitHub, so every subject has to stand on its own.

---

## 0. Do not commit until you are told to, and do not ask

The hardest rule here, and the one most often broken by accident.

- Never run `git commit` or `git push` on your own initiative.
- Never offer to. No "shall I commit this?", no "say the word and I will commit", no ending a turn
  with the suggestion. Being asked every turn is itself the problem.
- Finish the work, run the checks, report what changed and what is still open, and stop there.
- When the user does ask, commit what they asked for and nothing else.

---

## 1. Never mention Claude, Anthropic or AI

Non negotiable, and it applies to every field of the commit:

- No `Co-Authored-By: Claude ...` trailer.
- No "Generated with Claude Code", no robot emoji, no "written with AI assistance".
- No `noreply@anthropic.com` as author or committer.
- No "WIP: Claude Code rate-limit checkpoint" style scratch commits. If you need a checkpoint,
  name it after the work, not the tool.

The commit must read as authored by the user alone. `includeCoAuthoredBy: false` is set in
`.claude/settings.json` here and in the global settings, so nothing is appended automatically.
Do not add it back by hand.

## 2. No em dashes

No `—` and no en dash used as punctuation, in the subject or the body. Use a comma, a full stop,
or two short sentences. This is the same rule as in the repo instructions skill.

## 3. Subject line: say what changed and why it matters

Target 50 to 72 characters. One line, no trailing full stop.

The house pattern is `Area: what it does now`, where the area is the screen, module or table the
change lives in. German names for screens and DB objects stay German, the rest is English.

Good, taken from this repo's own history:

```
Kostenanalyse: never show a P&L the data does not support yet
Manuelle Buchungen: close the write hole and stop losing edits
Verwaltung: a page hidden from a role must not open by URL either
OPOS-Whitelist: take the anon grant off opos_reapply_whitelist
Protokoll: prettier formatting only, no behaviour change
```

Each one tells a reader what is true after the commit. That is the test.

Bad, also from this repo's history. Do not write these:

```
Enhance Table Pagination and Combobox Accessibility
Enhance trash management and audit compliance
Update .gitignore and add documentation for voice dictation and customer editing features
```

They fail because "Enhance", "Improve" and "Update" describe effort, not outcome, and because
"X and Y and Z" is a sign the commit should have been split.

Rules of thumb:

- Lead with the effect, not the verb of working. `stop losing edits`, not `improve edit handling`.
- One change per commit. If the subject needs an "and", consider two commits.
- A `type:` prefix (`fix:`, `refactor:`, `style:`) is fine when there is no obvious screen, but the
  area prefix is preferred.
- Never name files in the subject. `src/routes/team/index.tsx` means nothing to a reader.

## 4. One line, no body

A commit message is a single line. No body, no bullet list, no trailer, no footer.

If the change genuinely cannot be said in one line, that is a sign it is two commits, not a sign it
needs a paragraph. Reasoning that a reader will want later belongs in the planning folder or in the
pull request, where it can be edited; a commit body cannot.

## 5. Tone

Plain and direct. Avoid the padding tics: "comprehensive", "seamlessly", "robust",
"it's worth noting", "not just X, but Y". Write it the way you would tell a colleague what you
just did.

---

## Checklist before `git commit`

0. The user asked for this commit. If they did not, stop.
1. Subject reads as a statement of the new truth, under about 72 chars.
2. One line only, no body.
3. No `—` anywhere in the message.
4. No Claude, Anthropic, AI or bot reference in the message, author or committer.
5. `git log -1 --format='%an <%ae>%n%B'` after committing, to confirm all of the above.
