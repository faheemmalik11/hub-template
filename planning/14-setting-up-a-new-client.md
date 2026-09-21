# Setting up a new client, start to finish

Every step here was run during the rebuild of `dev-tenant` on 21.09.2026, so this is what happened
rather than what was intended. A client whose database already holds their data is not this: that is
`12-adopting-an-existing-client.md`, and it is a migration, not a setup.

## 1. Their own Supabase project

One project per client. Nothing is shared: not the database, not the storage, not the auth users.

From the dashboard, take the project ref, the publishable key and the database URL.

## 2. Their own repository

```bash
git clone git@github.com:faheemmalik11/hub-template.git <client>-hub
cd <client>-hub
git remote rename origin template          # the template is upstream, not their origin
git remote add origin <their repository>
npm install
```

`template` is what lets a fix written once reach them later:

```bash
git fetch template && git merge template/main
```

## 3. Their `.env`

Copy `.env.example`. Three values, all from step 1:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<their publishable key>
SUPABASE_PROJECT_ID=<ref>
```

No key is hard-coded anywhere in `src/`, `supabase/` or `scripts/`, so this file is the only place
their project is named.

## 4. Build their database

```bash
node scripts/build-baseline.mjs                       # 17 schema files into one
psql "$THEIR_DB_URL" -f supabase/migrations/00000000000000_schema.sql
psql "$THEIR_DB_URL" -f supabase/catalogue.sql
```

That is 70 tables, 11 views, the catalogue of 51 features, and the pipeline's ledger rows. Expect
`NOTICE ... skipping` lines and no `ERROR`.

**The baseline refuses nothing and checks nothing.** Run it against an empty database only. The
panel's own `applyHubBaseline` does check, and stops if `documents` already exists.

## 5. Prove it before anyone sees it

```bash
psql "$THEIR_DB_URL" -c "select count(*) from public.feature_tree()"     # 51
psql "$THEIR_DB_URL" -c "select count(*) from public.schema_migrations"  # 5
node scripts/check-pipeline-columns.mjs                                  # no gap
```

The middle one matters more than it looks: those five rows are what tells the admin panel this
database is provisioned. Without them the panel declines to read the client's own credentials and
reports every source as unfinished, with nothing on screen explaining why.

## 6. The first person

The catalogue seeds roles and rights, never people. Create their first administrator in Supabase
auth, then one row in `app_users` with a role that `administers`. Everyone after that is added from
the Hub's own Team screen.

## 7. The panel

Add them in `admin-ui`: name, then their database URL under Connections & keys. Their credentials
are encrypted per client, so the panel is the only thing that can read them back.

Switch off what they are not buying under **Hub features**. A switch is a row in
`feature_settings`; only what differs from the template is stored, so a feature left alone follows
the template for ever rather than being pinned to today's default.

## 8. Run it

```bash
npm run dev
```

## What is theirs to change, and nothing else

Their catalogue seed, their brand and locale, their `.env`, and their own tables in the 9000 file
range. Everything else stays identical to the template, which is what makes step 2's merge quiet.
A merge conflict outside those four is the signal that somebody edited shared code.
