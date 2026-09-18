-- Removes app_users.area_of_responsibility (added by migration 0078_staey_people.sql), per an
-- explicit request in this session after confirming it's genuinely dead: grepped across src/ and
-- every RLS function/policy -- nothing reads this column. 0078's own comment already flagged it
-- as "NOT yet used for routing" (client-supplied free text, captured so it wasn't lost, wiring
-- it into anything was always deferred). The column that actually matters for approval routing
-- is approvers.area/covers_all_areas (migration 0087_area_based_approval.sql), untouched here.
--
-- A later comment on 0087 (around line 15) claimed this column "drives company VISIBILITY" --
-- that claim was never true in code: company visibility is entirely user_company_access/
-- has_company_access(), which has never referenced this column. Recorded here so a future
-- session doesn't go looking for a wiring that never existed.

begin;

alter table public.app_users
  drop column if exists area_of_responsibility;

commit;
