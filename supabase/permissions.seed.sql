-- PROJECT DATA — the permission catalogue and role defaults for THIS Hub.
--
-- Idempotent and re-runnable: every statement upserts. Run it after
-- `…_permissions_model.sql` has created the mechanism, and re-run it whenever a key is added.
--
-- PORTABILITY. This is the file a different project replaces. The migration that creates the
-- tables and functions contains no keys and is copied verbatim; everything project-specific is
-- here and in `src/lib/permissions.ts`, which must list the same keys.
--
-- The role defaults below were transcribed from the role gating that was hardcoded in the app
-- before the permission model existed: app-shell's ADMIN_ROLES was (admin, super_admin),
-- NOT_ASSISTANT was (admin, super_admin, supervisor), the OPOS whitelist's own write check was
-- (admin, super_admin, supervisor) and notification settings was (admin, super_admin).

begin;

insert into public.permissions (key, category, label_de, label_en, description_de, description_en, sort_order) values
  -- Labels are what an admin reads in Team & Rollen. Written as plain actions ("Rechnungen
  -- freigeben"), not as system nouns ("Freigabe"), so the list is understandable at a glance by
  -- somebody who has never seen the permission model. The description says the consequence.
  ('invoices.book', 'buchhaltung',
   'Rechnungen prüfen und buchen', 'Check and book invoices',
   'Den Inhalt einer Rechnung bearbeiten: Beträge, Daten, Gesellschaft, Objekt, Notizen.',
   'Edit the content of an invoice: amounts, dates, company, property, notes.', 10),
  ('invoices.approve', 'freigabe',
   'Rechnungen freigeben', 'Approve invoices',
   'Eine Rechnung auf In Prüfung, Rückfrage, Freigegeben (Assistenz) oder Abgelehnt setzen.',
   'Move an invoice to In review, Query, Approved (assistant) or Rejected.', 20),
  ('invoices.approve_final', 'freigabe',
   'Endgültig freigeben', 'Give the final approval',
   'Eine Rechnung auf Freigegeben (Vorgesetzter) setzen. Erst ab diesem Schritt kann sie bezahlt werden.',
   'Move an invoice to Approved (supervisor). Only from that step can it be paid.', 30),
  ('invoices.assign', 'freigabe',
   'Rechnung jemandem zuweisen', 'Assign an invoice to someone',
   'Festlegen, wer sich um eine Rechnung kümmert (Feld "Zugewiesen an").',
   'Set who is responsible for an invoice (the "Assigned to" field).', 34),
  ('invoices.override_workflow', 'freigabe',
   'Status von Hand korrigieren', 'Correct a status by hand',
   'Jeden Schritt der Statusleiste direkt setzen, an den beiden Freigaberechten vorbei.',
   'Set any step on the status bar directly, bypassing the two approval permissions.', 36),
  ('invoices.pay', 'zahlung',
   'Zahlungen auslösen', 'Release payments',
   'Eine Überweisung auslösen und eine Rechnung als bezahlt markieren. Wer die endgültige Freigabe erteilt hat, kann dieselbe Rechnung nicht bezahlen.',
   'Release a transfer and mark an invoice paid. Whoever gave the final approval cannot pay that same invoice.', 40),
  ('opos_whitelist.write', 'zahlung',
   'Posten von der Zuordnung ausnehmen', 'Exclude items from matching',
   'Buchungen wie Gehälter oder Steuern dauerhaft aus den offenen Posten nehmen.',
   'Permanently take entries like salaries or taxes out of the open items.', 50),
  ('bank_accounts.remove', 'zahlung',
   'Bankkonto entfernen', 'Remove a bank account',
   'Ein Konto löschen. Seine Umsätze verschwinden mit.',
   'Delete an account. Its transactions go with it.', 58),
  ('postfach.settings', 'system',
   'Postfach und Ablage einrichten', 'Set up mailbox and storage',
   'Festlegen, aus welchem Postfach gelesen und wohin abgelegt wird.',
   'Decide which mailbox is read and where documents are filed.', 55),
  ('notifications.settings', 'system',
   'Benachrichtigungen einrichten', 'Set up notifications',
   'Bestimmen, wer worüber informiert wird und über welchen Kanal.',
   'Decide who is told about what, and through which channel.', 60),
  ('page.team', 'seiten',
   'Team & Rollen', 'Team & roles',
   'Personen anlegen, Rollen und Rechte vergeben.',
   'Create people, assign roles and permissions.', 110),
  ('page.papierkorb', 'seiten',
   'Papierkorb', 'Trash',
   'Gelöschte Einträge sehen und wiederherstellen.',
   'See deleted entries and restore them.', 120),
  ('page.freigabe_regeln', 'seiten',
   'Freigabe-Regeln', 'Approval rules',
   'Festlegen, wer welche Rechnungen freigibt.',
   'Decide who approves which invoices.', 140),
  ('page.dateibenennung', 'seiten',
   'Dateibenennung', 'Filename convention',
   'Regeln für Dateinamen der abgelegten Belege.',
   'Rules for the filenames of stored documents.', 130),
  ('page.auswertungen', 'seiten',
   'Auswertungen', 'Analysis',
   'Kosten und Zahlen je Gesellschaft einsehen.',
   'See costs and figures per company.', 150),
  ('page.protokoll', 'seiten',
   'Protokoll', 'Log',
   'Nachvollziehen, wer was geändert hat.',
   'Trace who changed what.', 160),
  ('page.bankverbindungen', 'seiten',
   'Bankverbindungen', 'Bank connections',
   'Bankzugänge verbinden und trennen.',
   'Connect and disconnect bank access.', 170)
on conflict (key) do update
  set category = excluded.category,
      label_de = excluded.label_de,
      label_en = excluded.label_en,
      description_de = excluded.description_de,
      description_en = excluded.description_en,
      sort_order = excluded.sort_order;

-- Role defaults, transcribed from the gating that is in the code today. app-shell's ADMIN_ROLES is
-- (admin, super_admin); NOT_ASSISTANT is (admin, super_admin, supervisor); opos-whitelist's own
-- write check is (admin, super_admin, supervisor); notification settings is (admin, super_admin).
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
  cross join public.permissions p
 where (r.name in ('admin', 'super_admin'))
    or (r.name = 'supervisor' and p.key in (
          'page.auswertungen', 'page.protokoll', 'page.bankverbindungen', 'opos_whitelist.write',
          'invoices.approve', 'invoices.approve_final', 'invoices.pay'))
    -- Appendix A7: the assistant "captures receipts, checks, assigns, sets notes, forwards to the
    -- supervisor". Booking is part of that; approval is the forwarding step.
    or (r.name = 'assistant' and p.key in ('invoices.book', 'invoices.approve'))
on conflict do nothing;

-- Loud rather than silently empty: a project whose `roles` table uses different names would insert
-- nothing above and every screen would be locked for everyone, with no clue why.
do $$
declare v_roles int;
begin
  select count(*) into v_roles from public.role_permissions;
  if v_roles = 0 then
    raise exception 'permissions.seed: no role defaults were inserted -- do the role names in '
                    'public.roles match the ones this seed lists?';
  end if;
end
$$;


-- LEGACY MIGRATION PATH ONLY. Hubs that ran the older can_book/can_approve/can_final_approve/
-- can_pay columns carry their answer there; this preserves it as an override where it DIFFERS from
-- what the role now grants. Guarded three ways, because getting this wrong locks people out:
--
--   * skipped entirely if the columns do not exist (a project that started with this model);
--   * skipped if every value is false, which means the columns were added but never populated --
--     writing those out would create `granted = false` rows that MASK the role defaults above and
--     leave everybody with nothing;
--   * only rows that DEVIATE from the role default are written. A row restating the role is noise
--     and would freeze that person against a later change to what the role means.
do $$
declare
  v_has_columns boolean;
  v_any_true    boolean;
begin
  select count(*) = 4 into v_has_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'app_users'
     and column_name in ('can_book', 'can_approve', 'can_final_approve', 'can_pay');
  if not v_has_columns then
    raise notice 'permissions.seed: legacy can_* columns absent, role defaults apply as-is';
    return;
  end if;

  execute 'select exists (select 1 from public.app_users
             where can_book or can_approve or can_final_approve or can_pay)'
     into v_any_true;
  if not v_any_true then
    raise notice 'permissions.seed: legacy can_* columns are all false, treating as unpopulated';
    return;
  end if;

  execute $sql$
    insert into public.user_permissions (user_id, permission_key, granted)
    select u.id, v.key, v.granted
      from public.app_users u
      cross join lateral (values
        ('invoices.book',          u.can_book),
        ('invoices.approve',       u.can_approve),
        ('invoices.approve_final', u.can_final_approve),
        ('invoices.pay',           u.can_pay)
      ) as v(key, granted)
     where v.granted <> exists (
       select 1 from public.role_permissions rp
        where rp.role_id = u.role_id and rp.permission_key = v.key
     )
    on conflict (user_id, permission_key) do nothing
  $sql$;
end
$$;

commit;
