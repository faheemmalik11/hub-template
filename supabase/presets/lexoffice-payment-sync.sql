insert into public.scheduled_jobs (key, edge_function, schedule, enabled, description) values
  ('lexoffice_payment_sync', 'lexoffice-payment-sync', '*/15 * * * *', false,
   'Reads payment status back from Lexware for documents already handed over, replacing bank matching for this. Timed by the cron job in the Supabase dashboard; this row only shows the last result.')
on conflict (key) do nothing;
