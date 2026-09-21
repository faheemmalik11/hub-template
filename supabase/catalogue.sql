-- PROJECT DATA: what this Hub can do, and what each role may do by default.
--
-- This is the file a client replaces. The mechanism that reads it holds no keys at all and lives in
-- supabase/schema/0002_permissions.sql.
--
-- Four levels, and each one owns the level below: a module is a menu group, a page is a screen, a
-- section is a part of a screen, an action is something a person does. Switching a node off in
-- feature_settings takes its children with it.
--
-- Idempotent: every statement upserts, and none of them touches feature_settings, so re-running this
-- after adding a page never resets what a client switched off.
--
-- LABELS are what an admin reads while assigning rights. Written as plain actions, not as system
-- nouns, because the person reading them has never seen a permission model.

begin;

-- ---------------------------------------------------------------- the roles
--
-- `administers` decides who may manage people, rights and settings; `protected` marks the
-- break-glass account that cannot be assigned, deactivated or deleted. Neither is a name, so a
-- client can rename or add roles without a migration.
insert into public.roles (name, label, assignable, administers, protected, sort_order) values
  ('super_admin', 'Entwickler',   false, true,  true,  10),
  ('admin',       'Geschäftsführung', true, true,  false, 20),
  ('supervisor',  'Freigabe',     true,  false, false, 30),
  ('assistant',   'Buchhaltung',  true,  false, false, 40)
on conflict (name) do update
   set label = excluded.label,
       assignable = excluded.assignable,
       administers = excluded.administers,
       protected = excluded.protected,
       sort_order = excluded.sort_order;

-- ------------------------------------------------------------- the modules
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, sort_order) values
  ('module.overview',   'module', null, 'menu', 'Übersicht',   'Overview',   10),
  ('module.invoices',   'module', null, 'menu', 'Rechnungen',  'Invoices',   20),
  ('module.payments',   'module', null, 'menu', 'Zahlungen',   'Payments',   30),
  ('module.master_data','module', null, 'menu', 'Stammdaten',  'Master data',40),
  ('module.rules',      'module', null, 'menu', 'Regeln',      'Rules',      50),
  ('module.taxes',      'module', null, 'menu', 'Steuern',     'Taxes',      60),
  ('module.reports',    'module', null, 'menu', 'Auswertungen','Reports',    70),
  ('module.admin',      'module', null, 'menu', 'Verwaltung',  'Administration', 80)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- the pages
--
-- `locked` on the three a client must never lose: the overview they land on, their own profile, and
-- the screen where rights are administered, which is the one that could put everything else back.
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, locked, sort_order) values
  ('page.overview',            'page', 'module.overview',    'menu', 'Übersicht sehen',            'See the overview',            true,  110),
  ('page.profile',             'page', 'module.overview',    'menu', 'Eigenes Profil',             'Own profile',                 true,  120),

  ('page.incoming_invoices',   'page', 'module.invoices',    'menu', 'Eingangsrechnungen sehen',   'See incoming invoices',       false, 210),
  ('page.outgoing_invoices',   'page', 'module.invoices',    'menu', 'Ausgangsrechnungen sehen',   'See outgoing invoices',       false, 220),
  ('page.manual_bookings',     'page', 'module.invoices',    'menu', 'Manuelle Buchungen',         'Manual bookings',             false, 230),
  ('page.file_naming',         'page', 'module.invoices',    'menu', 'Dateibenennung',             'File naming',                 false, 240),
  ('page.document_sources',    'page', 'module.invoices',    'menu', 'Belegquellen und Ablage',    'Document sources and filing', false, 250),

  ('page.open_items',          'page', 'module.payments',    'menu', 'Offene Posten',              'Open items',                  false, 310),
  ('page.bank_transactions',   'page', 'module.payments',    'menu', 'Banktransaktionen',          'Bank transactions',           false, 320),
  ('page.bank_accounts',       'page', 'module.payments',    'menu', 'Bankkonten',                 'Bank accounts',               false, 330),
  ('page.open_item_whitelist', 'page', 'module.payments',    'menu', 'Ausnahmen offene Posten',    'Open item exceptions',        false, 340),
  ('page.bank_settings',       'page', 'module.payments',    'menu', 'Bank-Einstellungen',         'Bank settings',               false, 350),

  ('page.suppliers',           'page', 'module.master_data', 'menu', 'Lieferanten',                'Suppliers',                   false, 410),
  ('page.customers',           'page', 'module.master_data', 'menu', 'Kunden',                     'Customers',                   false, 420),
  ('page.companies',           'page', 'module.master_data', 'menu', 'Gesellschaften',             'Companies',                   false, 430),
  ('page.properties',          'page', 'module.master_data', 'menu', 'Objekte',                    'Properties',                  false, 440),
  ('page.categories',          'page', 'module.master_data', 'menu', 'Kategorien',                 'Categories',                  false, 450),

  ('page.assignment_rules',    'page', 'module.rules',       'menu', 'Zuordnungsregeln',           'Assignment rules',            false, 510),
  ('page.approval_rules',      'page', 'module.rules',       'menu', 'Freigabe-Regeln',            'Approval rules',              false, 520),
  ('page.exclusion_rules',     'page', 'module.rules',       'menu', 'Ausschlussregeln',           'Exclusion rules',             false, 530),

  ('page.vat_rules',           'page', 'module.taxes',       'menu', 'USt-Regeln',                 'VAT rules',                   false, 610),
  ('page.tax_reserve',         'page', 'module.taxes',       'menu', 'Steuerrücklage',             'Tax reserve',                 false, 620),
  ('page.handover',            'page', 'module.taxes',       'menu', 'Übergabe an die Kanzlei',    'Handover to the accountant',  false, 630),

  ('page.reports',             'page', 'module.reports',     'menu', 'Auswertungen sehen',         'See reports',                 false, 710),

  ('page.team',                'page', 'module.admin',       'menu', 'Team und Rollen',            'Team and roles',              true,  810),
  ('page.onboarding',          'page', 'module.admin',       'menu', 'Einrichtung',                'Setup',                       false, 820),
  ('page.notifications',       'page', 'module.admin',       'menu', 'Benachrichtigungen',         'Notifications',               false, 830),
  ('page.activity_log',        'page', 'module.admin',       'menu', 'Protokoll',                  'Activity log',                false, 840),
  ('page.trash',               'page', 'module.admin',       'menu', 'Papierkorb',                 'Trash',                       false, 850)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       locked = excluded.locked, sort_order = excluded.sort_order;

-- ------------------------------------------------------------- the sections
--
-- Bank connections stopped being a screen when it merged into Bankkonten, but it still gates the
-- connection controls there, so it becomes a section of that page rather than a page of its own.
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, sort_order) values
  ('page.bank_connections', 'section', 'page.bank_accounts', 'menu', 'Bankverbindungen', 'Bank connections', 335)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en, sort_order = excluded.sort_order;

-- -------------------------------------------------------------- the actions
--
-- The ten area capabilities the schema's own policies ask for are declared here, because a policy
-- that names a key nobody granted denies everyone. See the contract at the top of 0010_access.sql.
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, sort_order) values
  ('users.read',        'action', 'page.team',              'access', 'Team sehen', 'See the team',
   'Die Personen und ihre Rollen ansehen, ohne sie zu ändern.',
   'See who is on the team and what they may do, without changing it.', 910),

  ('documents.read',    'action', 'page.incoming_invoices', 'documents', 'Belege sehen', 'See documents',
   'Alle erfassten Belege und alles, was daran hängt.',
   'Every captured document and everything attached to it.', 920),
  ('documents.write',   'action', 'page.incoming_invoices', 'documents', 'Belege bearbeiten', 'Edit documents',
   'Felder korrigieren, Notizen setzen, einen Beleg zuordnen.',
   'Correct fields, set notes, assign a document.', 930),
  ('invoices.approve',  'action', 'page.incoming_invoices', 'approval', 'Freigeben', 'Approve',
   'Einen Beleg zur Zahlung freigeben oder mit Rückfrage zurückgeben.',
   'Approve a document for payment, or send it back with a query.', 940),
  ('invoices.approve_final', 'action', 'page.incoming_invoices', 'approval', 'Endgültig freigeben', 'Give the final approval',
   'Den letzten Freigabeschritt. Erst danach kann gezahlt werden.',
   'The last approval step. Only after it can anything be paid.', 950),
  ('invoices.override_workflow', 'action', 'page.incoming_invoices', 'approval', 'Status von Hand setzen', 'Set a status by hand',
   'Jeden Schritt direkt setzen, an den Freigaberechten vorbei.',
   'Set any step directly, bypassing the approval rights.', 960),

  ('master_data.read',  'action', 'page.suppliers',         'master_data', 'Stammdaten sehen', 'See master data',
   'Lieferanten, Kunden, Gesellschaften, Objekte, Kategorien.',
   'Suppliers, customers, companies, properties, categories.', 970),
  ('master_data.write', 'action', 'page.suppliers',         'master_data', 'Stammdaten pflegen', 'Maintain master data',
   'Anlegen und ändern, eine Bankverbindung bestätigen.',
   'Create and change them, and confirm a bank account.', 980),

  ('bank.read',         'action', 'page.bank_transactions', 'bank', 'Bank sehen', 'See the bank',
   'Konten, Umsätze und ihren Abgleich.',
   'Accounts, transactions and how they are reconciled.', 990),
  ('bank.write',        'action', 'page.bank_transactions', 'bank', 'Abgleichen', 'Reconcile',
   'Umsätze zuordnen, ignorieren oder als belegfrei kennzeichnen.',
   'Match transactions, ignore them, or mark one as needing no document.', 1000),
  ('payments.write',    'action', 'page.open_items',        'bank', 'Zahlung auslösen', 'Raise a payment',
   'Eine Überweisung aus einem freigegebenen Beleg erzeugen.',
   'Create a transfer from an approved document.', 1010),

  ('rules.write',       'action', 'page.assignment_rules',  'rules', 'Regeln ändern', 'Change the rules',
   'Zuordnung, Freigabe und Übergabe: was automatisch passieren soll.',
   'Assignment, approval and handover: what should happen by itself.', 1020),
  ('settings.manage',   'action', 'page.onboarding',        'settings', 'Einrichtung ändern', 'Change the setup',
   'Belegquellen, Ablage, Dateinamen, Benachrichtigungen.',
   'Document sources, filing, file names, notifications.', 1030)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       sort_order = excluded.sort_order;

-- ------------------------------------------------------- what a role means
--
-- Presets, not laws: an admin edits these on the Rollen tab afterwards. `user_permissions` is what
-- deviates from them for one person, in either direction.

-- Everyone signed in sees the menu they can use, so every role gets every module, page and section
-- by default. What they may DO is the action rows below, and that is where the roles differ.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
  cross join public.permissions p
 where p.kind in ('module', 'page', 'section')
   and not (p.key in ('page.team', 'page.bank_connections', 'page.activity_log', 'page.trash')
            and not r.administers)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join lateral (
    select unnest(
      case
        when r.administers then array[
          'users.read', 'documents.read', 'documents.write',
          'invoices.approve', 'invoices.approve_final', 'invoices.override_workflow',
          'master_data.read', 'master_data.write',
          'bank.read', 'bank.write', 'payments.write',
          'rules.write', 'settings.manage']
        when r.name = 'supervisor' then array[
          'documents.read', 'documents.write',
          'invoices.approve', 'invoices.approve_final',
          'master_data.read', 'bank.read', 'bank.write', 'payments.write']
        else array[
          'documents.read', 'documents.write', 'invoices.approve',
          'master_data.read', 'master_data.write', 'bank.read', 'bank.write']
      end
    )
  ) as caps(k)
 where exists (select 1 from public.permissions p where p.key = caps.k)
on conflict do nothing;


-- ------------------------------------------------------- what runs on a timer
--
-- Project data, because every client runs a different set. All OFF: a clone that is not finished
-- being set up must not start calling out, and the vault has no keys yet anyway.
--
-- A client that needs a job the template does not list adds a row. It does not need a migration,
-- and the Edge Function it names is deployed like any other.
insert into public.scheduled_jobs (key, edge_function, schedule, enabled, description) values
  ('ingest', 'ingest', '0 * * * *', false,
   'Reads the document sources and files what arrived. Hourly.'),
  ('bank_sync', 'bank-sync', '7 * * * *', false,
   'Fetches bank transactions. Seven minutes past the hour, so it does not collide with the ingest.'),
  ('notify_dispatch', 'notify-dispatch', '*/15 * * * *', false,
   'Sends the notifications that are waiting. Every fifteen minutes.')
on conflict (key) do update
   set edge_function = excluded.edge_function,
       description = excluded.description;


-- ------------------------------------------------ what needs what
--
-- Containment is already in parent_key. These are the dependencies that cross the tree, and they
-- are the ones a client trips over: switch banking off and open items becomes a list that can only
-- ever be empty, because an open item is a document the bank has not covered.
insert into public.feature_requirements (feature_key, requires_key) values
  ('page.open_items',        'module.payments'),
  ('page.open_items',        'page.incoming_invoices'),
  ('bank.write',             'bank.read'),
  ('payments.write',         'bank.read'),
  ('payments.write',         'invoices.approve_final'),
  ('page.handover',          'page.incoming_invoices'),
  ('page.manual_bookings',   'page.categories'),
  ('page.assignment_rules',  'page.categories'),
  ('documents.write',        'documents.read'),
  ('master_data.write',      'master_data.read'),
  ('invoices.approve_final', 'invoices.approve')
on conflict do nothing;

-- Loud rather than silently empty: a project whose roles are named differently would insert nothing
-- above, and every screen would be locked for everyone with no clue why.
do $$
declare
    v_roles int;
    v_grants int;
begin
    select count(*) into v_roles from public.roles;
    select count(*) into v_grants from public.role_permissions;
    if v_roles = 0 or v_grants = 0 then
        raise exception 'catalogue seeded % roles and % grants; the app would be locked for everyone',
            v_roles, v_grants;
    end if;
end
$$;

commit;
