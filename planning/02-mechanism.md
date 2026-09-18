# The mechanism: one file, no keys, copied into every Hub

This is the part that is identical for every client. It contains no page names and no client names,
so it is copied verbatim, the same way `20260829150000_permissions_model.sql` was copied into the
newest Hub when it was built.

## Columns added to the catalogue

```sql
alter table public.permissions
  add column if not exists parent_key      text references public.permissions(key),
  add column if not exists kind            text not null default 'action',
  add column if not exists default_enabled boolean not null default true,
  add column if not exists locked          boolean not null default false;

alter table public.permissions
  add constraint permissions_kind_known
  check (kind in ('module', 'page', 'section', 'action'));
```

| Column | Holds |
|---|---|
| `parent_key` | the node above it, making the catalogue a tree |
| `kind` | module, page, section or action |
| `default_enabled` | what the product ships with, per node |
| `locked` | may never be switched off, whatever arrives over the API |

## The client's own choices

```sql
create table if not exists public.feature_settings (
  feature_key text primary key references public.permissions(key) on delete cascade,
  enabled     boolean not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
```

A row exists only where somebody switched something. No row means `default_enabled` decides, so a
feature added later arrives on without a migration touching anyone's data.

No tenant column: the database is the client.

## The resolver

`current_permissions()` keeps its existing shape and gains one recursive pass. A node counts only
when it, and every ancestor, resolve to enabled:

```
effective(node) = coalesce(feature_settings.enabled, permissions.default_enabled)
live(node)      = effective(node) and live(parent) for every ancestor
```

and the final clause becomes what it already is, `and` the node being live. The catalogue is a few
dozen rows, so the recursive pass costs nothing measurable, and the function is still one call per
session rather than one per navigation.

**Why inside this function.** The menu reads it through `can()`, the route guard reads it, and the
RLS policies read it through `has_permission()`. One clause here is the whole enforcement story. An
entitlement anywhere else is one the database never learns about.

## A read function for the two editors

```sql
create or replace function public.feature_tree()
returns table (
  key text, parent_key text, kind text, label_de text, label_en text,
  sort_order int, locked boolean, default_enabled boolean,
  chosen boolean, effective boolean
)
```

Both the panel and, later, the Hub's own tab render from this, so "effective" is computed once in
the database and never re-derived in TypeScript.

## Guards

- **Locked is enforced in the database, not in the screen.** A trigger refuses to write
  `enabled = false` for a locked node, including through a direct PostgREST call. Same reasoning and
  the same shape as the existing `guard_super_admin_permissions()`.
- **Writes are admin only**, mirroring `role_permissions_write`: `using (is_admin())` and
  `with check (is_admin())`.
- **Reads stay open to anyone signed in**, because the UI needs the labels, exactly as the existing
  `permissions_read` policy does.

## Audit

Every insert or update on `feature_settings` writes a row into `change_history`
(`table_name`, `record_id`, `type`, `data`, `actor`, `at`), which already exists in these Hubs and is
what the Protokoll screen renders. No new audit table.

## What this file must never contain

A page name, a client name, a German word, or a `tenant_id`. If any of those appear, the file has
stopped being the mechanism and has become one client's data.
