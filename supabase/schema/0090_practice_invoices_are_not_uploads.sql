-- The stop-cases practice seeds three invoices with intake_channel = 'upload', which is exactly
-- what the ingestion pipeline's upload queue selects on:
--   where intake_channel = 'upload' and deleted_at is null and extracted is null
-- The seed writes no document_files rows, so the pipeline claimed all three, found nothing to
-- download, and failed the whole run -- putting "3 documents could not be processed" in front of a
-- real user over practice data. The exercise never needed the upload channel: it is about what the
-- review queue stops on, which reads workflow_status, not where the document came from.

begin;

-- Matched on is_demo rather than on the seed's invoice numbers: practice data has no business
-- being on the upload channel whichever exercise wrote it, and a number list silently misses a row
-- when it is wrong (it was: the third is STOP-AI-1, not STOP-DUP-1).
update public.documents
   set intake_channel = 'manual'
 where is_demo
   and intake_channel = 'upload';

commit;
