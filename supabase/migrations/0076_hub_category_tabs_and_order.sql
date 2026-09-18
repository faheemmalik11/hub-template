-- 0076_hub_category_tabs_and_order.sql
-- Category management, two client requirements from the payment-category specification
-- (communication/threads/2026-08-04-scope-clarification, "Bilingual Payment Category
-- Specification"): the list must be split into two tabs (Zahlungseingänge / Zahlungsausgänge),
-- and the user must be able to drag parents and children into their own order.
--
-- Additive only. Both columns are nullable-with-default, no existing row loses anything, and the
-- BWA columns (bwa_block, bwa_line) are deliberately left untouched: whether BWA categorisation
-- stays at all is still an open question with the client ("NO need for Live BWA", scope unclear —
-- see communication/INDEX.md, awaiting-client item 9). This migration is safe under either answer.

-- ---------------------------------------------------------------------------
-- 1. direction — which tab a category belongs to
-- ---------------------------------------------------------------------------
-- The spec has exactly two tabs. bwa_block cannot serve as the flag: it has six values, and four
-- of them ('neutral', 'steuern', 'sonderfall', 'wareneinsatz') do not map to one tab or the other
-- on their own. Kept as its own column so the tab split survives a BWA removal.
alter table public.bwa_categories
  add column if not exists direction text not null default 'ausgang'
    check (direction in ('eingang', 'ausgang'));

comment on column public.bwa_categories.direction is
  'Which tab the category appears under: eingang = Zahlungseingänge, ausgang = Zahlungsausgänge.';

-- Backfill from the existing BWA block. 'einnahmen' is unambiguously money in; everything else
-- defaults to money out, which is what the column default already gives. Children follow their
-- parent, mirroring how the create dialog already inherits bwa_block/bwa_line from the parent.
-- Only touches rows still at the column default, so a re-run cannot undo a category a user has
-- since moved to the other tab by hand.
update public.bwa_categories c
   set direction = 'eingang'
 where c.direction = 'ausgang'
   and (
     c.bwa_block = 'einnahmen'
     or exists (
       select 1 from public.bwa_categories p
        where p.id = c.parent_id and p.bwa_block = 'einnahmen'
     )
   );

-- ---------------------------------------------------------------------------
-- 2. sort_order — user-defined ordering, per level
-- ---------------------------------------------------------------------------
-- The tree is currently sorted alphabetically in the client (name_de.localeCompare), which the
-- spec explicitly replaces with drag-and-drop. Ordering is scoped to a level: parents order among
-- parents, children among their siblings, so a reorder never has to renumber the whole table.
alter table public.bwa_categories
  add column if not exists sort_order integer not null default 0;

comment on column public.bwa_categories.sort_order is
  'Manual order within one level (siblings under the same parent_id). Lower sorts first; ties fall '
  'back to name_de so the order is always deterministic.';

-- Seed the existing rows in their current visible order (alphabetical within each level), so
-- turning on drag-and-drop does not reshuffle what the user sees today.
--
-- Guarded so a re-run is a no-op. This runs on a database where the columns may already exist
-- (they are added with `if not exists` above), and an unguarded re-run would renumber every row
-- back to alphabetical, silently discarding whatever order a user had dragged. Every row still
-- sitting at the column default of 0 means nobody has ordered anything yet, which is the only
-- state where seeding is safe.
do $$
begin
  if not exists (select 1 from public.bwa_categories where sort_order <> 0) then
    with ranked as (
      select id,
             row_number() over (
               partition by parent_id, direction
               order by name_de
             ) * 10 as rn
        from public.bwa_categories
       where deleted_at is null
    )
    update public.bwa_categories c
       set sort_order = ranked.rn
      from ranked
     where ranked.id = c.id;
  end if;
end $$;

-- Gaps of 10 leave room to insert between two rows without renumbering their neighbours.

create index if not exists bwa_categories_tab_order
  on public.bwa_categories (direction, parent_id, sort_order)
  where deleted_at is null;
