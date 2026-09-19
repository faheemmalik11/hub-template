-- Records every model call the AI search pipeline makes (classify + each SQL-generation
-- attempt), so spend can be measured later. Recording only for now: no view, no dashboard, no
-- RLS policy for client reads — matches pipeline_runs' pattern of a server-only internal table,
-- written exclusively by the service-role search server function.
--
-- provider/model are plain text, not an enum: the model client that produced them names itself
-- (today only openAiModelClient sets provider = 'openai'), so a future non-OpenAI client needs no
-- migration to be recorded here.
--
-- search_id groups every row from one user question (1 classify row + 1-4 sql_generate rows for
-- its retries) so cost per question can be summed with `group by search_id`.

create table if not exists public.ai_search_usage (
    id             uuid        primary key default gen_random_uuid(),
    search_id      uuid        not null,
    created_at     timestamptz not null default now(),
    question       text        not null,
    language       text,
    intent         text,
    stage          text        not null check (stage in ('classify', 'sql_generate')),
    attempt        integer     not null default 1,
    provider       text        not null,
    model          text        not null,
    input_tokens   integer     not null default 0,
    output_tokens  integer     not null default 0
);

create index if not exists ai_search_usage_search_id on public.ai_search_usage (search_id);
create index if not exists ai_search_usage_created_at on public.ai_search_usage (created_at desc);
