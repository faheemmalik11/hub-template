# Decisions, and what was rejected

Written 17.09.2026. Every claim below was read out of the code, with the file and line named so a
later session can check it rather than trust it.

## The problem

A new client is a clone of an existing Hub and arrives with every screen that Hub has. Most clients
do not use all of them: a pharmacy has no properties, a client who does not pay by transfer has no
use for payment runs. Today the only way to hide a screen is to edit that Hub's navigation file,
which is a fork, and forks are what this whole architecture exists to avoid.

## What is already there

Read in the Hub this template was copied from, on 17.09.2026:

- `supabase/migrations/20260829150000_permissions_model.sql` builds the model, and its own header
  says the intent: "Roles stop deciding anything; they become a preset."
  - `permissions` is the catalogue, one row per grantable thing, with German and English labels,
    a category and a sort order.
  - `role_permissions` is the default per role, editable from the UI, so a new role is an admin
    action rather than a migration.
  - `user_permissions` is a per person override in either direction, where `granted = false`
    revokes what the role would give.
  - `current_permissions()` resolves the three into one set; `has_permission()` wraps it.
  - **RLS policies call the same function.** `payment_orders_insert` asks
    `has_permission('invoices.pay')`. This is the single most important fact in the folder.
  - The file contains no keys at all. Keys are project data, in `supabase/permissions.seed.sql`
    and `src/lib/permissions.ts`, which a new project replaces wholesale.
- `src/components/layout/app-shell.tsx:96-215` holds the whole sidebar as one array: 6 groups and
  28 links. `visibleWith()` at line 223 drops an entry whose key the person does not hold, and a
  group whose children all vanish is dropped at line 259.
- Only 7 of those 28 links carry a key today: Dateibenennung, Freigabe-Regeln, Auswertungen, Team,
  Benachrichtigungen, Protokoll, Papierkorb.
- Direct URL access is stopped per route by a hand-copied guard, in 6 route files, for example
  `src/routes/auswertungen/index.tsx:35`.
- Every route renders inside one wrapper: `AuthGate` to `AppShell`, at
  `src/components/layout/auth-gate.tsx:83`.
- `change_history` already exists and is generic (`table_name`, `record_id`, `type`, `data`,
  `actor`, `at`), created in `supabase/migrations/0022_pipeline_storage_foundation.sql:77`, and is
  what the Protokoll screen renders.

Which Hubs carry the model, checked by grepping `current_permissions` across the migrations:

Three of the Hubs carry it, including this template and the newest one built, where it was ported
when the Hub was created. Three older Hubs do not have it yet and need that port before any of this
applies to them.

## Decisions

1. **Extend the catalogue that exists. Do not build a second one.**
   A parallel feature table would mean two trees that must agree, two seeds, two screens, and
   roughly fifty RLS policies taught to check both. Extending the catalogue makes database
   enforcement free: one clause in `current_permissions()` and every consumer inherits it.

2. **The entitlement is resolved inside `current_permissions()`, not beside it.**
   Our enforcement is RLS calling `has_permission()`. An entitlement living outside that function
   is one the database never learns about, and then the menu and the data can disagree.

3. **No `tenant_id` anywhere.** Each Hub has its own database. The database is the client. A tenant
   column would guard a boundary that already exists, and the settings table's primary key is the
   feature key alone.

4. **Shared means shared code, not a shared table.** The catalogue ships as a migration plus a seed
   and is copied into each Hub, exactly as the permission model itself was copied into the newest one.

5. **Defaults in the catalogue, choices in their own table.** `permissions.default_enabled` is what
   the product ships; `feature_settings.enabled` is what this client chose. The seed can then update
   what ships without ever overwriting a client's choice, and "never touched" stays distinguishable
   from "deliberately on". This mirrors the rule the pipeline already follows, that a layer stores
   only what it changes.

6. **Four levels: module, page, section, action.** A module is a sidebar group, a page is a screen,
   a section is a card or tab inside a screen, an action is something a person does.

7. **One key per capability.** A button that performs an action asks the action key it already has;
   only a part with no action behind it gets its own section key. Without this rule `invoices.pay`
   and `show_pay_button` drift apart, which is the failure the single resolver exists to prevent.

8. **The panel is the editor.** We switch features during onboarding, from the tenant workbench.
   The Hub reads. A tab inside the Hub, letting the client change it themselves, is a later option
   and changes nothing in the schema.

9. **English identifiers, whatever the URL says.** `page.incoming_invoices` for `/eingangsrechnungen`.
   German stays where it already is: in locale files, in URL paths, and in the column names the
   pipeline writes.

10. **Nothing changes for anyone live.** Every default reproduces today's behaviour, so with nothing
    switched off the resolver returns exactly the set it returns now.

## Rejected, and why

**A separate `page_settings` table with its own hook and its own filter.** My first draft. It would
have been a second visibility system that RLS knew nothing about. Dropped.

**The `ui_features` plus `tenant_ui_settings` design with `tenant_id` and RLS isolation per tenant.**
Right for a shared database, which is not what we run. Its good parts were taken: `default_enabled`,
`locked`, the tree, the audit trail, and the insistence that the backend enforce the same answer as
the menu. Its `tenant_id`, its shared catalogue table and its second gate were dropped.

**Driving the menu order and icons from the database.** Order and icons stay in code. The catalogue
decides what exists, not how it looks.

**Keying every component in one pass.** Modules and pages first. A section added later is one seed
row with a parent, no migration and no panel change.

## What the field does, checked 17.09.2026

- **react-admin** resolves through `authProvider.getPermissions()` / `canAccess()`, and the resource
  list, the menu and the pages all derive from that one call.
- **Ant Design Pro** puts an `access` key on the route entry, and `menuDataRender` filters the menu
  from the same source, so an unauthorised route simply never appears.
- **CASL** is one isomorphic Ability shared by client and server, with the stated goal that
  permissions are defined in a single location and not duplicated across UI, API and database.
  Its community also warns against shipping the whole grant matrix to the browser; ours returns only
  the caller's own resolved set.
- **Keycloak** models resources, scopes and policies, and its published lesson is collapsing a
  decision into a single request rather than many.
- **Praetorian and NCC Group** both state the security rule directly: authorization must not be
  spread across more than one conditional, and centralising it is what stops an accidental bypass.
- **Auth0 and WorkOS** describe entitlements as tenant or plan level access, resolved separately
  from individual grants.

The reading is consistent: keep the two concepts apart, resolve them into one answer, and let the
interface read that answer only. That is what this plan does.
