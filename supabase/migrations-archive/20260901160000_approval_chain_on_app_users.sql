-- The approval chain names ACCOUNTS, not strings.
--
-- WHY. `approvers` has been a second people-table since 0048: you create a person on Team & Rollen,
-- then register them again on Freigabe-Regeln before they can appear in a chain. The two are joined
-- by `approvers.name` being UNIQUE and being the FK target of approval_rules.step_1/2_approver and
-- approvers.deputy_name -- so the NAME is the identity, and renaming somebody on Team & Rollen does
-- not follow. docs/ROLES_AND_ACCESS.md §3 item 1 has carried this as the single biggest remaining
-- gap since the roles model was built.
--
-- It also stores a stale copy of a permission. `approvers.role` ('assistant' | 'manager') is
-- written from `invoices.approve_final` by approverTierFor() at the moment the row is created and
-- never refreshed. Revoke the permission on Team & Rollen and the copy still says 'manager' -- and
-- `approvers_area_requires_manager` is a real CHECK constraint standing on that copy.
--
-- WHAT MOVES. Three per-person properties (deputy, escalation days, area of responsibility) and the
-- two chain steps. `payment_handler` deliberately does NOT move: it fed one hint sentence on the
-- invoice screen, it is not a property of a person, and the client asked for it to go. It stays on
-- the frozen `approvers` row as history.
--
-- WHAT DOES NOT MOVE. `approvers` keeps every row, every trash entry and its FKs. Nothing is
-- dropped and nothing is purged: the rows are the record of who was in a chain when. From here the
-- app simply stops reading it. The FKs to approvers(name) are deliberately KEPT -- the columns they
-- guard stop being written, existing values still satisfy them, and keeping them leaves
-- purge_record()'s stated reason for refusing to purge an approver true.
--
-- THE ONE CONSTRAINT THAT CANNOT COME ALONG. `approvers_area_requires_manager` said only a manager
-- may own an area. On app_users the equivalent question is "does this person hold
-- invoices.approve_final", which is a cross-table permission lookup a CHECK cannot express. It
-- becomes validation in Team & Rollen, at the point of entry, which is where the constraint was
-- actually doing its work. Section 6 below reports anybody already in the state it used to forbid.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare v_missing text := '';
begin
  if to_regclass('public.approvers') is null then v_missing := v_missing || ' approvers'; end if;
  if to_regclass('public.approval_rules') is null then v_missing := v_missing || ' approval_rules'; end if;
  if to_regclass('public.app_users') is null then v_missing := v_missing || ' app_users'; end if;
  if v_missing <> '' then
    raise exception 'preconditions failed, missing table(s):%', v_missing;
  end if;
end $$;

-- ===========================================================================
-- 1. app_users gains the chain properties
-- ===========================================================================
alter table public.app_users
  add column if not exists deputy_user_id   uuid references public.app_users(id) on delete set null,
  add column if not exists escalation_days  int,
  add column if not exists area             text,
  add column if not exists covers_all_areas boolean not null default false;

comment on column public.app_users.deputy_user_id is
  'Who covers for this person while they are away. Display only: the deputy is NAMED in the overdue '
  'warning, they are not granted anything by it. Was approvers.deputy_name, a name-based self-FK.';
comment on column public.app_users.escalation_days is
  'After how many days without approval-chain movement a receipt waiting on this person reads as '
  'overdue. NULL = no overdue warning for them. Was approvers.escalation_days.';
comment on column public.app_users.area is
  'Business area this person signs off for (migration 0087; client: "each department head approves '
  'their own area"). Feeds resolve_area_user(), which fills a rule''s empty step 2. Mutually '
  'exclusive with covers_all_areas. Was approvers.area.';
comment on column public.app_users.covers_all_areas is
  'Signs off for every area, used as the fallback when no exact area match is active. Was '
  'approvers.covers_all_areas.';

-- Validated against existing rows, which are all NULL/false at this point.
alter table public.app_users drop constraint if exists app_users_escalation_days_positive;
alter table public.app_users add constraint app_users_escalation_days_positive
  check (escalation_days is null or escalation_days > 0);

alter table public.app_users drop constraint if exists app_users_area_valid;
alter table public.app_users add constraint app_users_area_valid
  check (area is null or area in ('hospitality', 'stay_re'));

alter table public.app_users drop constraint if exists app_users_area_shape;
alter table public.app_users add constraint app_users_area_shape
  check (area is null or not covers_all_areas);

-- ===========================================================================
-- 2. approval_rules gains the id columns
-- ===========================================================================
alter table public.approval_rules
  add column if not exists step_1_user_id uuid references public.app_users(id),
  add column if not exists step_2_user_id uuid references public.app_users(id);

comment on column public.approval_rules.step_1_user_id is
  'Who checks. Replaces step_1_approver, which matched approvers(name) by string.';
comment on column public.approval_rules.step_2_user_id is
  'Who gives the final approval. NULL with skip_step_2 = false means "resolve by area of '
  'responsibility" -- resolve_approval_rule() fills it. Replaces step_2_approver.';

-- ===========================================================================
-- 3. Backfill: the person properties
--    Matched through approvers.app_user_id (the real FK, migration 20260812131000) first, then
--    case-insensitively by name for rows that predate it and never backfill-matched.
--    coalesce() throughout so a re-run never overwrites a value somebody has since edited.
-- ===========================================================================
update public.app_users u
   set escalation_days  = coalesce(u.escalation_days, a.escalation_days),
       area             = coalesce(u.area, a.area),
       covers_all_areas = u.covers_all_areas or a.covers_all_areas
  from public.approvers a
 where a.deleted_at is null
   and (
     a.app_user_id = u.id
     or (a.app_user_id is null and u.name is not null and lower(u.name) = lower(a.name))
   );

-- Deputies: two hops. approvers.deputy_name -> that approver row -> their account.
update public.app_users u
   set deputy_user_id = d.id
  from public.approvers a
  join public.approvers ad on lower(ad.name) = lower(a.deputy_name)
  join public.app_users  d on (
         ad.app_user_id = d.id
         or (ad.app_user_id is null and d.name is not null and lower(d.name) = lower(ad.name))
       )
 where u.deputy_user_id is null
   and a.deleted_at is null
   and a.deputy_name is not null
   and d.id <> u.id
   and (
     a.app_user_id = u.id
     or (a.app_user_id is null and u.name is not null and lower(u.name) = lower(a.name))
   );

-- ===========================================================================
-- 4. Backfill: the chain steps
-- ===========================================================================
update public.approval_rules r
   set step_1_user_id = coalesce(
         r.step_1_user_id,
         (select coalesce(a.app_user_id, u.id)
            from public.approvers a
            left join public.app_users u
              on u.name is not null and lower(u.name) = lower(a.name)
           where lower(a.name) = lower(r.step_1_approver)
           limit 1)),
       step_2_user_id = coalesce(
         r.step_2_user_id,
         (select coalesce(a.app_user_id, u.id)
            from public.approvers a
            left join public.app_users u
              on u.name is not null and lower(u.name) = lower(a.name)
           where lower(a.name) = lower(r.step_2_approver)
           limit 1))
 where r.step_1_approver is not null or r.step_2_approver is not null;

-- ===========================================================================
-- 5. The backfill IS the migration. A rule whose step 1 does not resolve is an invoice nobody can
--    move, so this refuses rather than leaving it half-done.
-- ===========================================================================
do $$
declare v_bad text;
begin
  select string_agg(format('%s (step 1 = %L)', r.id, r.step_1_approver), E'\n  ')
    into v_bad
    from public.approval_rules r
   where r.is_active and r.deleted_at is null
     and r.step_1_approver is not null
     and r.step_1_user_id is null;
  if v_bad is not null then
    raise exception E'step 1 of these active rules could not be resolved to an account:\n  %\n'
                    'Create the missing person on Team & Rollen (matching the name exactly), or '
                    'deactivate the rule, then re-run.', v_bad;
  end if;

  select string_agg(format('%s (step 2 = %L)', r.id, r.step_2_approver), ', ')
    into v_bad
    from public.approval_rules r
   where r.is_active and r.deleted_at is null
     and r.step_2_approver is not null
     and r.step_2_user_id is null;
  if v_bad is not null then
    -- Not fatal: an unresolved step 2 falls through to area resolution, which is the normal
    -- configuration for every rule on this Hub anyway.
    raise notice 'step 2 unresolved (falls back to area routing): %', v_bad;
  end if;
end $$;

-- ===========================================================================
-- 6. Report anybody the dropped CHECK constraint would have forbidden: an area owner who cannot
--    actually give the final approval. Reported, not rejected -- refusing here would block the
--    migration on a data state that is fixable in one click on Team & Rollen.
-- ===========================================================================
do $$
declare v_bad text;
begin
  select string_agg(u.email, ', ') into v_bad
    from public.app_users u
   where (u.area is not null or u.covers_all_areas)
     and not exists (
       select 1
         from public.permissions p
         left join public.user_permissions up
           on up.user_id = u.id and up.permission_key = p.key
         left join public.role_permissions rp
           on rp.role_id = u.role_id and rp.permission_key = p.key
        where p.key = 'invoices.approve_final'
          and coalesce(up.granted, rp.permission_key is not null)
     );
  if v_bad is not null then
    raise notice 'these people own an area but do not hold invoices.approve_final, so area routing '
                 'would resolve step 2 to somebody who sees no button: %', v_bad;
  end if;
end $$;

-- ===========================================================================
-- 7. Constraints that could only be added once the data was in place
-- ===========================================================================
-- Turns "somebody activates a second Hospitality head by mistake" into a rejected write instead of
-- a silent, order-dependent pick. Same guarantee approvers_one_active_per_area gave.
create unique index if not exists app_users_one_active_per_area
  on public.app_users (area)
  where area is not null and is_active;

alter table public.app_users drop constraint if exists app_users_deputy_not_self;
alter table public.app_users add constraint app_users_deputy_not_self
  check (deputy_user_id is null or deputy_user_id <> id);

-- ===========================================================================
-- 8. Freeze the old columns. Nothing is dropped: these rows are the record of who was in a chain
--    when, and step_1_approver/step_2_approver are what past approvals were routed by.
-- ===========================================================================
alter table public.approval_rules alter column step_1_approver drop not null;

comment on table public.approvers is
  'HISTORICAL as of this migration. The approval chain now names app_users by id '
  '(app_users.deputy_user_id/escalation_days/area/covers_all_areas and '
  'approval_rules.step_1_user_id/step_2_user_id). Nothing in the app reads this table any more. '
  'Kept, with its rows, its trash entries and its FKs, as the record of who was in a chain when.';
comment on column public.approval_rules.step_1_approver is
  'HISTORICAL. Superseded by step_1_user_id. Not written any more; existing values are what past '
  'approvals were actually routed by.';
comment on column public.approval_rules.step_2_approver is
  'HISTORICAL. Superseded by step_2_user_id.';

commit;
