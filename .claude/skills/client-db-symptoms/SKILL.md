---
name: client-db-symptoms
description: What a broken screen actually means when the Hub is run against a client's adopted database — the symptom-to-cause table, and the one query that confirms each. Load this when pages say "No access to this page", the sidebar is empty, a screen is blank with no error, a skeleton never resolves, or a permission test returns a number you do not believe. Also holds the test trap where current_permissions() answers 0 for the wrong reason.
---

# Reading a broken screen on an adopted database

Every row here happened while bringing Antonius-Apotheke onto the template. The order matters: the
first row looks exactly like a permission problem and is not one.

| On screen | What it usually means | Confirm it with |
|---|---|---|
| Empty sidebar, every page says "No access to this page" | **The profile query failed on a missing column.** Not permissions | the profile query below |
| Same, and the profile query is fine | the catalogue really is missing, or nobody is granted anything | `current_permissions()`, inside a transaction |
| A screen loads, is empty, and shows no error, but the table has rows | RLS is on with no policy for that table | the policy count below |
| A skeleton that never resolves | a view or function the screen calls does not exist | `to_regclass` / `pg_proc` below |
| Hundreds of `current transaction is aborted` in a psql run | one real error near the top aborted the transaction; everything after is noise | scroll up to the first error. See **client-db-adopt-order** |

## Row 1, because it costs the most time

`src/lib/auth.tsx` reads the signed-in person like this:

```ts
.select(`id, name, picture_url, is_active, must_change_password, ${TABLE.roles}(name)`)
```

One missing column fails the whole select. `fetchProfile` then returns null and the app **fails
closed** — no profile, so no rights, so every page refuses and the sidebar has nothing in it. It is
indistinguishable on screen from a person with no permissions.

This client's `app_users` had none of `name`, `picture_url` or `must_change_password`. It had
`full_name`. Adding the three columns fixed every screen at once, with no permission change at all.

Confirm by running the app's own select by hand:

```sql
select id, name, picture_url, is_active, must_change_password from public.app_users limit 1;
```

If that errors, you have found it. The browser console shows the same thing as a 400 from PostgREST
naming the column.

## Row 3: RLS on, no policy

A table with row level security enabled and no policy denies everyone, silently. That is the safe
end to fail at, and it is why it produces a blank screen rather than an error.

```sql
select c.relname, c.relrowsecurity, count(p.polname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relkind = 'r'
 group by 1, 2
having c.relrowsecurity and count(p.polname) = 0
 order by 1;
```

## Row 4: a missing view or function

```sql
select to_regclass('public.v_documents_list');          -- null means it is not there
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname = 'current_permissions';
```

The browser's network tab shows it first: PostgREST returns 404 for a view it cannot find, and the
query never settles, so the skeleton stays.

## The test trap: current_permissions() returns 0 for the wrong reason

A test of `public.current_permissions()` as the authenticated role returned 0 and looked like a real
failure. It was not. `set local role` and `set_config(..., true)` are **transaction-local**. Run
outside a transaction they do nothing: the query runs as `postgres`, with no JWT claim, so
`current_permissions()` honestly answers 0.

Measured on the client's local copy, both halves in one go:

```bash
PG="postgresql://postgres:postgres@127.0.0.1:55322/postgres"

# no transaction -> 0, and the number means nothing
psql "$PG" -t -A \
  -c "select set_config('request.jwt.claims', '{\"email\":\"someone@example.com\"}', true)" \
  -c "select count(*) from public.current_permissions()"

# inside one -> the real answer
psql "$PG" -t -A <<'SQL'
begin;
select set_config('request.jwt.claims', '{"email":"someone@example.com"}', true);
set local role authenticated;
select count(*) from public.current_permissions();
rollback;
SQL
```

0 and 64. Same database, same second, same person. **Wrap every permission or RLS test in
`begin` / `rollback`.** The rollback also means the test cannot leave anything behind.

Use the person's real email: `current_permissions()` matches on `lower(email)` from the JWT, not on
a user id. See **client-db-gap** for why that matters when `app_users.id` and `auth.users.id`
differ.

## Where to prove a fix

On a disposable copy, never on live: **throwaway-db**. The order the fixes go in:
**client-db-adopt-order**.
