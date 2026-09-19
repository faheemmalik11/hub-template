-- 0002 — Consolidate invoices.workflow_status to the approved 7-state approval chain.
--
-- Two dimensions stay SEPARATE:
--   * invoices.status         = extraction quality (erkannt / zu_pruefen) — UNCHANGED here.
--   * invoices.workflow_status = approval lifecycle (the 7 values below).
--   * paid = a SEPARATE signal (invoices.paid_at + confirmed invoice_transaction_matches) —
--     NOT a workflow value. 'ueberwiesen' is therefore removed from the workflow dimension.
--
-- Supersedes the CHECK constraint from handover/pipeline/migrations/001_hub_stufe2.sql.
-- Additive + safe: only re-maps existing rows to the new vocabulary, then swaps the CHECK.
-- Default stays 'eingegangen'. Transactional.

begin;

-- 1) Re-map existing rows to the new vocabulary (before tightening the constraint).
--    'beim_vorgesetzten' (with supervisor) == assistant released it, awaiting supervisor.
update invoices set workflow_status = 'freigegeben_assistenz'
  where workflow_status = 'beim_vorgesetzten';
--    Defensive: no rows currently use 'ueberwiesen' (paid is separate); map any stray to the
--    terminal state. Paid-ness itself lives in paid_at / bank match, not here.
update invoices set workflow_status = 'abgeschlossen'
  where workflow_status = 'ueberwiesen';

-- 2) Swap the CHECK constraint to the approved 7 values.
alter table invoices drop constraint if exists belege_workflow_status_chk;
alter table invoices add constraint belege_workflow_status_chk
  check (workflow_status in (
    'eingegangen',            -- received (system)
    'in_pruefung',            -- in review by assistant
    'rueckfrage',             -- query / parked (new)
    'freigegeben_assistenz',  -- assistant approved -> awaiting supervisor
    'freigegeben_vorgesetzter', -- supervisor approved (new)
    'uebergeben_datev',       -- handed to DATEV
    'abgeschlossen'           -- completed (new)
  ));

-- Default 'eingegangen' was set in migration 001; unchanged.
commit;

-- Sanity (run manually after applying):
--   select workflow_status, count(*) from invoices group by 1 order by 2 desc;
--   -- expect: no 'beim_vorgesetzten' / 'ueberwiesen' rows remain.
