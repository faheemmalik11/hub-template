-- Five tables shipped with no row level security and with Supabase's default public-schema grants
-- intact, so the anon key in the browser bundle held select, insert, update, delete and truncate on
-- all five. Verified live: anon could read feature_settings_history in full.
--
-- RLS alone would not have closed it. The grants have to go as well, the same way
-- document_history's do in 0010_access.sql, or anon keeps a direct write path.

begin;

revoke all on public.review_score_rules from anon;
revoke all on public.review_confidence_bands from anon;
revoke all on public.package_migrations from anon;
revoke all on public.feature_settings_history from anon;
revoke all on public.document_types from anon;

-- feature_settings_audit() runs with the invoker's rights, so with RLS on and no policy the
-- trigger's own insert is refused and every feature toggle fails. Definer keeps the trail
-- append-only by trigger while staying unreadable and unforgeable over REST.
create or replace function public.feature_settings_audit() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
    if tg_op = 'UPDATE' and new.enabled is not distinct from old.enabled then
        return new;
    end if;
    if tg_op = 'DELETE' then
        insert into public.feature_settings_history (feature_key, enabled, changed_by, operation)
        values (old.feature_key, old.enabled, old.updated_by, 'delete');
        return old;
    end if;
    insert into public.feature_settings_history (feature_key, enabled, changed_by, operation)
    values (new.feature_key, new.enabled, new.updated_by, lower(tg_op));
    return new;
end;
$$;

alter table public.feature_settings_history enable row level security;
alter table public.package_migrations enable row level security;

alter table public.review_score_rules enable row level security;
drop policy if exists review_score_rules_read on public.review_score_rules;
create policy review_score_rules_read on public.review_score_rules
    for select to authenticated using (public.may_read('documents.read'));

alter table public.review_confidence_bands enable row level security;
drop policy if exists review_confidence_bands_read on public.review_confidence_bands;
create policy review_confidence_bands_read on public.review_confidence_bands
    for select to authenticated using (public.may_read('documents.read'));

alter table public.document_types enable row level security;
drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types
    for select to authenticated using (public.may_read('master_data.read'));
drop policy if exists document_types_write on public.document_types;
create policy document_types_write on public.document_types
    for all to authenticated
    using (public.may_write('master_data.write'))
    with check (public.may_write('master_data.write'));

commit;
