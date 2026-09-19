create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

create table if not exists public.tour_progress (
    user_id       uuid        not null references auth.users (id) on delete cascade,
    tour_id       text        not null,
    version       integer     not null default 1,
    status        text        not null,
    last_step     integer     not null default 0,
    first_seen_at timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    primary key (user_id, tour_id)
);

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'tour_progress_status_known') then
        alter table public.tour_progress
            add constraint tour_progress_status_known
            check (status in ('skipped', 'completed'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'tour_progress_tour_id_present') then
        alter table public.tour_progress
            add constraint tour_progress_tour_id_present
            check (length(btrim(tour_id)) > 0);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'tour_progress_counts_sane') then
        alter table public.tour_progress
            add constraint tour_progress_counts_sane
            check (version >= 1 and last_step >= 0);
    end if;
end
$$;

alter table public.tour_progress enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
         where schemaname = 'public' and tablename = 'tour_progress'
           and policyname = 'tour_progress_own_rows'
    ) then
        create policy tour_progress_own_rows on public.tour_progress
            for all
            to authenticated
            using (user_id = auth.uid())
            with check (user_id = auth.uid());
    end if;
end
$$;

grant select, insert, update, delete on public.tour_progress to authenticated;

create or replace function public.touch_tour_progress()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    new.first_seen_at := old.first_seen_at;
    return new;
end;
$$;

drop trigger if exists trg_tour_progress_touch on public.tour_progress;
create trigger trg_tour_progress_touch
    before update on public.tour_progress
    for each row execute function public.touch_tour_progress();

insert into public.package_migrations (version)
values ('20260904130000_tour_progress')
on conflict (version) do nothing;
