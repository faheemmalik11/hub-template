# Inside a Hub: three changes, all small

The Hub reads. It does not edit the switches in this plan; the panel does that.

## 1. Every nav entry carries its key

`src/components/layout/app-shell.tsx:96-215`. The array already supports an optional `permission`
per entry and per group. Twenty-one links and six groups gain theirs. Nothing else in that file
changes: `visibleWith()` at line 223 keeps working exactly as written, because both axes arrive
through the one resolved set, and the rule at line 259 that drops an emptied group already handles a
module whose pages are all off.

## 2. One route guard, replacing six

Every route renders inside `AuthGate` to `AppShell` (`src/components/layout/auth-gate.tsx:83`). The
guard goes there: map the current path to its page key, ask `can()`, and render the refusal in place
of the children. That covers the typed URL, the bookmark, and the roughly fifty in-app links that
point at routes, in one edit.

The six hand-copied route guards (`auswertungen`, `dateibenennung`, `protokoll`, `freigabe-regeln`,
`team`, `papierkorb`) are then redundant and come out.

**Two messages, not one.** A page that the client does not use says so; a page the role may not see
says no access. The decision comes from the resolved set, the wording from the catalogue read, since
only the catalogue can tell the two apart.

## 3. A wrapper for a section

So no screen writes the conditional by hand, and so the kit owns the shape:

```tsx
<IfAllowed permission={PERMISSIONS.sectionInvoiceDetailVat}>
  <VatCard … />
</IfAllowed>
```

It hides the section when the client does not use it and when the role may not see it, with no
second check, because both already arrive through `can()`. This is the shape react-admin and CASL
both settled on.

It belongs in `src/kit/`, which is how every Hub gets it without copying.

## What does not change

- No data is deleted or hidden at rest. Switching a page off stops it being shown; the pipeline keeps
  writing, so switching it back on shows the real history rather than a gap.
- RLS stays as it is. The entitlement can only remove, never grant.
- Menu order and icons stay in code.

## Known edge cases to handle

- **Guided tours.** `src/lib/tour/tours.ts:48-63` targets `shell-nav-*` ids that will no longer exist
  when a group is off. Filter the steps by the same resolved set, or a tour points at nothing.
- **Badge counts.** The invoices group carries a "returned to me" count. A hidden module must stop
  counting, or the sidebar shows a badge for something invisible.
- **Deep links** from the dashboard and the notification bell land on the refusal panel rather than a
  blank screen, which the single guard gives for free.
- **A permission whose page is off.** The role may still hold `invoices.pay` while the payments
  module is off. The resolver answers no, which is correct, and the Rollen tab should show it as
  unavailable rather than as revoked.

## The server side, checked 19.09.2026

A switch has to reach three surfaces, not one. Where each stands:

| Surface | Covered by | Notes |
|---|---|---|
| The screens | `can()` in the menu and the route guard | |
| The database | RLS calling `current_permissions()` | the entitlement sits in front of the admin path in `may_read` |
| The server routes | the caller's own token, plus `person_may()` where a route guards explicitly | see below |

**21 of the 22 server routes run as the caller.** `requireSupabaseAuth` builds a client from the
caller's Bearer token, so every query they make is under RLS and the switch applies without the
route doing anything.

**One route holds elevated rights**, `invoice-files.functions.ts`, and it is written correctly: it
first reads the file row through the **caller's** client with a `documents!inner` embed, so RLS
decides whether that document is visible at all, and only then uses the admin client to mint a
signed URL. A switched-off module fails at the embed, exactly as if the file did not exist.

**What was actually broken:** `requirePermission` re-implemented the permission rule in TypeScript
and knew nothing about feature settings. It now calls `person_may(email, capability)` in SQL, which
resolves the personal override, the role default, the protected account and `live_features()`
together. Proved: with payments switched off in the panel, the owner is refused on the server path
too, and allowed again when it is switched back on.

**The rule to keep:** a server route never re-derives who may do what. It asks the database, because
two implementations of one rule is how they drift, and the drift is invisible until somebody
switches something off.
