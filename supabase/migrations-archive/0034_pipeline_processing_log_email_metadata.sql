-- 0024_processing_log_email_metadata — persist the source email's body text and send date.
--
-- Briefing Screen 2 requires subject, sender, mail text, send date to be shown for a mail-imported
-- invoice. subject/sender already flow through (processing_log.subject/sender). body_text is already
-- extracted in gmail_source.get_message() but only used transiently to decide whether to run AI
-- extraction on it; the send date is not extracted at all (processed_at is the pipeline's own
-- processing timestamp, not the email's send date). Nullable and additive only: every existing row
-- gets NULL for both, which the Hub frontend treats as "not available" for that historic entry.
alter table processing_log add column if not exists body text;
alter table processing_log add column if not exists sent_at timestamptz;
