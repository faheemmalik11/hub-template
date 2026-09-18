-- Let a sender see the reminders they sent.
--
-- notification_events_recipient_read covered the recipient and admins only, so a non-admin who
-- sent a ping had no way to confirm it went out: the Meldungen tab showed them nothing. The
-- select policy now also matches created_by, which request_approval_ping already records.
-- Idempotent, safe to re-run, and portable to the other Hubs as is.

drop policy if exists "notification_events_recipient_read" on public.notification_events;
create policy "notification_events_recipient_read" on public.notification_events
  for select to authenticated
  using (
    recipient_user_id = public.current_app_user_id()
    or created_by = public.current_app_user_id()
    or public.is_admin()
  );
