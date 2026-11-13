begin;

insert into public.feature_settings (feature_key, enabled) values ('deals.report', true)
on conflict (feature_key) do update set enabled = excluded.enabled;

commit;
