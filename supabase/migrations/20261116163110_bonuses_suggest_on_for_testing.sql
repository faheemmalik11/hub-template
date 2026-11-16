insert into public.feature_settings (feature_key, enabled) values ('bonuses.suggest', true)
  on conflict (feature_key) do update set enabled = true, updated_at = now();
