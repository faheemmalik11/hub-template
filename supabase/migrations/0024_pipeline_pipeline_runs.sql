-- 0013_pipeline_runs — heartbeat for the pipeline health panel (Briefing: Operation/monitoring,
-- "a visible status: running / last run / errors"). Each ingest run writes one row here so the Hub
-- can show real liveness (not just the per-email processing_log). Additive + idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0013_pipeline_runs.sql

begin;

create table if not exists public.pipeline_runs (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                         -- 'email' | 'drive' | 'upload'
  status          text not null default 'running',       -- 'running' | 'ok' | 'error'
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  processed_count int not null default 0,
  error_count     int not null default 0,
  ki_used         int not null default 0,
  note            text
);
create index if not exists pipeline_runs_source_started_idx on public.pipeline_runs (source, started_at desc);
create index if not exists pipeline_runs_started_idx on public.pipeline_runs (started_at desc);

-- RLS: read for authenticated (Hub reads the health panel); the pipeline writes via service_role.
do $$
begin
  execute 'alter table public.pipeline_runs enable row level security';
  execute 'drop policy if exists auth_read on public.pipeline_runs';
  execute 'create policy auth_read on public.pipeline_runs for select to authenticated using (true)';
end $$;

commit;

-- Sanity: select * from public.pipeline_runs order by started_at desc limit 5;
