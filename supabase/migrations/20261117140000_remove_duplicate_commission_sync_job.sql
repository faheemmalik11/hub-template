begin;

delete from public.scheduled_jobs where key = 'lexoffice_commission_payment_sync';

update public.scheduled_jobs
   set description = 'Reads payment status back from Lexware and marks a document or commission invoice paid once it is settled there. Every fifteen minutes.'
 where key = 'lexoffice_payment_sync';

commit;
