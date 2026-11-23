begin;

update public.documents
   set intake_channel = 'manual'
 where is_demo
   and intake_channel = 'upload';

commit;
