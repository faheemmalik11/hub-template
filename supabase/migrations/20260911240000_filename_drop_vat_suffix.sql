-- Stop putting the USt-Kennzeichen in generated filenames.
--
-- Saskia, Stäy meeting 09.09.2026 (30:16): "I have no idea what this VAT field is for." At Stäy
-- there is always VAT and at the other companies never, so the suffix carried no information and
-- the toggle only asked people to decide something they had no basis to decide. She tried to turn
-- it off herself and could not -- the screen is gated by PERMISSIONS.pageDateibenennung.
--
-- The COLUMNS STAY. Other real-estate clients use the suffix, and filename.ts still reads both
-- values, so this is a setting for this tenant and not a change to the naming feature. Setting it
-- back is one update, and the front-end gate is one boolean (ZEIGE_UST_KENNZEICHEN in
-- src/routes/dateibenennung/index.tsx).
--
-- Written as an update rather than a default change: the table holds exactly one row
-- (id boolean primary key default true, migration 0070), and the default is what a fresh
-- deployment of another tenant should still get.

begin;

update public.filename_settings
   set include_vat_suffix = false,
       updated_at = now(),
       updated_by = coalesce(updated_by, 'migration 20260911240000')
 where include_vat_suffix;

commit;

-- Sanity: expect include_vat_suffix = false on the single row.
--   select id, include_vat_suffix, vat_suffix from public.filename_settings;
