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

It belongs in `@hub-kit/core`, which is the only way every Hub gets it without copying.

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
