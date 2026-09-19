-- The pipeline's OWN state, in a TENANT's database. Apply once per client project.
--
-- Both tables were written by every run and created by nobody, so each client happened to have
-- whichever one its Hub app built and was missing the other:
--   * bookmarks lived in `receipt_channel_folders`, a table only one of the two Hub schemas has,
--     so three of four clients could store none and re-read every folder on every run;
--   * `pipeline_runs` existed at the clients whose Hub made it, and nowhere else.
-- Neither is a client's data, so neither belongs in a table a client's app owns. Nothing here
-- alters, drops or reads-for-writing any table a Hub owns.
--
-- Safe to run on a database that has never seen 0001: this does not depend on it.
-- Re-runnable: every statement is guarded, so applying it twice changes nothing.


-- ---------------------------------------------------------------- the ledger ---
-- 0001 creates this too. Repeated here because a client may receive 0002 first, and a migration
-- that cannot record itself would re-run its data steps for ever.
create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);


-- ------------------------------------------------------------- where we got to ---
-- One row per folder read. `scope` is the account it was read as: a token issued for one mailbox
-- says nothing about another, so a changed scope means read in full rather than trust it.
--
-- identity and scope are NOT NULL with a '' default on purpose. They are part of the key, and in
-- Postgres every NULL is distinct, so a nullable key column would let the same folder collect a
-- new row per run and never match the one it wrote last time.
create table if not exists public.folder_bookmarks (
    channel_key text        not null,
    identity    text        not null default '',
    folder_id   text        not null,
    scope       text        not null default '',
    bookmark    text,
    synced_at   timestamptz not null default now(),
    primary key (channel_key, identity, folder_id)
);


-- ------------------------------------------------------------ what each run did ---
-- Columns match exactly what adapters/db/run_history.py writes. `id` needs a default because the
-- insert never supplies one; it returns id::text and the run holds that for the closing update.
create table if not exists public.pipeline_runs (
    id              uuid        primary key default gen_random_uuid(),
    source          text        not null,
    status          text        not null default 'running',
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    processed_count integer     not null default 0,
    error_count     integer     not null default 0,
    ki_used         integer     not null default 0,
    note            text
);

-- A Hub that built this table earlier may lack a column the pipeline now writes. Added rather
-- than assumed: `create table if not exists` above skips the whole table, columns included.
alter table public.pipeline_runs add column if not exists source          text;
alter table public.pipeline_runs add column if not exists status          text;
alter table public.pipeline_runs add column if not exists started_at      timestamptz;
alter table public.pipeline_runs add column if not exists finished_at     timestamptz;
alter table public.pipeline_runs add column if not exists processed_count integer;
alter table public.pipeline_runs add column if not exists error_count     integer;
alter table public.pipeline_runs add column if not exists note            text;
-- Guarded by its own savepoint in run_history, so its absence costs the count and not the row.
-- Added anyway, because a column that exists is cheaper than a savepoint that fires every run.
alter table public.pipeline_runs add column if not exists ki_used         integer;

-- What the Hub asks: the last run per channel.
create index if not exists pipeline_runs_source_started
    on public.pipeline_runs (source, started_at desc);


-- ------------------------------------------------ carry over what already exists ---
-- The one Hub that had a column for bookmarks keeps its position, so upgrading costs at most one
-- re-read instead of one per folder. Every reference is guarded: the table is absent for three of
-- four clients, and a plain `insert ... select` from a missing table fails at PARSE time, which no
-- `if` around it can prevent. Hence dynamic SQL.
do $$
begin
    if to_regclass('public.receipt_channel_folders') is not null
       and exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'receipt_channel_folders'
              and column_name = 'delta_link'
       )
    then
        execute $sql$
            insert into public.folder_bookmarks
                   (channel_key, identity, folder_id, scope, bookmark, synced_at)
            select f.channel_key,
                   coalesce(f.identity, ''),
                   f.external_id,
                   coalesce(f.delta_scope, ''),
                   f.delta_link,
                   coalesce(f.delta_synced_at, now())
              from public.receipt_channel_folders f
             where f.role = 'source'
               and f.delta_link is not null
               and f.delta_link <> ''
            -- Newest wins where a folder somehow appears twice, and a re-run never overwrites a
            -- bookmark the pipeline has since moved on.
            on conflict (channel_key, identity, folder_id) do nothing
        $sql$;
    end if;
end $$;


insert into public.package_migrations (version)
values ('tenant/0002_bookmarks_and_run_history')
on conflict (version) do nothing;
