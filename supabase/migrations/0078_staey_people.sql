-- 0078_staey_people — Stäy's staff: department heads, accounting, and the first admin.
--
-- SOURCES (verbatim client messages, communication/threads/):
--   * 2026-08-04-companies-and-cost-centers  — accounting staff and their companies
--   * 2026-08-04-department-heads-and-approvals — the four department heads and their areas
--
-- Idempotent: `on conflict do nothing` everywhere, so a re-run changes nothing and any row an
-- admin has since edited via /team survives untouched.

begin;

-- ---------------------------------------------------------------------------
-- 1. area_of_responsibility — Stäy routes approvals by AREA, immonetz by chain
--
-- The client's model: "each department head approves their own area (for example Hospitality,
-- or Stäy real estate)". Nothing in the imported schema carries an area: approval_rules can
-- target supplier / business line / property / company, never an area. This column stores what
-- the client told us so it is not lost; wiring it into routing is a separate piece of work that
-- needs one answer first -- see the note at the bottom.
-- ---------------------------------------------------------------------------
alter table public.app_users
  add column if not exists area_of_responsibility text;

comment on column public.app_users.area_of_responsibility is
  'Free text from the client, e.g. "Hospitality", "Stäy RE and projects", "All areas". Stäy '
  'routes approvals by area rather than up a management chain. NOT yet used for routing: '
  'nothing on a receipt resolves to an area (see 0078 note).';

-- ---------------------------------------------------------------------------
-- 2. People
--
-- auth_user_id is NULL and is_active is FALSE for everyone except the existing admin: these are
-- records, not logins. A Supabase auth user must exist before anyone can sign in, and the proper
-- route for that is createEmployee (/team), which sets a one-time password and forces a change.
-- Seeding a login here would mean inventing a password.
--
-- EMAILS: the four department heads' addresses are given verbatim by the client. Petra's and
-- Vanessa's are DERIVED from the rule the client stated -- "The email address always follows
-- this format: firstname.lastname@staey.de" -- and are marked below. Confirm before inviting.
--
-- ROLES: mapped from the four seeded in 0001 (super_admin, admin, supervisor, assistant).
-- This mapping is an INTERPRETATION, not something the client stated:
--   "All areas"          -> admin       (Saskia, Andreas)
--   a specific area      -> supervisor  (Lukas, Alexis)
--   accounting           -> assistant   (Petra, Vanessa)
-- ---------------------------------------------------------------------------
insert into public.app_users (email, name, role_id, area_of_responsibility, is_active, must_change_password)
select v.email, v.name, r.id, v.area, false, true
  from (values
    -- Department heads (thread 2) — emails given by the client
    ('alexis.gonzalez@staey.de', 'Alexis Gonzalez', 'supervisor', 'Hospitality'),
    ('saskia.christ@staey.de',   'Saskia Christ',   'admin',      'All areas'),
    ('andreas.christ@staey.de',  'Andreas Christ',  'admin',      'All areas'),
    ('lukas.oldach@staey.de',    'Lukas Oldach',    'supervisor', 'Stäy RE and projects'),
    -- Accounting (thread 1) — emails DERIVED from the stated firstname.lastname@staey.de rule
    ('petra.kistner@staey.de',   'Petra Kistner',   'assistant',
       'Buchhaltung: Stäy, Impuls, Gronau + Post, Überweisungen und Vorprüfung für alle Gesellschaften'),
    ('vanessa.zelt@staey.de',    'Vanessa Zelt',    'assistant',
       'Buchhaltung: My Baufi, Infio')
  ) as v(email, name, role_name, area)
  join public.roles r on r.name = v.role_name
on conflict do nothing;

-- The first admin: links the existing Supabase auth account so someone can actually sign in.
-- Without a row here the app cannot resolve the session to a user and every screen is empty.
-- must_change_password is false — this password was set directly in the dashboard, not issued
-- as a one-time secret.
insert into public.app_users (auth_user_id, email, name, role_id, is_active, must_change_password)
select u.id, u.email, 'Faheem Malik', r.id, true, false
  from auth.users u
  cross join public.roles r
 where u.email = 'faheemmalik3002@gmail.com'
   and r.name = 'admin'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Company access — ONLY where the client stated it
--
-- ⚠️ has_company_access() treats "no grants recorded" as UNRESTRICTED (0065, adopting the
-- pre-existing design so nobody is locked out when enforcement lands). So an ungranted user sees
-- EVERY company. That is why:
--   * Petra and Vanessa get exactly the companies the client named;
--   * Saskia and Andreas get all five ("All areas");
--   * Alexis and Lukas get NOTHING here and stay is_active = false, because the client gave them
--     an AREA, not companies. Granting a guess would be wrong, and leaving them ungranted AND
--     active would silently give them everything.
-- ---------------------------------------------------------------------------
insert into public.user_company_access (user_id, company_id, can_view)
select u.id, c.id, true
  from public.app_users u
  join (values
    ('petra.kistner@staey.de',  'STAY'),
    ('petra.kistner@staey.de',  'IMPV'),
    ('petra.kistner@staey.de',  'STGR'),
    ('vanessa.zelt@staey.de',   'MYBA'),
    ('vanessa.zelt@staey.de',   'INFI'),
    ('saskia.christ@staey.de',  'STAY'),
    ('saskia.christ@staey.de',  'MYBA'),
    ('saskia.christ@staey.de',  'IMPV'),
    ('saskia.christ@staey.de',  'STGR'),
    ('saskia.christ@staey.de',  'INFI'),
    ('andreas.christ@staey.de', 'STAY'),
    ('andreas.christ@staey.de', 'MYBA'),
    ('andreas.christ@staey.de', 'IMPV'),
    ('andreas.christ@staey.de', 'STGR'),
    ('andreas.christ@staey.de', 'INFI')
  ) as g(email, company_code) on lower(u.email) = g.email
  join public.companies c on c.code = g.company_code
on conflict (user_id, company_id) do nothing;

commit;

-- ===========================================================================
-- NOT DONE HERE, and why
--
-- 1. APPROVAL ROUTING BY AREA. approval_rules targets supplier / business_line / property /
--    company / min_amount. There is no area dimension, and nothing on a receipt resolves to
--    "Hospitality" or "Stäy RE and projects".
--
--    THE QUESTION FOR THE CLIENT: is an "area of responsibility" the same thing as a business
--    line? The four seeded lines are LTR (long-term rental), STR (short-term rental), DEV
--    (development for sale), SVC (services). If Hospitality = STR and "Stäy RE and projects" =
--    LTR + DEV, then approval rules already target it and this is CONFIGURATION. If not, area is
--    a new dimension and it is a BUILD. That one answer decides the size of the work.
--
-- 2. NOBODY IS INVITED. Six rows exist with auth_user_id NULL and is_active false. They appear on
--    /team as pending. Use createEmployee there to issue each a one-time password -- that creates
--    the Supabase auth user and links it. Do not hand-insert into auth.users.
--
-- 3. PETRA'S CROSS-COMPANY DUTIES are recorded as text only. The client: "mail handling, bank
--    transfers, and preliminary invoice checks FOR ALL COMPANIES", while she is assigned to just
--    three. That is a ROLE that cuts across her company grants, and the current model cannot
--    express "may pre-check invoices for a company she is not assigned to". Raise it before
--    enforcement is switched on, or she will be blocked from work she is meant to do.
--
-- 4. APPROVERS vs APP_USERS. The approvers table (used by /freigabe-regeln) is separate and
--    holds plain names, with role limited to 'assistant' | 'manager' — immonetz's two-step chain.
--    Stäy's heads are not seeded there: 'supervisor' is not an allowed value, and pointing an
--    approval chain at people before the area question is settled would encode a guess.
--
-- Sanity after applying:
--   select email, name, area_of_responsibility, is_active from app_users order by email;  -- 7 rows
--   select u.email, count(c.*) from app_users u
--     left join user_company_access a on a.user_id = u.id
--     left join companies c on c.id = a.company_id group by 1 order by 1;
-- ===========================================================================
