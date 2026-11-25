update public.scheduled_jobs
   set description = 'Reminds administrators about a deal whose property still has no payment due date, once the configured number of days after the notary date has passed. Daily at 6am.'
 where key = 'payment_due_date_reminder';
