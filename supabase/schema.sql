-- Stäy Hub, the real Supabase (Postgres) schema.
--
-- Captured 16.09.2026 with `supabase db dump` from the live project (ref: xsgbdtdwhrrhoeximeon),
-- after the bookkeeping rename (invoices -> documents and the rest).
--
-- REFRESH THIS FROM THE DATABASE, NOT FROM THE REPO. ./scripts/dump-live-schema.sh does it.
-- The file this replaces was a hand-written German-era sketch of 10 tables carrying MAYESTATE's
-- project ref, copied across and never updated. It described no database that has ever existed
-- here, and it misled three separate pieces of work during the rename.
--
-- It is a SNAPSHOT for reading. Migrations in supabase/migrations/ are what actually change the
-- database, and some tables here are created by the book-keeping pipeline rather than by any
-- migration in this repo.
-- PostgreSQL database dump
--

-- \restrict 2Mo41Nk9kxcQiwKO3GHfQC129GrraHnQTQ0FH3cFkbNAz03iHwKggu9rKuWWfKJ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: acknowledge_datev_batch("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'acknowledge_datev_batch: authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company
    from public.datev_handover_batches
   where id = p_batch_id;

  if v_company is null then
    raise exception 'acknowledge_datev_batch: no batch %', p_batch_id;
  end if;

  if not public.has_company_access(v_company) then
    raise exception 'acknowledge_datev_batch: no access to this company'
      using errcode = 'insufficient_privilege';
  end if;

  update public.datev_handover_batches
     set acknowledged_at = now(),
         acknowledged_by = nullif(btrim(coalesce(p_actor, '')), '')
   where id = p_batch_id
     and status = 'bounced'
     and acknowledged_at is null;
end;
$$;


ALTER FUNCTION "public"."acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text") OWNER TO "postgres";

--
-- Name: acknowledge_notification(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."acknowledge_notification"("p_event_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := public.current_app_user_id();
begin
  if v_user is null then
    raise exception 'acknowledge_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;

  -- Scoped to the recipient in the WHERE clause rather than checked first: a security definer
  -- function that reads the row and then decides would let somebody else's id through a race.
  -- Already-acknowledged rows keep their original timestamp, so a double click does not rewrite
  -- when it was read.
  update public.notification_events
     set acknowledged_at = now()
   where id = p_event_id
     and recipient_user_id = v_user
     and acknowledged_at is null;
end $$;


ALTER FUNCTION "public"."acknowledge_notification"("p_event_id" bigint) OWNER TO "postgres";

--
-- Name: advance_workflow_on_datev_handover(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."advance_workflow_on_datev_handover"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.datev_handed_over_at is not null and old.datev_handed_over_at is null
     and new.workflow_status = 'bezahlt'
  then
    update public.documents
       set workflow_status = 'uebergeben_datev', updated_at = now()
     where id = new.id;

    insert into public.document_history (document_id, type, text, actor)
    values (new.id, 'uebergeben_datev', 'Workflow: An DATEV übergeben', 'system');
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."advance_workflow_on_datev_handover"() OWNER TO "postgres";

--
-- Name: advance_workflow_on_payment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."advance_workflow_on_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_text text;
  v_actor text;
begin
  if new.paid_at is not null and old.paid_at is null
     and new.workflow_status in (
       'eingegangen', 'in_pruefung', 'rueckfrage',
       'freigegeben_assistenz', 'freigegeben_vorgesetzter'
     )
  then
    v_text := case new.paid_source
      when 'bank_match' then 'Workflow: Bezahlt (Bankabgleich bestätigt)'
      when 'manual' then 'Workflow: Bezahlt (manuell markiert)'
      else 'Workflow: Bezahlt'
    end;

    -- nullif guards the empty-string case: a JWT with no email claim would otherwise be recorded
    -- as an actor of '', which reads as a blank line rather than as the system.
    v_actor := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

    update public.documents
       set workflow_status = 'bezahlt', updated_at = now()
     where id = new.id;

    insert into public.document_history (document_id, type, text, actor, data)
    values (
      new.id,
      'bezahlt',
      v_text,
      v_actor,
      jsonb_build_object('nach', 'bezahlt', 'paid_source', new.paid_source)
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."advance_workflow_on_payment"() OWNER TO "postgres";

--
-- Name: apply_assignment_rule_bulk("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r          public.assignment_rules;
  v_row      record;
  v_res      jsonb;
  v_total    int := 0;
  v_changed  int := 0;
  v_skipped  int := 0;
  v_blocked  int := 0;
  v_ids      uuid[] := array[]::uuid[];
  -- Read once, not per row: it cannot change inside one statement, and has_company_access() is
  -- STABLE but not free.
  v_scoped   boolean := auth.uid() is not null;
begin
  select * into r from public.assignment_rules where id = p_rule and deleted_at is null;
  if not found then
    raise exception 'rule % not found or deleted', p_rule;
  end if;
  if not r.is_active then
    raise exception 'rule % is inactive; activate it before applying it retroactively', p_rule;
  end if;

  for v_row in
    select i.id as id,
           (not v_scoped or public.has_company_access(i.company_id)) as allowed
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.property_id      is null or r.property_id      = i.property_id)
       and (r.company_id       is null or r.company_id       = i.company_id)
       and (
         r.reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
       )
     order by i.created_at
  loop
    -- Counted, then passed over. `matches` stays the number of receipts this caller could have
    -- seen, so it keeps agreeing with what assignment_rule_preview() showed them.
    if not v_row.allowed then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    v_total := v_total + 1;
    v_res := public.apply_assignment_rules(v_row.id, p_actor);
    if jsonb_array_length(v_res->'changed') > 0 then
      v_changed := v_changed + 1;
      v_ids := v_ids || v_row.id;
    elsif jsonb_array_length(v_res->'skipped') > 0 then
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rule_id', p_rule, 'matches', v_total, 'changed', v_changed, 'skipped', v_skipped,
    'blocked_no_access', v_blocked,
    'changed_ids', to_jsonb(v_ids)
  );
end $$;


ALTER FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text") IS 'Applies one assignment rule to every receipt in its scope that the CALLER may access. SECURITY DEFINER because it writes through apply_assignment_rules(), so the company check is explicit here rather than inherited from RLS. Returns matches/changed/skipped for the receipts it was allowed to touch, plus blocked_no_access for the ones it refused; the UI shows the former and not the latter. A sessionless caller (service role, trigger) is not scoped.';


--
-- Name: apply_assignment_rules("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inv                 public.documents;
  v_rule                 public.assignment_rules;
  v_changed              jsonb := '[]'::jsonb;
  v_skipped               jsonb := '[]'::jsonb;
  v_log_lines             text[] := array[]::text[];
  v_new_amount            numeric;
  v_new_net               numeric;
  v_new_cat_name          text;
  v_cat_changed           boolean;
  v_new_deductible_pct    numeric;
  v_new_deductible_source text;
  v_new_special_case      text;
  v_had_prior_vat         boolean;
  v_old_no_vat            boolean;
  v_new_no_vat            boolean;
  v_conflict              boolean;
begin
  select * into v_inv from public.documents where id = p_invoice and deleted_at is null;
  if not found then
    raise exception 'invoice % not found or deleted', p_invoice;
  end if;

  -- Company scope. A caller with no session at all (the ingestion pipeline's service role, a
  -- trigger firing on insert) is not company restricted and must keep working, so the check is
  -- gated on there being a logged-in person to check.
  if auth.uid() is not null and not public.has_company_access(v_inv.company_id) then
    raise exception 'no access to the company of invoice %', p_invoice
      using errcode = '42501';
  end if;

  -- Cost category (+ structured category_id).
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'cost_category');
  if found then
    if coalesce(v_inv.cost_category_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'cost_category', 'reason', 'human', 'rule_id', v_rule.id);
    else
      if v_rule.category_id is not null then
        select name into v_new_cat_name from public.categories where id = v_rule.category_id;
        v_cat_changed := v_inv.category_id is distinct from v_rule.category_id;
      else
        v_new_cat_name := v_rule.cost_category;
        v_cat_changed := coalesce(v_inv.cost_category, '') <> coalesce(v_rule.cost_category, '');
      end if;

      if v_cat_changed then
        update public.documents
           set category_id = v_rule.category_id,
               cost_category = coalesce(v_new_cat_name, v_rule.cost_category),
               cost_category_source = 'rule',
               updated_at = now()
         where id = p_invoice;
        v_changed := v_changed || jsonb_build_object(
          'field', 'cost_category', 'from', v_inv.cost_category,
          'to', coalesce(v_new_cat_name, v_rule.cost_category), 'rule_id', v_rule.id);
        v_log_lines := v_log_lines || format('Kostenkategorie: %s -> %s (Regel)',
          coalesce(v_inv.cost_category, 'ohne'), coalesce(v_new_cat_name, v_rule.cost_category));
      end if;
    end if;
  end if;

  -- VAT rate + treatment + deductibility. Deductibility default now comes from the invoice's
  -- PROPERTY (properties.vat_status via resolve_default_vat_deductible_pct), not business_line
  -- (migration 0083).
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    else
      v_new_deductible_pct := coalesce(
        v_rule.vat_deductible_pct, public.resolve_default_vat_deductible_pct(v_inv.property_id)
      );
      v_new_deductible_source := case
        when v_rule.vat_deductible_pct is not null then 'rule'
        when v_new_deductible_pct is not null then 'ai'
        else null
      end;
      v_new_special_case := v_rule.vat_special_case;

      if coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1)
         or coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '')
         or coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1)
         or coalesce(v_inv.vat_special_case, '') <> coalesce(v_new_special_case, '')
      then
        v_had_prior_vat := v_inv.vat_rate is not null or v_inv.vat_treatment is not null;
        v_old_no_vat := coalesce(v_inv.vat_rate, 0) = 0 or v_inv.vat_treatment = 'kleinunternehmer';
        v_new_no_vat := coalesce(v_rule.vat_rate, 0) = 0 or v_rule.vat_treatment = 'kleinunternehmer';
        v_conflict := v_had_prior_vat and (v_old_no_vat is distinct from v_new_no_vat);

        if v_inv.amount_gross is not null and v_rule.vat_rate is not null then
          v_new_amount := round(v_inv.amount_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), 2);
          v_new_net    := v_inv.amount_gross - v_new_amount;
        else
          v_new_net    := v_inv.amount_net;
          v_new_amount := case when v_rule.vat_rate is null then null
                               else round(coalesce(v_inv.amount_net, 0) * v_rule.vat_rate / 100, 2) end;
        end if;

        update public.documents
           set vat_rate = v_rule.vat_rate,
               vat_amount = v_new_amount,
               amount_net = v_new_net,
               vat_treatment = v_rule.vat_treatment,
               vat_source = 'rule',
               vat_deductible_pct = v_new_deductible_pct,
               vat_deductibility_source = v_new_deductible_source,
               vat_special_case = v_new_special_case,
               vat_conflict_at = case when v_conflict then now() else v_inv.vat_conflict_at end,
               vat_conflict_note = case when v_conflict then format(
                 'USt-Status geändert: %s -> %s (Regel %s)',
                 case when v_old_no_vat then 'keine USt' else 'USt-pflichtig' end,
                 case when v_new_no_vat then 'keine USt' else 'USt-pflichtig' end,
                 v_rule.id
               ) else v_inv.vat_conflict_note end,
               updated_at = now()
         where id = p_invoice;

        v_changed := v_changed || jsonb_build_object(
          'field', 'vat_rate', 'from', v_inv.vat_rate, 'to', v_rule.vat_rate, 'rule_id', v_rule.id)
          || jsonb_build_object(
          'field', 'vat_amount', 'from', v_inv.vat_amount, 'to', v_new_amount, 'rule_id', v_rule.id);
        if coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '') then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_treatment', 'from', v_inv.vat_treatment, 'to', v_rule.vat_treatment,
            'rule_id', v_rule.id);
        end if;
        if coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1) then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_deductible_pct', 'from', v_inv.vat_deductible_pct,
            'to', v_new_deductible_pct, 'rule_id', v_rule.id);
        end if;
        if coalesce(v_inv.vat_special_case, '') <> coalesce(v_new_special_case, '') then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_special_case', 'from', v_inv.vat_special_case,
            'to', v_new_special_case, 'rule_id', v_rule.id);
        end if;
        if v_conflict then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_conflict', 'from', v_old_no_vat, 'to', v_new_no_vat, 'rule_id', v_rule.id);
        end if;

        v_log_lines := v_log_lines || format(
          'USt-Satz: %s -> %s (Regel, USt-Betrag angepasst: %s -> %s%s)',
          coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
          coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'),
          case when v_rule.vat_treatment is not null
               then ', Behandlung: ' || v_rule.vat_treatment else '' end);
        if coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1) then
          v_log_lines := v_log_lines || format('Abzugsfähigkeit: %s%% -> %s%% (Regel)',
            coalesce(v_inv.vat_deductible_pct::text, 'unbestimmt'),
            coalesce(v_new_deductible_pct::text, 'unbestimmt'));
        end if;
        if v_conflict then
          v_log_lines := v_log_lines || format(
            'Achtung, USt-Status-Wechsel: %s -> %s',
            case when v_old_no_vat then 'keine USt' else 'USt-pflichtig' end,
            case when v_new_no_vat then 'keine USt' else 'USt-pflichtig' end);
        end if;
      end if;
    end if;
  end if;

  if array_length(v_log_lines, 1) > 0 then
    insert into public.document_history (document_id, type, text, data, actor)
    values (
      p_invoice,
      'regel',
      array_to_string(v_log_lines, ' · '),
      jsonb_build_object('changed', v_changed, 'skipped', v_skipped),
      p_actor
    );
  end if;

  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;


ALTER FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text") IS 'Applies the winning cost-category and VAT rules to one receipt, never overwriting a human-set value, flags a liability-status flip, and logs what changed. Deductibility default now comes from the property''s vat_status, not business_line (migration 0083).';


--
-- Name: apply_opos_whitelist(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_opos_whitelist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rule_id  uuid;
  v_category text;
begin
  -- OUTGOING ONLY. The briefing's OPOS question is "what is debited in which company, but the receipt
  -- is missing?", the Hub's "Fehlende Belege" tab filters direction='ausgehend', and the matcher only
  -- looks at amount < 0. Incoming credits therefore never appear in the open-items list, so hiding them
  -- would achieve nothing and would touch rows the other OPOS side (receipts without a transaction)
  -- still needs — a credit is what PAYS one of our outgoing documents.
  --
  -- Tested on amount, NOT on direction: `direction` is GENERATED ALWAYS AS (case when amount < 0 then
  -- 'ausgehend' else 'eingehend' end), and a generated column is computed AFTER before-row triggers, so
  -- new.direction is still NULL here. Reading it would make this guard fire on every insert and the
  -- whitelist would silently never apply. `amount < 0` is the same test, one step earlier.
  if new.amount is null or new.amount >= 0 then
    return new;
  end if;

  -- Never re-decide a transaction that is reconciled with a receipt.
  if new.matching_status = 'zugeordnet' then
    return new;
  end if;

  -- Never overwrite or release a HUMAN decision (hidden with no rule behind it).
  if new.matching_status = 'ignoriert' and new.whitelist_rule_id is null then
    return new;
  end if;

  select m.rule_id, m.category
    into v_rule_id, v_category
    from public.match_opos_whitelist(new.payment_reference, new.counterparty_holder,
                                     new.counterparty_iban, new.booking_text) m;

  if v_rule_id is not null then
    new.matching_status   := 'ignoriert';
    new.no_receipt_reason := v_category;
    new.whitelist_rule_id := v_rule_id;
    new.no_receipt_set_by := coalesce(new.no_receipt_set_by, 'system');
    new.no_receipt_set_at := coalesce(new.no_receipt_set_at, now());
  elsif new.whitelist_rule_id is not null then
    -- It was hidden BY A RULE and no longer matches (rule deactivated, or the text changed) — release
    -- it back into the open-items list. A human's decision never lands here (guarded above).
    new.matching_status   := 'offen';
    new.no_receipt_reason := null;
    new.whitelist_rule_id := null;
    new.no_receipt_set_by := null;
    new.no_receipt_set_at := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."apply_opos_whitelist"() OWNER TO "postgres";

--
-- Name: approval_rule_specificity("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select
    16 * (
        (case when p_supplier_id is not null then 1 else 0 end)
      + (case when p_property_id is not null then 1 else 0 end)
      + (case when p_company_id  is not null then 1 else 0 end)
    )
    + (case when p_supplier_id is not null then 8 else 0 end)
    + (case when p_property_id is not null then 2 else 0 end)
    + (case when p_company_id  is not null then 1 else 0 end);
$$;


ALTER FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") IS 'Approval-rule priority: dimension count first (x16), then supplier(8) > property(2) > company(1). business_line_id dropped as a dimension (0083).';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: pipeline_run_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pipeline_run_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requested_by" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "folders" "text"[],
    "folder_names" "text"[],
    CONSTRAINT "pipeline_run_requests_status_known" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'done'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."pipeline_run_requests" REPLICA IDENTITY FULL;


ALTER TABLE "public"."pipeline_run_requests" OWNER TO "postgres";

--
-- Name: ask_for_a_run("text", "text"[], "text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[] DEFAULT NULL::"text"[], "wanted_folder_names" "text"[] DEFAULT NULL::"text"[]) RETURNS "public"."pipeline_run_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
        declare
            asked   public.pipeline_run_requests;
            -- Sorted and emptied to null, so "no folders" and "the same folders" each mean one thing.
            folders text[] := nullif(
                (select array_agg(f order by f) from unnest(wanted_folders) f where f <> ''),
                '{}'::text[]
            );
        begin
            if auth.uid() is null then
                raise exception 'sign in to ask for a run';
            end if;

            insert into public.pipeline_run_requests (channel, folders, folder_names, requested_by)
            values (wanted_channel, folders,
                    case when folders is null then null else wanted_folder_names end,
                    coalesce(auth.jwt() ->> 'email', auth.uid()::text))
            returning * into asked;
            return asked;
        exception when unique_violation then
            -- The same question is already waiting and has not been claimed: that request IS this one.
            select * into asked
              from public.pipeline_run_requests r
             where r.channel = wanted_channel
               and coalesce(r.folders, '{}'::text[]) = coalesce(folders, '{}'::text[])
               and r.status = 'pending'
             order by r.requested_at
             limit 1;
            return asked;
        end
        $$;


ALTER FUNCTION "public"."ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[], "wanted_folder_names" "text"[]) OWNER TO "postgres";

--
-- Name: assignment_rule_preview("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") RETURNS TABLE("matches" bigint, "would_change" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  r public.assignment_rules;
begin
  select * into r from public.assignment_rules where id = p_rule;
  if not found then
    return query select 0::bigint, 0::bigint;
    return;
  end if;

  return query
  with cand as (
    select i.id, i.category_id, i.cost_category, i.cost_category_source,
           i.vat_rate, i.vat_treatment, i.vat_source,
           i.vat_deductible_pct, i.vat_special_case, i.property_id
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.property_id      is null or r.property_id      = i.property_id)
       and (r.company_id       is null or r.company_id       = i.company_id)
       and (
         r.reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where public.resolve_assignment_rule(c.id, r.target) = r.id
        and case r.target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (r.category_id is not null and c.category_id is distinct from r.category_id)
                  or (r.category_id is null and coalesce(c.cost_category, '') <> coalesce(r.cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (
                  coalesce(c.vat_rate, -1) <> coalesce(r.vat_rate, -1)
                  or coalesce(c.vat_treatment, '') <> coalesce(r.vat_treatment, '')
                  or coalesce(c.vat_deductible_pct, -1) <> coalesce(
                       coalesce(r.vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.property_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(r.vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;


ALTER FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "assignment_rule_preview"("p_rule" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") IS 'Retroactive impact of one rule. business_line_id dropped as a dimension; deductibility default now comes from the property''s vat_status (migration 0083).';


--
-- Name: assignment_rule_preview_scope("text", "text", numeric, "uuid", "uuid", "uuid", "text", "uuid", "text", "uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text" DEFAULT NULL::"text", "p_vat_rate" numeric DEFAULT NULL::numeric, "p_supplier_id" "uuid" DEFAULT NULL::"uuid", "p_property_id" "uuid" DEFAULT NULL::"uuid", "p_company_id" "uuid" DEFAULT NULL::"uuid", "p_reference_pattern" "text" DEFAULT NULL::"text", "p_exclude_rule" "uuid" DEFAULT NULL::"uuid", "p_vat_treatment" "text" DEFAULT NULL::"text", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_vat_deductible_pct" numeric DEFAULT NULL::numeric, "p_vat_special_case" "text" DEFAULT NULL::"text") RETURNS TABLE("matches" bigint, "would_change" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_spec int := public.assignment_rule_specificity(
    p_reference_pattern, p_supplier_id, p_property_id, p_company_id
  );
begin
  return query
  with cand as (
    select
      i.category_id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment,
      i.vat_source, i.vat_deductible_pct, i.vat_special_case, i.property_id,
      (
        select max(r.specificity)
          from public.assignment_rules r
         where r.is_active
           and r.deleted_at is null
           and r.target = p_target
           and (p_exclude_rule is null or r.id <> p_exclude_rule)
           and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
           and (r.property_id      is null or r.property_id      = i.property_id)
           and (r.company_id       is null or r.company_id       = i.company_id)
           and (
             r.reference_pattern is null
             or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
           )
      ) as best
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and (p_supplier_id      is null or p_supplier_id      = i.supplier_id)
       and (p_property_id      is null or p_property_id      = i.property_id)
       and (p_company_id       is null or p_company_id        = i.company_id)
       and (
         p_reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(p_reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where (c.best is null or c.best <= v_spec)
        and case p_target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (p_category_id is not null and c.category_id is distinct from p_category_id)
                  or (p_category_id is null and coalesce(c.cost_category, '') <> coalesce(p_cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (
                  coalesce(c.vat_rate, -1) <> coalesce(p_vat_rate, -1)
                  or coalesce(c.vat_treatment, '') <> coalesce(p_vat_treatment, '')
                  or coalesce(c.vat_deductible_pct, -1) <> coalesce(
                       coalesce(p_vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.property_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(p_vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;


ALTER FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text") IS 'Retroactive impact of a prospective rule, before it is saved. business_line_id dropped as a dimension (0083).';


--
-- Name: assignment_rule_specificity("text", "uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select
    32 * (
        (case when p_reference_pattern is not null then 1 else 0 end)
      + (case when p_supplier_id       is not null then 1 else 0 end)
      + (case when p_property_id       is not null then 1 else 0 end)
      + (case when p_company_id        is not null then 1 else 0 end)
    )
    + (case when p_reference_pattern is not null then 16 else 0 end)
    + (case when p_supplier_id       is not null then  8 else 0 end)
    + (case when p_property_id       is not null then  2 else 0 end)
    + (case when p_company_id        is not null then  1 else 0 end);
$$;


ALTER FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") IS 'Rule priority: dimension count first (x32), then reference_pattern(16) > supplier(8) > property(2) > company(1) as the tie-break. business_line_id dropped as a dimension (0083); the weights are otherwise unchanged from migration 0025/0038 so existing relative ordering holds.';


--
-- Name: bank_sync_log_facets(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."bank_sync_log_facets"() RETURNS TABLE("events" "text"[], "levels" "text"[])
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(array_agg(distinct event) filter (where event is not null), '{}'::text[]),
    coalesce(array_agg(distinct level) filter (where level is not null), '{}'::text[])
  from public.bank_sync_logs;
$$;


ALTER FUNCTION "public"."bank_sync_log_facets"() OWNER TO "postgres";

--
-- Name: capture_supplier_iban_history(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."capture_supplier_iban_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.iban is distinct from old.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (old.id, old.iban, old.bic, old.bank_name, coalesce(auth.uid()::text, 'pipeline'));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."capture_supplier_iban_history"() OWNER TO "postgres";

--
-- Name: cascade_company_code_rename(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cascade_company_code_rename"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Aliases are keyed by the code string, so they move with it. Scoped to 'gesellschaft' so a
  -- property or supplier alias that happens to share the string is never touched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'gesellschaft'
     and entity_code = old.code;

  -- documents.company_code is a denormalised copy. Only rows that genuinely belong to THIS company
  -- are rewritten: those already linked by id, plus unassigned rows that referenced the old code
  -- (the code moved to this company, so the reference moves with it). A row whose company_id points
  -- at a different company is deliberately left alone -- that is pre-existing inconsistent data and
  -- guessing at it here would be the very cross-company mixing this migration exists to prevent.
  update public.documents
     set company_code = new.code
   where company_code = old.code
     and (company_id = new.id or company_id is null);

  return new;
end;
$$;


ALTER FUNCTION "public"."cascade_company_code_rename"() OWNER TO "postgres";

--
-- Name: cascade_property_code_rename(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cascade_property_code_rename"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Scoped to 'objekt' so a company or supplier alias that happens to share the string is untouched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'objekt'
     and entity_code = old.code;

  -- documents.property_code is a denormalised copy of the code, with no foreign key behind it. Unlike
  -- the company cascade there is no id column on documents to disambiguate with, so every row holding
  -- the old code follows the rename. That is the correct reading: the code moved to this property,
  -- so references to it move too, and leaving them behind would point at a property that no longer
  -- exists under that name.
  update public.documents
     set property_code = new.code
   where property_code = old.code;

  return new;
end;
$$;


ALTER FUNCTION "public"."cascade_property_code_rename"() OWNER TO "postgres";

--
-- Name: chain_people(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."chain_people"() RETURNS TABLE("id" "uuid", "name" "text", "role_name" "text", "is_active" boolean, "escalation_days" integer, "deputy_user_id" "uuid", "area" "text", "covers_all_areas" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select u.id,
         u.name,
         r.name as role_name,
         u.is_active,
         u.escalation_days,
         u.deputy_user_id,
         u.area,
         u.covers_all_areas
    from public.app_users u
    left join public.roles r on r.id = u.role_id
   order by u.name nulls last;
$$;


ALTER FUNCTION "public"."chain_people"() OWNER TO "postgres";

--
-- Name: FUNCTION "chain_people"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."chain_people"() IS 'The approval-chain directory: who can be a step in a rule, who deputises for whom, who owns which area, and what each person''s role is. Readable by any signed-in account because the invoice list, the overdue warnings and the assignment picker all name these people to everyone. SECURITY DEFINER so it can see past app_users_admin_read; it returns a fixed column list, so widening it is a deliberate edit here rather than a consequence of adding a column to app_users. Deliberately excludes email, company access and the permission set.';


--
-- Name: channel_secret_name("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."channel_secret_name"("p_channel" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select 'channel_secret:' || p_channel;
$$;


ALTER FUNCTION "public"."channel_secret_name"("p_channel" "text") OWNER TO "postgres";

--
-- Name: channel_secret_present("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."channel_secret_present"("p_channel" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    return false;
  end if;
  return exists (
    select 1 from vault.secrets where name = public.channel_secret_name(p_channel)
  );
end;
$$;


ALTER FUNCTION "public"."channel_secret_present"("p_channel" "text") OWNER TO "postgres";

--
-- Name: check_match_allocation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_match_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tx_total  numeric;
  v_tx_other  numeric;
  v_inv_gross numeric;
  v_inv_other numeric;
begin
  if new.status is distinct from 'bestaetigt' then
    return new;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = new.transaction_id;
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.invoice_transaction_matches
   where transaction_id = new.transaction_id and status = 'bestaetigt' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    -- Message text is English like the other raises in this schema (persisted audit text stays
    -- German). RAISE uses % as its placeholder, not %s -- that is format()'s syntax.
    raise exception
      'match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.documents where id = new.document_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.invoice_transaction_matches
   where document_id = new.document_id and status = 'bestaetigt' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_match_allocation"() OWNER TO "postgres";

--
-- Name: check_outgoing_match_allocation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."check_outgoing_match_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tx_total  numeric;
  v_tx_other  numeric;
  v_inv_gross numeric;
  v_inv_other numeric;
begin
  if new.status is distinct from 'bestaetigt' then
    return new;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = new.transaction_id;
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = new.transaction_id and status = 'bestaetigt' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    raise exception
      'outgoing match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = new.outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = new.outgoing_invoice_id and status = 'bestaetigt' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'outgoing match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_outgoing_match_allocation"() OWNER TO "postgres";

--
-- Name: clear_must_change_password(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."clear_must_change_password"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'clear_must_change_password: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  update public.app_users
     set must_change_password = false,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'clear_must_change_password: no app_users row for %', v_email;
  end if;
end;
$$;


ALTER FUNCTION "public"."clear_must_change_password"() OWNER TO "postgres";

--
-- Name: clear_transaction_fully_used("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."clear_transaction_fully_used"("p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = p_transaction_id;
  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);

  update public.bank_transactions
     set fully_used_at   = null,
         fully_used_by   = null,
         fully_used_note = null,
         -- Back to what the amounts say, so undoing the stamp reopens the remainder.
         matching_status = case
           when matching_status = 'ignoriert' then matching_status
           when coalesce(v_alloc, 0) > 0 and v_alloc >= coalesce(v_total, 0) - 0.01 then 'zugeordnet'
           else 'offen'
         end
   where id = p_transaction_id;
end $$;


ALTER FUNCTION "public"."clear_transaction_fully_used"("p_transaction_id" "uuid") OWNER TO "postgres";

--
-- Name: compact_supplier_iban(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compact_supplier_iban"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.iban := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
    return new;
end;
$$;


ALTER FUNCTION "public"."compact_supplier_iban"() OWNER TO "postgres";

--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."current_app_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id
    from public.app_users
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and is_active
   limit 1;
$$;


ALTER FUNCTION "public"."current_app_user_id"() OWNER TO "postgres";

--
-- Name: current_permissions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."current_permissions"() RETURNS SETOF "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with me as (
    select u.id, u.role_id, r.name as role_name
      from public.app_users u
      left join public.roles r on r.id = u.role_id
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and u.is_active
     limit 1
  )
  select p.key
    from public.permissions p
    cross join me
    left join public.user_permissions up
      on up.user_id = me.id and up.permission_key = p.key
    left join public.role_permissions rp
      on rp.role_id = me.role_id and rp.permission_key = p.key
   where me.role_name = 'super_admin'
      or coalesce(up.granted, rp.permission_key is not null);
$$;


ALTER FUNCTION "public"."current_permissions"() OWNER TO "postgres";

--
-- Name: FUNCTION "current_permissions"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."current_permissions"() IS 'The effective permission set for the calling account: personal overrides merged over the role defaults, with granted=false meaning a real revoke. The super_admin role short-circuits to the whole catalogue -- role_permissions is admin-writable with no guard of its own, so without this an admin could strip the owner account''s defaults.';


--
-- Name: current_role_name(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."current_role_name"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.name
    from public.app_users u
    join public.roles r on r.id = u.role_id
   where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and u.is_active
   limit 1;
$$;


ALTER FUNCTION "public"."current_role_name"() OWNER TO "postgres";

--
-- Name: enforce_invoice_write_permissions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_invoice_write_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Columns governed by another permission, or written by triggers on every update. Anything NOT
  -- in here counts as receipt content and requires invoices.book -- so a column added later is
  -- protected by default, and a column that is governed elsewhere has to be named here.
  v_ignore constant text[] := array[
    'workflow_status', 'approved_by',
    'paid_at', 'paid_source',
    'assigned_to', 'assigned_user_id',
    'datev_handed_over_at',
    -- Deletion has no permission of its own today, and inventing one here would narrow who may
    -- delete without that being asked for. Left exactly as it was; worth a key of its own later.
    'deleted_at', 'deleted_by', 'delete_reason',
    'updated_at', 'fts', 'embedding'
  ];
begin
  -- No caller identity: service role, a cron job or the pipeline. They authorize themselves.
  if v_email = '' then
    return new;
  end if;

  if new.paid_at is not null and old.paid_at is null
     and not public.has_permission('invoices.pay') then
    raise exception 'not permitted: marking an invoice paid requires the payment permission'
      using errcode = '42501';
  end if;

  -- Both columns, so a stray write to the frozen one cannot route around the permission.
  if (new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_to is distinct from old.assigned_to)
     and not public.has_permission('invoices.assign') then
    raise exception 'not permitted: assigning an invoice requires the assign permission'
      using errcode = '42501';
  end if;

  if new.workflow_status is distinct from old.workflow_status then
    if not public.has_permission('invoices.override_workflow') then
      case new.workflow_status
        when 'freigegeben_vorgesetzter', 'abgeschlossen' then
          if not public.has_permission('invoices.approve_final') then
            raise exception 'not permitted: this status requires the final-approval permission'
              using errcode = '42501';
          end if;
        when 'in_pruefung', 'rueckfrage', 'freigegeben_assistenz', 'abgelehnt', 'nicht_relevant' then
          if not public.has_permission('invoices.approve') then
            raise exception 'not permitted: this status requires the approval permission'
              using errcode = '42501';
          end if;
        when 'bezahlt' then
          if new.paid_at is null then
            raise exception 'not permitted: bezahlt is derived from paid_at, set that instead'
              using errcode = '42501';
          end if;
        when 'uebergeben_datev' then
          if new.datev_handed_over_at is null then
            raise exception 'not permitted: uebergeben_datev is derived from datev_handed_over_at'
              using errcode = '42501';
          end if;
        else
          raise exception 'not permitted: setting this status requires the override permission'
            using errcode = '42501';
      end case;
    end if;
  end if;

  if (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
     and not public.has_permission('invoices.book') then
    raise exception 'not permitted: editing a receipt requires the booking permission'
      using errcode = '42501';
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."enforce_invoice_write_permissions"() OWNER TO "postgres";

--
-- Name: enforce_match_payment_permission(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."enforce_match_payment_permission"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email          text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_was_confirmed  boolean := tg_op <> 'INSERT' and old.status = 'bestaetigt';
  v_is_confirmed   boolean := tg_op <> 'DELETE' and new.status = 'bestaetigt';
  v_amount_changed boolean := tg_op = 'UPDATE'
                              and old.status = 'bestaetigt'
                              and new.amount_matched is distinct from old.amount_matched;
  v_touches_payment boolean;
begin
  -- No caller identity: pipeline, cron or an Edge Function. See the header.
  if v_email = '' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_touches_payment := (v_was_confirmed is distinct from v_is_confirmed) or v_amount_changed;

  if v_touches_payment and not public.has_permission('invoices.pay') then
    raise exception
      'not permitted: a confirmed bank match settles the invoice, which requires the payment permission'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."enforce_match_payment_permission"() OWNER TO "postgres";

--
-- Name: escape_ilike_pattern("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."escape_ilike_pattern"("p_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;


ALTER FUNCTION "public"."escape_ilike_pattern"("p_text" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "escape_ilike_pattern"("p_text" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."escape_ilike_pattern"("p_text" "text") IS 'Escapes \, % and _ so a user-typed reference_pattern is matched as literal text in an ILIKE ''%...%'' expression, not as a wildcard pattern. See migration 0028.';


--
-- Name: get_channel_secret("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_channel_secret"("p_channel" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.notification_channels where key = p_channel) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = public.channel_secret_name(p_channel)
   limit 1;
  return v_secret;
end;
$$;


ALTER FUNCTION "public"."get_channel_secret"("p_channel" "text") OWNER TO "postgres";

--
-- Name: guard_permission_grants(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_permission_grants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_target uuid := coalesce(new.user_id, old.user_id);
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  -- No JWT means a service-role or server-side caller: the seeds, the pipeline and
  -- src/lib/api/*.functions.ts, which do their own authorisation.
  if v_actor is null then
    return coalesce(new, old);
  end if;

  if v_actor = v_target and v_actor_role is distinct from 'super_admin' then
    raise exception 'Sie können Ihre eigenen Rechte nicht ändern.'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' and new.granted and v_actor_role is distinct from 'super_admin' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'Sie können ein Recht nicht vergeben, das Sie selbst nicht haben: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;


ALTER FUNCTION "public"."guard_permission_grants"() OWNER TO "postgres";

--
-- Name: guard_role_permission_grants(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_role_permission_grants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  if v_actor is null or v_actor_role = 'super_admin' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'Sie können ein Recht nicht vergeben, das Sie selbst nicht haben: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;


ALTER FUNCTION "public"."guard_role_permission_grants"() OWNER TO "postgres";

--
-- Name: guard_super_admin_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_super_admin_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new_role text;
begin
  select name into v_new_role from public.roles where id = new.role_id;
  if v_new_role = 'super_admin' then
    raise exception 'The super admin role cannot be assigned.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_super_admin_insert"() OWNER TO "postgres";

--
-- Name: guard_super_admin_permissions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_super_admin_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    -- Only the super admin's rows are protected; everyone else's delete proceeds. Returning OLD
    -- is what allows it -- returning NEW (null here) cancelled it.
    if exists (
      select 1 from public.app_users u join public.roles r on r.id = u.role_id
       where u.id = old.user_id and r.name = 'super_admin'
    ) then
      return null;
    end if;
    return old;
  end if;

  if exists (
    select 1 from public.app_users u join public.roles r on r.id = u.role_id
     where u.id = new.user_id and r.name = 'super_admin'
  ) then
    new.granted := true;
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."guard_super_admin_permissions"() OWNER TO "postgres";

--
-- Name: guard_super_admin_row(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guard_super_admin_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_role text;
  v_new_role text;
begin
  if tg_op = 'DELETE' then
    select name into v_old_role from public.roles where id = old.role_id;
    if v_old_role = 'super_admin' then
      raise exception 'The super admin cannot be deleted.'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  select name into v_old_role from public.roles where id = old.role_id;
  select name into v_new_role from public.roles where id = new.role_id;

  -- Promotion INTO the role, from any other role.
  if v_new_role = 'super_admin' and v_old_role is distinct from 'super_admin' then
    raise exception 'The super admin role cannot be assigned.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_old_role is distinct from 'super_admin' then
    return new;  -- not a super admin, and not becoming one: nothing further to guard
  end if;

  if new.is_active is distinct from old.is_active and new.is_active = false then
    raise exception 'The super admin cannot be deactivated.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_new_role is distinct from v_old_role then
    raise exception 'The super admin role cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_super_admin_row"() OWNER TO "postgres";

--
-- Name: has_company_access("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_company_access"("p_company" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with me as (
    -- Deliberately NOT current_app_user_id(): that function filters on is_active, so a
    -- deactivated account would come back as "no user found" and fall through to the
    -- unrestricted branch below. Offboarding has to deny, not open up, so the active flag is
    -- read here as data rather than used as a filter.
    select au.id, au.is_active, r.name as role_name
      from public.app_users au
      left join public.roles r on r.id = au.role_id
     where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     limit 1
  )
  select case
    -- A7: "if someone leaves the company, their access is deactivated, not deleted". Checked
    -- first, so a deactivated account is denied even the watch-all bucket -- and a deactivated
    -- super_admin is denied too, since this sits ahead of the role branch.
    when exists (select 1 from me where not is_active) then false
    -- The owner/technical account is unrestricted by role, never by grant bookkeeping.
    when exists (select 1 from me where role_name = 'super_admin') then true
    -- Watch-all. A receipt that is not assigned to a company yet has to stay visible to every
    -- reviewer, otherwise unassigned receipts would drop out of the queue instead of getting
    -- assigned, which is the exact failure the catch-all owner exists to prevent.
    when p_company is null then true
    -- No grants recorded for this person means unrestricted, preserving today's behaviour.
    -- Soft-deleted grants do not count as grants, otherwise revoking a person's last company
    -- would flip them from restricted straight back to seeing everything.
    when not exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.deleted_at is null
    ) then true
    else exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.company_id = p_company
         and a.deleted_at is null
         -- An explicit can_view = false is a denial, not a grant.
         and a.can_view
    )
  end;
$$;


ALTER FUNCTION "public"."has_company_access"("p_company" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "has_company_access"("p_company" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."has_company_access"("p_company" "uuid") IS 'Per-company visibility check. A deactivated app_user is denied outright; NULL company is visible to everyone else (watch-all for unassigned receipts); a user with no live grants sees everything, which is current behaviour. Not yet wired into any RLS policy.';


--
-- Name: has_permission("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."has_permission"("p_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.current_permissions() k where k = p_key);
$$;


ALTER FUNCTION "public"."has_permission"("p_key" "text") OWNER TO "postgres";

--
-- Name: invoice_iban_checksum_ok("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoice_iban_checksum_ok"("candidate" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  with cleaned as (
    select upper(regexp_replace(btrim(coalesce(candidate, '')), '\s', '', 'g')) as s
  ),
  rearranged as (
    select substr(s, 5) || substr(s, 1, 4) as r, s from cleaned
  ),
  expanded as (
    select string_agg(
      case when ch ~ '[0-9]' then ch else (ascii(ch) - 55)::text end, '' order by ord
    ) as digits
    from rearranged, regexp_split_to_table(r, '') with ordinality as t(ch, ord)
  )
  select case
    when (select s from cleaned) !~ '^[A-Z0-9]{15,34}$' then false
    when (select s from cleaned) !~ '^[A-Z]{2}[0-9]{2}' then false
    else (select digits from expanded)::numeric % 97 = 1
  end;
$_$;


ALTER FUNCTION "public"."invoice_iban_checksum_ok"("candidate" "text") OWNER TO "postgres";

--
-- Name: invoice_is_fully_covered(numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  -- isFullyCovered() in format.ts: no gross amount means never judged covered, and an OVERPAYMENT
  -- counts as covered because more money than owed arrived, so nothing is open. Compared in
  -- numeric, which is exact decimal; the front end rounds to whole cents to reach the same answer
  -- in IEEE754.
  select case
           when abs(coalesce(p_gross, 0)) <= 0 then false
           else round(coalesce(p_matched, 0), 2)
                  >= round(abs(p_gross) - public.payment_tolerance(p_gross), 2)
         end;
$$;


ALTER FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) OWNER TO "postgres";

--
-- Name: FUNCTION "invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) IS 'Whether confirmed allocations settle an invoice, within payment_tolerance. Mirrors isFullyCovered() in src/lib/data/format.ts -- keep the two in step.';


--
-- Name: invoice_matched_sum("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoice_matched_sum"("p_invoice" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.invoice_transaction_matches
   where document_id = p_invoice and status = 'bestaetigt';
$$;


ALTER FUNCTION "public"."invoice_matched_sum"("p_invoice" "uuid") OWNER TO "postgres";

--
-- Name: invoice_queue_kpis("date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoice_queue_kpis"("p_today" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("key" "text", "count" bigint, "amount" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
      with base as (select * from public.documents where true and deleted_at is null and archived_at is null and not_relevant_at is null)
      select 'all'::text, count(*), coalesce(sum(amount_gross), 0) from base
      union all
      select 'needs_action'::text, count(*), coalesce(sum(amount_gross), 0) from base where status = 'zu_pruefen'
      union all
      select 'missing_assignment'::text, count(*), coalesce(sum(amount_gross), 0) from base where company_id is null
      union all
      select 'ready_for_payment'::text, count(*), coalesce(sum(amount_gross), 0) from base  where workflow_status in ('freigegeben_assistenz', 'freigegeben_vorgesetzter')    and paid_at is null
      union all
      select 'pay_now'::text, count(*), coalesce(sum(amount_gross), 0) from base where due_date <= p_today and paid_at is null and not public.is_direct_debit(payment_method)
      union all
      select 'completed'::text, count(*), coalesce(sum(amount_gross), 0) from base where paid_at is not null or workflow_status = 'abgeschlossen';
    $$;


ALTER FUNCTION "public"."invoice_queue_kpis"("p_today" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "invoice_queue_kpis"("p_today" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."invoice_queue_kpis"("p_today" "date") IS 'Count and gross sum per queue card above the incoming-invoice list. See migration 20260828180000. Keys are the contract with invoice-queue-config.ts.';


--
-- Name: invoice_review_state("jsonb", "jsonb", "jsonb", "text", "text", "date", numeric, numeric, numeric, numeric, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text") RETURNS TABLE("problem_count" integer, "unchecked" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $_$
  with raw_detail as (
    select coalesce(
      case when jsonb_typeof(p_validation_detail) = 'object' and p_validation_detail <> '{}'::jsonb
        then p_validation_detail end,
      case when jsonb_typeof(p_extracted -> 'validation_detail') = 'object'
            and (p_extracted -> 'validation_detail') <> '{}'::jsonb
        then p_extracted -> 'validation_detail' end,
      '{}'::jsonb
    ) as d
  ),
  halves as (
    select
      case
        when d ? 'bookkeeping_edits' then
          case when jsonb_typeof(d -> 'bookkeeping_edits') = 'object'
                and (d -> 'bookkeeping_edits') <> '{}'::jsonb
            then d -> 'bookkeeping_edits' else '{}'::jsonb end
        else d
      end as basis,
      case
        when d ? 'bookkeeping_edits' and jsonb_typeof(d -> 'user_edits') = 'object'
          then coalesce(d -> 'user_edits', '{}'::jsonb)
        else '{}'::jsonb
      end as stored_user
    from raw_detail
  ),
  iban_input as (
    select coalesce(
      nullif(btrim(coalesce(p_supplier_iban, '')), ''),
      case when jsonb_typeof(p_extracted -> 'iban') = 'string' then p_extracted ->> 'iban' end
    ) as src
  ),
  iban_candidates as (
    select coalesce(array_agg(part) filter (where part <> ''), '{}'::text[]) as arr
    from iban_input,
      lateral (
        select btrim(piece) as part
        from regexp_split_to_table(coalesce(src, ''), '(?i)([;,/|]|\s{2,}|\y(?:und)\y)') as piece
      ) parts
    where src is not null
  ),
  numbers as (
    select
      coalesce(
        case
          when jsonb_typeof(p_extracted -> 'zwischensumme_brutto') = 'number'
            then (p_extracted ->> 'zwischensumme_brutto')::numeric
          when jsonb_typeof(p_extracted -> 'zwischensumme_brutto') = 'string'
                and (p_extracted ->> 'zwischensumme_brutto') ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$'
            then btrim(p_extracted ->> 'zwischensumme_brutto')::numeric
        end,
        p_amount_gross
      ) as subtotal
  ),
  active_rates as (
    select array_agg(rate) as rates
    from halves,
      lateral (
        select case
          when jsonb_typeof(elem) = 'number' then (elem #>> '{}')::numeric
          when jsonb_typeof(elem) = 'string' and (elem #>> '{}') ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$'
            then btrim(elem #>> '{}')::numeric
        end as rate
        from jsonb_array_elements(
          case when jsonb_typeof(basis -> 'vat_rate_valid' -> 'values' -> 'active_rates') = 'array'
            then basis -> 'vat_rate_valid' -> 'values' -> 'active_rates'
            else '[]'::jsonb end
        ) as elem
      ) parsed
    where parsed.rate is not null
  ),
  recheck as (
    select jsonb_build_object(
      'iban_checksum_valid', case when cardinality(iban_candidates.arr) = 0 then 'not_applicable'
          when (select bool_and(public.invoice_iban_checksum_ok(c)) from unnest(iban_candidates.arr) c)
            then 'ok' else 'failed' end,
      'payable_iban_present', case when lower(btrim(coalesce(halves.basis -> 'payable_iban_present' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when cardinality(iban_candidates.arr) > 0 then 'ok' else 'failed' end end,
      'iban_unambiguous', case when lower(btrim(coalesce(halves.basis -> 'iban_unambiguous' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when cardinality(iban_candidates.arr) = 0 then 'not_applicable'
          when cardinality(iban_candidates.arr) <= 1 then 'ok' else 'failed' end end,
      'gross_present', case when p_amount_gross is not null then 'ok' else 'failed' end,
      'issuer_present', case when btrim(coalesce(p_issuer, '')) <> '' then 'ok' else 'failed' end,
      'date_present', case when p_document_date is not null then 'ok' else 'failed' end,
      'invoice_number_present', case when btrim(coalesce(p_invoice_number, '')) <> '' then 'ok' else 'failed' end,
      'sum_matches', case when numbers.subtotal is null or p_amount_net is null or p_vat_amount is null
          then 'not_applicable'
          when abs((p_amount_net::float8 + p_vat_amount::float8) - numbers.subtotal::float8) <= 0.02 then 'ok'
          else 'failed' end,
      'vat_rate_valid', case when p_vat_rate is null or active_rates.rates is null then 'not_applicable'
          when floor(p_vat_rate + 0.5) = any(active_rates.rates) then 'ok' else 'failed' end,
      'date_not_future', case when p_document_date is null then 'not_applicable'
          when p_document_date <= current_date then 'ok' else 'failed' end,
      'recipient_present', case when lower(btrim(coalesce(halves.basis -> 'recipient_present' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when btrim(coalesce(p_recipient_name, '')) <> '' then 'ok' else 'failed' end end,
      'assignment_resolved', case when btrim(coalesce(p_company_code, '')) <> '' then 'ok' else 'failed' end
    ) as m
    from halves, iban_candidates, numbers, active_rates
  ),
  final_detail as (
    select case
      when halves.basis <> '{}'::jsonb then coalesce(
        (
          select jsonb_object_agg(
            entry.check_key,
            case when recheck.m ? entry.check_key and jsonb_typeof(entry.check_value) = 'object'
              then jsonb_set(entry.check_value, '{status}', recheck.m -> entry.check_key)
              else entry.check_value end
          )
          from jsonb_each(halves.basis) as entry(check_key, check_value)
        ), '{}'::jsonb)
      else halves.stored_user
    end as detail
    from halves, recheck
  ),
  checks_tier as (
    select case
      when jsonb_typeof(p_extracted -> 'review_checks') = 'array'
            and jsonb_array_length(p_extracted -> 'review_checks') > 0
        then p_extracted -> 'review_checks' end as arr
  ),
  flat_tier as (
    select coalesce(
      case when jsonb_typeof(p_extracted -> 'validation') = 'object'
        then p_extracted -> 'validation' end,
      p_validation, '{}'::jsonb) as fv
  )
  select
    (case
      when final_detail.detail <> '{}'::jsonb then (
        select count(*)::int from jsonb_each(final_detail.detail) as entry(check_key, check_value)
        where entry.check_key in ('gross_present','issuer_present','sum_matches','vat_rate_valid','iban_checksum_valid','date_not_future','invoice_number_present','date_present','payable_iban_present','recipient_present','iban_unambiguous','relevance_ok','assignment_resolved','brutto_vorhanden','steller_vorhanden','summe_ok','ust_satz_ok','iban_ok','datum_plausibel','rechnungsnr_vorhanden','datum_vorhanden','iban_vorhanden','empfaenger_vorhanden')
          and btrim(lower(coalesce(entry.check_value ->> 'status', ''))) not in ('', 'ok', 'not_applicable', 'skipped')
      )
      when checks_tier.arr is not null then (
        select count(*)::int from jsonb_array_elements(checks_tier.arr) as review_check(value)
        where btrim(lower(coalesce(review_check.value ->> 'severity', ''))) <> 'informational'
          and coalesce(review_check.value ->> 'field', '') in ('iban_anzahl','extraction_confidence','relevance','document_readable','exclusion','brutto_vorhanden','steller_vorhanden','summe_ok','ust_satz_ok','iban_ok','datum_plausibel','rechnungsnr_vorhanden','datum_vorhanden','empfaenger_name','assignment','safety_invariant_1','safety_invariant_2','safety_invariant_3','safety_invariant_4a','safety_invariant_4b','safety_invariant_5','forced_review')
          and btrim(lower(coalesce(review_check.value ->> 'status', ''))) not in ('', 'ok', 'not_applicable', 'skipped')
      )
      else (
        select count(*)::int from jsonb_each_text(flat_tier.fv) as gate(gate_name, gate_value)
        where gate.gate_name in ('brutto_vorhanden','steller_vorhanden','datum_vorhanden','rechnungsnr_vorhanden','summe_ok','ust_satz_ok','iban_ok','datum_plausibel')
          and gate.gate_value = 'false'
          and (gate.gate_name not in ('rechnungsnr_vorhanden','datum_vorhanden')
               or coalesce(flat_tier.fv ->> 'kleinbetrag', '') <> 'true')
      )
    end) as problem_count,
    (case
      when final_detail.detail <> '{}'::jsonb then
        not exists (
          select 1 from jsonb_each(final_detail.detail) as entry(check_key, check_value)
          where entry.check_key not in ('kleinbetrag','is_small_amount')
            and btrim(lower(coalesce(entry.check_value ->> 'status', ''))) not in ('', 'not_applicable', 'skipped')
        )
      when checks_tier.arr is not null then
        not exists (
          select 1 from jsonb_array_elements(checks_tier.arr) as review_check(value)
          where btrim(lower(coalesce(review_check.value ->> 'severity', ''))) <> 'informational'
            and btrim(lower(coalesce(review_check.value ->> 'status', ''))) not in ('', 'not_applicable', 'skipped')
        )
      else
        not exists (
          select 1 from jsonb_each_text(flat_tier.fv) as gate(gate_name, gate_value)
          where gate.gate_name in ('brutto_vorhanden','steller_vorhanden','datum_vorhanden','rechnungsnr_vorhanden','summe_ok','ust_satz_ok','iban_ok','datum_plausibel')
            and (gate.gate_value = 'true'
                 or (gate.gate_value = 'false'
                     and (gate.gate_name not in ('rechnungsnr_vorhanden','datum_vorhanden')
                          or coalesce(flat_tier.fv ->> 'kleinbetrag', '') <> 'true')))
        )
    end) as unchecked
  from final_detail, checks_tier, flat_tier;
$_$;


ALTER FUNCTION "public"."invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text") OWNER TO "postgres";

--
-- Name: invoices_facets(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoices_facets"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'objekt_codes', coalesce(
      jsonb_agg(distinct property_code order by property_code)
        filter (where property_code is not null), '[]'::jsonb),
    'belegarten', coalesce(
      jsonb_agg(distinct document_type order by document_type)
        filter (where document_type is not null), '[]'::jsonb),
    'months', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY-MM')
                order by to_char(document_date, 'YYYY-MM') desc)
        filter (where document_date is not null), '[]'::jsonb),
    'years', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY')
                order by to_char(document_date, 'YYYY') desc)
        filter (where document_date is not null), '[]'::jsonb)
  )
  from public.documents
  where deleted_at is null;
$$;


ALTER FUNCTION "public"."invoices_facets"() OWNER TO "postgres";

--
-- Name: invoices_filtered_aggregate("text", "text", "text", "text", "date", "date", "text", "text", numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoices_filtered_aggregate"("p_company_code" "text" DEFAULT NULL::"text", "p_property_code" "text" DEFAULT NULL::"text", "p_cost_category" "text" DEFAULT NULL::"text", "p_issuer_like" "text" DEFAULT NULL::"text", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT NULL::"text", "p_payment_state" "text" DEFAULT NULL::"text", "p_amount_min" numeric DEFAULT NULL::numeric, "p_amount_max" numeric DEFAULT NULL::numeric) RETURNS TABLE("total_count" bigint, "total_gross" numeric, "total_net" numeric, "total_vat" numeric, "all_paid_count" bigint, "all_paid_gross" numeric, "all_paid_net" numeric, "all_paid_vat" numeric, "all_open_count" bigint, "all_open_gross" numeric, "all_open_net" numeric, "all_open_vat" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with scope as (
    select amount_gross, amount_net, vat_amount, paid_at,
      (
        p_payment_state is null
        or (p_payment_state = 'paid'    and paid_at is not null)
        or (p_payment_state = 'open'    and paid_at is null)
        or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
        or p_payment_state not in ('paid', 'open', 'overdue')
      ) as matches_payment_filter
    from public.v_invoices_review
    where archived_at is null
      and not_relevant_at is null
      and (
        p_company_code is null
        or company_code = p_company_code
        or (p_company_code = 'NZO' and company_code is null)
      )
      and (p_property_code is null or property_code = p_property_code)
      and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
      and (p_issuer_like   is null
           or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
      and (p_date_from     is null or document_date >= p_date_from)
      and (p_date_to       is null or document_date <= p_date_to)
      and (p_status        is null or status = p_status)
      and (p_amount_min    is null or amount_gross >= p_amount_min)
      and (p_amount_max    is null or amount_gross <= p_amount_max)
  )
  select
    count(*)                   filter (where matches_payment_filter),
    coalesce(sum(amount_gross) filter (where matches_payment_filter), 0),
    coalesce(sum(amount_net)   filter (where matches_payment_filter), 0),
    coalesce(sum(vat_amount)   filter (where matches_payment_filter), 0),
    count(*)                   filter (where paid_at is not null),
    coalesce(sum(amount_gross) filter (where paid_at is not null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is not null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is not null), 0),
    count(*)                   filter (where paid_at is null),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is null), 0)
  from scope;
$$;


ALTER FUNCTION "public"."invoices_filtered_aggregate"("p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) OWNER TO "postgres";

--
-- Name: invoices_filtered_search("public"."vector", "text", "text", "text", "text", "date", "date", "text", integer, "text", numeric, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoices_filtered_search"("p_query_embedding" "public"."vector" DEFAULT NULL::"public"."vector", "p_company_code" "text" DEFAULT NULL::"text", "p_property_code" "text" DEFAULT NULL::"text", "p_cost_category" "text" DEFAULT NULL::"text", "p_issuer_like" "text" DEFAULT NULL::"text", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 15, "p_payment_state" "text" DEFAULT NULL::"text", "p_amount_min" numeric DEFAULT NULL::numeric, "p_amount_max" numeric DEFAULT NULL::numeric) RETURNS TABLE("id" "uuid", "invoice_number" "text", "issuer" "text", "document_date" "date", "amount_gross" numeric, "company_code" "text", "property_code" "text", "cost_category" "text", "service_description" "text", "paid_at" timestamp with time zone, "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code,
    cost_category, service_description, paid_at,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (
      p_company_code is null
      or company_code = p_company_code
      or (p_company_code = 'NZO' and company_code is null)
    )
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
    and (p_issuer_like   is null
         or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_amount_min    is null or amount_gross >= p_amount_min)
    and (p_amount_max    is null or amount_gross <= p_amount_max)
    and (p_query_embedding is null or embedding is not null)
    and (
      p_payment_state is null
      or (p_payment_state = 'paid'    and paid_at is not null)
      or (p_payment_state = 'open'    and paid_at is null)
      or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
      or p_payment_state not in ('paid', 'open', 'overdue')
    )
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;


ALTER FUNCTION "public"."invoices_filtered_search"("p_query_embedding" "public"."vector", "p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_limit" integer, "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) OWNER TO "postgres";

--
-- Name: invoices_kpis("text", "text", "text", "text", "text", "date", "date", "text", "text", "text", "text", "text", "uuid"[], "date", "date", boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoices_kpis"("p_q" "text" DEFAULT NULL::"text", "p_gesellschaft" "text" DEFAULT NULL::"text", "p_objekt" "text" DEFAULT NULL::"text", "p_belegart" "text" DEFAULT NULL::"text", "p_zahlung" "text" DEFAULT NULL::"text", "p_von" "date" DEFAULT NULL::"date", "p_bis" "date" DEFAULT NULL::"date", "p_datev" "text" DEFAULT NULL::"text", "p_workflow" "text" DEFAULT NULL::"text", "p_bank_match" "text" DEFAULT NULL::"text", "p_ampel" "text" DEFAULT NULL::"text", "p_archiv" "text" DEFAULT NULL::"text", "p_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_faellig_von" "date" DEFAULT NULL::"date", "p_faellig_bis" "date" DEFAULT NULL::"date", "p_faellig_unbekannt" boolean DEFAULT false, "p_direct_debit" boolean DEFAULT NULL::boolean) RETURNS TABLE("total" bigint, "erkannt" bigint, "zu_pruefen" bigint, "volumen" numeric, "offen" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    count(*),
    count(*) filter (where status = 'erkannt'),
    count(*) filter (where status = 'zu_pruefen'),
    coalesce(sum(amount_gross), 0),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0)
  from public.v_invoices_search
  where (p_q is null or search_text like all (
      select '%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from regexp_split_to_table(lower(p_q), '\s+') as word
      where word <> ''
    ))
    and (
      p_gesellschaft is null
      or company_code = p_gesellschaft
      -- NZO ("Nicht zugeordnet") is the catch-all for unassigned, and the pipeline
      -- expresses unassigned as NULL rather than by writing the code, so it has to
      -- match both. Same rule as migration 20260813190000 set for the search RPCs.
      or (p_gesellschaft = 'NZO' and company_code is null)
    )
    and (
      p_objekt is null
      or property_code = p_objekt
      -- The list sends this sentinel for "no property assigned". Properties have no
      -- catch-all code the way companies have NZO, so the filter is expressed as a
      -- value the column can never hold.
      or (p_objekt = '__ohne' and property_code is null)
    )
    and (p_belegart is null or document_type = p_belegart)
    and (
      p_zahlung is null
      or (p_zahlung = 'bezahlt' and paid_at is not null)
      or (p_zahlung = 'offen'   and paid_at is null)
    )
    and (
      p_datev is null
      or (p_datev = 'uebergeben' and datev_handed_over_at is not null)
      or (p_datev = 'offen'      and datev_handed_over_at is null)
    )
    and (
      p_bank_match is null
      or (p_bank_match = 'vorschlag'  and has_suggested_bank_match and not has_confirmed_bank_match)
      or (p_bank_match = 'zugeordnet' and has_confirmed_bank_match)
      or (p_bank_match = 'offen' and not has_suggested_bank_match and not has_confirmed_bank_match)
    )
    and (p_workflow is null or workflow_status = p_workflow)
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis)
    and (case when p_archiv = 'nur' then archived_at is not null else archived_at is null end)
    and (p_ids is null or id = any(p_ids))
    and (
      p_ampel is null
      or (p_ampel =  'auffaellig' and traffic_light in ('gelb', 'rot'))
      or (p_ampel <> 'auffaellig' and traffic_light = p_ampel)
    )
    and (case when p_faellig_unbekannt then due_date is null else true end)
    and (p_faellig_von is null or due_date >= p_faellig_von)
    and (p_faellig_bis is null or due_date <= p_faellig_bis)
    and (p_direct_debit is null or public.is_direct_debit(payment_method) = p_direct_debit)
    and not_relevant_at is null;
$$;


ALTER FUNCTION "public"."invoices_kpis"("p_q" "text", "p_gesellschaft" "text", "p_objekt" "text", "p_belegart" "text", "p_zahlung" "text", "p_von" "date", "p_bis" "date", "p_datev" "text", "p_workflow" "text", "p_bank_match" "text", "p_ampel" "text", "p_archiv" "text", "p_ids" "uuid"[], "p_faellig_von" "date", "p_faellig_bis" "date", "p_faellig_unbekannt" boolean, "p_direct_debit" boolean) OWNER TO "postgres";

--
-- Name: invoices_search_ids("text", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."invoices_search_ids"("p_where" "text" DEFAULT NULL::"text", "p_archived" boolean DEFAULT false) RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '8s'
    AS $$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select id from public.v_invoices_review where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end;
end;
$$;


ALTER FUNCTION "public"."invoices_search_ids"("p_where" "text", "p_archived" boolean) OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(public.current_role_name() in ('admin', 'super_admin'), false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: is_direct_debit("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_direct_debit"("p_payment_method" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select p_payment_method is not null
     and (
       lower(p_payment_method) like '%lastschrift%'
       or lower(p_payment_method) like '%einzug%'
       or lower(p_payment_method) like '%abbuch%'
     );
$$;


ALTER FUNCTION "public"."is_direct_debit"("p_payment_method" "text") OWNER TO "postgres";

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "company_code" "text",
    "supplier_id" "uuid",
    "issuer" "text",
    "document_type" "text" DEFAULT 'rechnung'::"text",
    "document_date" "date",
    "service_date" "date",
    "invoice_number" "text",
    "amount_net" numeric(12,2),
    "vat_rate" numeric(5,2),
    "vat_amount" numeric(12,2),
    "amount_gross" numeric(12,2),
    "currency" "text" DEFAULT 'EUR'::"text",
    "is_small_amount" boolean DEFAULT false,
    "intake_channel" "text" DEFAULT 'email'::"text",
    "source" "text",
    "property_code" "text",
    "storage_path" "text",
    "ocr_fulltext" "text",
    "status" "text" DEFAULT 'erkannt'::"text",
    "extracted" "jsonb",
    "validation" "jsonb",
    "source_item_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "service_period_from" "date",
    "service_period_to" "date",
    "cost_category" "text",
    "service_description" "text",
    "line_items" "jsonb",
    "tax" "jsonb",
    "issuer_address" "text",
    "recipient_name" "text",
    "recipient_address" "text",
    "customer_number" "text",
    "payment_reference" "text",
    "payment_method" "text",
    "tax_note" "text",
    "traffic_light" "text",
    "confidence_score" numeric(4,3),
    "already_paid" boolean,
    "fts" "tsvector" GENERATED ALWAYS AS (("setweight"("to_tsvector"('"german"'::"regconfig", ((COALESCE("invoice_number", ''::"text") || ' '::"text") || COALESCE("issuer", ''::"text"))), 'A'::"char") || "setweight"("to_tsvector"('"german"'::"regconfig", ((COALESCE("service_description", ''::"text") || ' '::"text") || COALESCE("ocr_fulltext", ''::"text"))), 'B'::"char"))) STORED,
    "embedding" "public"."vector"(1536),
    "property_id" "uuid",
    "source_document_id" "uuid",
    "page_range" "text",
    "vat_treatment" "text",
    "business_line_id" "uuid",
    "business_line_code" "text",
    "assignment_source" "text",
    "workflow_status" "text" DEFAULT 'eingegangen'::"text" NOT NULL,
    "assigned_to" "text",
    "order_number" "text",
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "paid_source" "text",
    "vat_source" "text",
    "cost_category_source" "text",
    "not_relevant_at" timestamp with time zone,
    "not_relevant_by" "text",
    "not_relevant_note" "text",
    "mailbox_reset_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_note" "text",
    "assignment_decided_by" "text",
    "category_id" "uuid",
    "vat_deductible_pct" numeric,
    "vat_deductibility_source" "text",
    "vat_special_case" "text",
    "vat_conflict_at" timestamp with time zone,
    "vat_conflict_note" "text",
    "vat_deductible_amount" numeric GENERATED ALWAYS AS ("round"((("vat_amount" * "vat_deductible_pct") / (100)::numeric), 2)) STORED,
    "vat_nondeductible_amount" numeric GENERATED ALWAYS AS (("vat_amount" - "round"((("vat_amount" * "vat_deductible_pct") / (100)::numeric), 2))) STORED,
    "datev_handed_over_at" timestamp with time zone,
    "datev_batch_id" "uuid",
    "income_tax_treatment" "text",
    "filed_at" timestamp with time zone,
    "validation_detail" "jsonb",
    "urgency" "text",
    "days_until_due" integer,
    "early_payment_deadline" "date",
    "early_payment_discount_percent" double precision,
    "early_payment_discount_amount" double precision,
    "approved_by" "uuid",
    "assigned_user_id" "uuid",
    "company_assignment_source" "text",
    "property_assignment_source" "text",
    "uploaded_for_transaction_id" "uuid",
    "is_overhead" boolean DEFAULT false NOT NULL,
    CONSTRAINT "invoices_assignment_decided_by_check" CHECK ((("assignment_decided_by" IS NULL) OR ("assignment_decided_by" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_assignment_source_check" CHECK ((("assignment_source" IS NULL) OR ("assignment_source" = ANY (ARRAY['property_company'::"text", 'property_company+name'::"text", 'name'::"text", 'unresolved'::"text"])))),
    CONSTRAINT "invoices_company_assignment_source_check" CHECK ((("company_assignment_source" IS NULL) OR ("company_assignment_source" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_cost_category_source_check" CHECK ((("cost_category_source" IS NULL) OR ("cost_category_source" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_income_tax_treatment_check" CHECK ((("income_tax_treatment" IS NULL) OR ("income_tax_treatment" = ANY (ARRAY['herstellungsaufwand'::"text", 'erhaltungsaufwand'::"text"])))),
    CONSTRAINT "invoices_overhead_xor_property" CHECK ((NOT ("is_overhead" AND ("property_id" IS NOT NULL)))),
    CONSTRAINT "invoices_paid_source_check" CHECK (("paid_source" = ANY (ARRAY['bank_match'::"text", 'manual'::"text", 'banksapi_payment'::"text"]))),
    CONSTRAINT "invoices_property_assignment_source_check" CHECK ((("property_assignment_source" IS NULL) OR ("property_assignment_source" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_traffic_light_chk" CHECK (("traffic_light" = ANY (ARRAY['gruen'::"text", 'gelb'::"text", 'rot'::"text"]))),
    CONSTRAINT "invoices_vat_deductibility_source_check" CHECK ((("vat_deductibility_source" IS NULL) OR ("vat_deductibility_source" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_vat_deductible_pct_check" CHECK ((("vat_deductible_pct" IS NULL) OR (("vat_deductible_pct" >= (0)::numeric) AND ("vat_deductible_pct" <= (100)::numeric)))),
    CONSTRAINT "invoices_vat_source_check" CHECK ((("vat_source" IS NULL) OR ("vat_source" = ANY (ARRAY['ai'::"text", 'rule'::"text", 'human'::"text"])))),
    CONSTRAINT "invoices_vat_special_case_check" CHECK ((("vat_special_case" IS NULL) OR ("vat_special_case" = ANY (ARRAY['hospitality'::"text", 'partial'::"text", 'down_payment'::"text"])))),
    CONSTRAINT "invoices_workflow_status_check" CHECK (("workflow_status" = ANY (ARRAY['eingegangen'::"text", 'in_pruefung'::"text", 'rueckfrage'::"text", 'freigegeben_assistenz'::"text", 'freigegeben_vorgesetzter'::"text", 'bezahlt'::"text", 'uebergeben_datev'::"text", 'abgeschlossen'::"text", 'abgelehnt'::"text", 'nicht_relevant'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";

--
-- Name: COLUMN "documents"."business_line_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."business_line_id" IS 'Vestigial as of migration 0083 (business-line model removed) -- no longer written or read by the Hub. Kept, not dropped, because v_invoices_list (select b.*, live definition not version-controlled here) exposes every invoices column and dropping this would cascade into it.';


--
-- Name: COLUMN "documents"."business_line_code"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."business_line_code" IS 'Vestigial as of migration 0083 -- see the comment on business_line_id.';


--
-- Name: COLUMN "documents"."assignment_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."assignment_source" IS 'HOW the ingestion pipeline resolved the company: property_company | property_company+name | name | unresolved. Owned by the pipeline; the Hub reads it and must not write it. Renamed from property_assignment(+name) by migration 0083 to match property_companies.';


--
-- Name: COLUMN "documents"."assigned_to"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."assigned_to" IS 'HISTORICAL. Superseded by assigned_user_id. Not written any more; existing values are what past assignments actually pointed at and are referenced by invoice_history ''zuweisung'' entries.';


--
-- Name: COLUMN "documents"."paid_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."paid_source" IS 'bank_match = paid_at was derived from confirmed bank matches and may be cleared again when coverage drops. NULL or manual = a human set it; never cleared automatically.';


--
-- Name: COLUMN "documents"."vat_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_source" IS 'Provenance of vat_rate/vat_amount: ai | rule | human. A human value is never overwritten by a rule.';


--
-- Name: COLUMN "documents"."cost_category_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."cost_category_source" IS 'Provenance of cost_category: ai | rule | human. A human value is never overwritten by a rule.';


--
-- Name: COLUMN "documents"."mailbox_reset_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."mailbox_reset_at" IS 'Set by the external ingestion pipeline once the mail has actually been moved back into the inbox. NULL while not_relevant_at is set means the return is still pending.';


--
-- Name: COLUMN "documents"."archive_note"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."archive_note" IS 'The warning note shown to the responsible person: we are archiving this, take care of it elsewhere, nothing further happens in the system.';


--
-- Name: COLUMN "documents"."assignment_decided_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."assignment_decided_by" IS 'DEPRECATED: superseded by company_assignment_source / property_assignment_source, one column per field instead of one shared between them. Kept so historical rows and queries that still reference it keep working. Do not read it for new UI.';


--
-- Name: COLUMN "documents"."category_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."category_id" IS 'Structured taxonomy reference (bwa_categories), additive to the free-text cost_category the pipeline writes. Written by apply_assignment_rules alongside a canonical cost_category text, under the same cost_category_source human-lock. Null means "not yet categorized". See 0030.';


--
-- Name: COLUMN "documents"."vat_deductible_pct"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_deductible_pct" IS 'Resolved % of vat_amount actually reclaimable as input VAT. NULL means not yet resolved. Defaults from the business line''s VAT treatment (resolve_default_vat_deductible_pct), overridden by a vat_rate rule''s own vat_deductible_pct, overridden by a human. See 0031.';


--
-- Name: COLUMN "documents"."vat_deductibility_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_deductibility_source" IS 'Provenance of vat_deductible_pct: ai | rule | human. ''ai'' covers both a raw AI guess and the system default computed from the business line -- which one fired is in the invoice_history log line text, not a separate column, so the ai|rule|human vocabulary used everywhere else in this engine does not need a fourth value.';


--
-- Name: COLUMN "documents"."vat_special_case"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_special_case" IS 'Hospitality / partial deductibility / a down payment -- see the migration header for the hospitality caveat. down_payment is a pure flag (Anzahlung VAT timing for the final invoice); it does not itself change vat_deductible_pct.';


--
-- Name: COLUMN "documents"."vat_conflict_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_conflict_at" IS 'Set by apply_assignment_rules when a VAT rule flips a receipt''s liability status (charged no VAT -> charged VAT, or the reverse) versus what was previously resolved -- the briefing''s "a supplier who so far charged no VAT suddenly charges 19% must stand out". Surfaced as a dismissable warning on the receipt detail page. See migration 0031.';


--
-- Name: COLUMN "documents"."vat_deductible_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_deductible_amount" IS 'vat_amount x vat_deductible_pct / 100, rounded. NULL when either input is unresolved -- never defaulted to 0 or 100.';


--
-- Name: COLUMN "documents"."vat_nondeductible_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."vat_nondeductible_amount" IS 'The portion of vat_amount that is NOT reclaimable and therefore becomes part of the real cost (amount_net + this = the true expense once VAT is not fully reclaimable). NULL under the same condition as vat_deductible_amount.';


--
-- Name: COLUMN "documents"."income_tax_treatment"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."income_tax_treatment" IS 'Herstellungsaufwand (capitalize/depreciate) vs. Erhaltungsaufwand (immediately deductible repair/maintenance expense) — an income-tax classification, distinct from vat_special_case (VAT deductibility). NULL means not applicable/not yet decided. Human-set only, no rule-engine target. See migration 0055.';


--
-- Name: COLUMN "documents"."filed_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."filed_at" IS 'When the pipeline moved this receipt''s source email/Dropbox file into its processed folder. Null means still pending (or no processed folder configured for that channel).';


--
-- Name: COLUMN "documents"."validation_detail"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."validation_detail" IS 'Plain-language explanation per check in the validation column, so a reviewer sees why without digging through the extracted blob. Written by validation.explain().';


--
-- Name: COLUMN "documents"."urgency"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."urgency" IS 'Payment deadline urgency: overdue|today|within_3_days|within_week|later|not_applicable';


--
-- Name: COLUMN "documents"."days_until_due"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."days_until_due" IS 'Days until due_date; negative if overdue (e.g., -5 means 5 days late)';


--
-- Name: COLUMN "documents"."early_payment_deadline"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."early_payment_deadline" IS 'Deadline to claim discount (e.g., day 10 in 2/10 Net 30 terms)';


--
-- Name: COLUMN "documents"."early_payment_discount_percent"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."early_payment_discount_percent" IS 'Discount percentage (e.g., 2 for 2% off)';


--
-- Name: COLUMN "documents"."early_payment_discount_amount"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."early_payment_discount_amount" IS 'Discount amount in document currency if paid by deadline';


--
-- Name: COLUMN "documents"."approved_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."approved_by" IS 'The app_user who moved this invoice to freigegeben_vorgesetzter. Cleared whenever the invoice leaves that state (query, rejection, failed payment), so it never names someone whose approval has since been withdrawn. Read by payment-initiate to refuse a payer who is also the approver.';


--
-- Name: COLUMN "documents"."assigned_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."assigned_user_id" IS 'Who was handed this receipt explicitly, set on the invoice detail screen by somebody holding invoices.assign. An assignment ADDS an actor: the assignee may act even when the resolved rule names other people. Replaces assigned_to, which matched by name.';


--
-- Name: COLUMN "documents"."company_assignment_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."company_assignment_source" IS 'Provenance of company_code/company_id: ai | rule | human. Split out of assignment_decided_by so that settling the company no longer marks the property human-decided too, and so that a company chosen by hand can be shown as such. A human value is never overwritten by a rule.';


--
-- Name: COLUMN "documents"."property_assignment_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."property_assignment_source" IS 'Provenance of property_code/property_id: ai | rule | human. See company_assignment_source.';


--
-- Name: COLUMN "documents"."uploaded_for_transaction_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."uploaded_for_transaction_id" IS 'The bank transaction this invoice was uploaded from, if it was uploaded from one. Read by link_uploaded_invoice_when_extracted once the amount is known. Kept after linking as a record of where the document came from.';


--
-- Name: COLUMN "documents"."is_overhead"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."documents"."is_overhead" IS 'The invoice is overhead ("Gemeinkosten"): it belongs to the company, not to a property. Mutually exclusive with property_id. Distinct from both columns being empty, which means nobody has decided yet.';


--
-- Name: invoice_transaction_matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invoice_transaction_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'kandidat'::"text" NOT NULL,
    "score" numeric,
    "match_reasons" "jsonb",
    "matched_by" "text",
    "matched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "rejected_by" "text",
    "rejected_at" timestamp with time zone,
    "reject_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_matched" numeric NOT NULL,
    "difference_reason" "text",
    CONSTRAINT "invoice_transaction_matches_amount_matched_positive" CHECK (("amount_matched" > (0)::numeric)),
    CONSTRAINT "invoice_transaction_matches_status_check" CHECK (("status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text", 'bestaetigt'::"text", 'abgelehnt'::"text"])))
);


ALTER TABLE "public"."invoice_transaction_matches" OWNER TO "postgres";

--
-- Name: COLUMN "invoice_transaction_matches"."amount_matched"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."invoice_transaction_matches"."amount_matched" IS 'How much of the transaction is allocated to THIS invoice. For a plain 1:1 match it equals the transaction amount. For a collective payment the links across all its invoices add up to the transaction; for installments the links across all transactions add up to the invoice.';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "vat_id" "text",
    "iban" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "bic" "text",
    "phone" "text",
    "email" "text",
    "normalized_name" "text",
    "bank_name" "text",
    "contact_person" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "normalized_vat_ids" "text"[]
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";

--
-- Name: v_invoices_list; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_invoices_list" WITH ("security_invoker"='true') AS
 SELECT "sub"."id",
    "sub"."company_id",
    "sub"."company_code",
    "sub"."supplier_id",
    "sub"."issuer",
    "sub"."document_type",
    "sub"."document_date",
    "sub"."service_date",
    "sub"."invoice_number",
    "sub"."amount_net",
    "sub"."vat_rate",
    "sub"."vat_amount",
    "sub"."amount_gross",
    "sub"."currency",
    "sub"."is_small_amount",
    "sub"."intake_channel",
    "sub"."source",
    "sub"."property_code",
    "sub"."storage_path",
    "sub"."ocr_fulltext",
    "sub"."status",
    "sub"."extracted",
    "sub"."validation",
    "sub"."source_item_id",
    "sub"."created_at",
    "sub"."service_period_from",
    "sub"."service_period_to",
    "sub"."cost_category",
    "sub"."service_description",
    "sub"."line_items",
    "sub"."tax",
    "sub"."issuer_address",
    "sub"."recipient_name",
    "sub"."recipient_address",
    "sub"."customer_number",
    "sub"."payment_reference",
    "sub"."payment_method",
    "sub"."tax_note",
    "sub"."traffic_light",
    "sub"."confidence_score",
    "sub"."already_paid",
    "sub"."fts",
    "sub"."embedding",
    "sub"."property_id",
    "sub"."source_document_id",
    "sub"."page_range",
    "sub"."vat_treatment",
    "sub"."business_line_id",
    "sub"."business_line_code",
    "sub"."assignment_source",
    "sub"."workflow_status",
    "sub"."assigned_to",
    "sub"."order_number",
    "sub"."due_date",
    "sub"."paid_at",
    "sub"."updated_at",
    "sub"."deleted_at",
    "sub"."deleted_by",
    "sub"."delete_reason",
    "sub"."paid_source",
    "sub"."vat_source",
    "sub"."cost_category_source",
    "sub"."not_relevant_at",
    "sub"."not_relevant_by",
    "sub"."not_relevant_note",
    "sub"."mailbox_reset_at",
    "sub"."archived_at",
    "sub"."archived_by",
    "sub"."archive_note",
    "sub"."assignment_decided_by",
    "sub"."category_id",
    "sub"."vat_deductible_pct",
    "sub"."vat_deductibility_source",
    "sub"."vat_special_case",
    "sub"."vat_conflict_at",
    "sub"."vat_conflict_note",
    "sub"."vat_deductible_amount",
    "sub"."vat_nondeductible_amount",
    "sub"."datev_handed_over_at",
    "sub"."datev_batch_id",
    "sub"."issuer_sort",
    "sub"."review_score",
    "sub"."has_suggested_bank_match",
    "sub"."has_confirmed_bank_match",
    "sub"."company_assignment_source",
    "sub"."property_assignment_source",
    "i"."is_overhead"
   FROM (( SELECT "sub_1"."id",
            "sub_1"."company_id",
            "sub_1"."company_code",
            "sub_1"."supplier_id",
            "sub_1"."issuer",
            "sub_1"."document_type",
            "sub_1"."document_date",
            "sub_1"."service_date",
            "sub_1"."invoice_number",
            "sub_1"."amount_net",
            "sub_1"."vat_rate",
            "sub_1"."vat_amount",
            "sub_1"."amount_gross",
            "sub_1"."currency",
            "sub_1"."is_small_amount",
            "sub_1"."intake_channel",
            "sub_1"."source",
            "sub_1"."property_code",
            "sub_1"."storage_path",
            "sub_1"."ocr_fulltext",
            "sub_1"."status",
            "sub_1"."extracted",
            "sub_1"."validation",
            "sub_1"."source_item_id",
            "sub_1"."created_at",
            "sub_1"."service_period_from",
            "sub_1"."service_period_to",
            "sub_1"."cost_category",
            "sub_1"."service_description",
            "sub_1"."line_items",
            "sub_1"."tax",
            "sub_1"."issuer_address",
            "sub_1"."recipient_name",
            "sub_1"."recipient_address",
            "sub_1"."customer_number",
            "sub_1"."payment_reference",
            "sub_1"."payment_method",
            "sub_1"."tax_note",
            "sub_1"."traffic_light",
            "sub_1"."confidence_score",
            "sub_1"."already_paid",
            "sub_1"."fts",
            "sub_1"."embedding",
            "sub_1"."property_id",
            "sub_1"."source_document_id",
            "sub_1"."page_range",
            "sub_1"."vat_treatment",
            "sub_1"."business_line_id",
            "sub_1"."business_line_code",
            "sub_1"."assignment_source",
            "sub_1"."workflow_status",
            "sub_1"."assigned_to",
            "sub_1"."order_number",
            "sub_1"."due_date",
            "sub_1"."paid_at",
            "sub_1"."updated_at",
            "sub_1"."deleted_at",
            "sub_1"."deleted_by",
            "sub_1"."delete_reason",
            "sub_1"."paid_source",
            "sub_1"."vat_source",
            "sub_1"."cost_category_source",
            "sub_1"."not_relevant_at",
            "sub_1"."not_relevant_by",
            "sub_1"."not_relevant_note",
            "sub_1"."mailbox_reset_at",
            "sub_1"."archived_at",
            "sub_1"."archived_by",
            "sub_1"."archive_note",
            "sub_1"."assignment_decided_by",
            "sub_1"."category_id",
            "sub_1"."vat_deductible_pct",
            "sub_1"."vat_deductibility_source",
            "sub_1"."vat_special_case",
            "sub_1"."vat_conflict_at",
            "sub_1"."vat_conflict_note",
            "sub_1"."vat_deductible_amount",
            "sub_1"."vat_nondeductible_amount",
            "sub_1"."datev_handed_over_at",
            "sub_1"."datev_batch_id",
            "sub_1"."issuer_sort",
            "sub_1"."review_score",
            "sub_1"."has_suggested_bank_match",
            "sub_1"."has_confirmed_bank_match",
            "i_1"."company_assignment_source",
            "i_1"."property_assignment_source"
           FROM (( SELECT "i_1_1"."id",
                    "i_1_1"."company_id",
                    "i_1_1"."company_code",
                    "i_1_1"."supplier_id",
                    "i_1_1"."issuer",
                    "i_1_1"."document_type",
                    "i_1_1"."document_date",
                    "i_1_1"."service_date",
                    "i_1_1"."invoice_number",
                    "i_1_1"."amount_net",
                    "i_1_1"."vat_rate",
                    "i_1_1"."vat_amount",
                    "i_1_1"."amount_gross",
                    "i_1_1"."currency",
                    "i_1_1"."is_small_amount",
                    "i_1_1"."intake_channel",
                    "i_1_1"."source",
                    "i_1_1"."property_code",
                    "i_1_1"."storage_path",
                    "i_1_1"."ocr_fulltext",
                    "i_1_1"."status",
                    "i_1_1"."extracted",
                    "i_1_1"."validation",
                    "i_1_1"."source_item_id",
                    "i_1_1"."created_at",
                    "i_1_1"."service_period_from",
                    "i_1_1"."service_period_to",
                    "i_1_1"."cost_category",
                    "i_1_1"."service_description",
                    "i_1_1"."line_items",
                    "i_1_1"."tax",
                    "i_1_1"."issuer_address",
                    "i_1_1"."recipient_name",
                    "i_1_1"."recipient_address",
                    "i_1_1"."customer_number",
                    "i_1_1"."payment_reference",
                    "i_1_1"."payment_method",
                    "i_1_1"."tax_note",
                    "i_1_1"."traffic_light",
                    "i_1_1"."confidence_score",
                    "i_1_1"."already_paid",
                    "i_1_1"."fts",
                    "i_1_1"."embedding",
                    "i_1_1"."property_id",
                    "i_1_1"."source_document_id",
                    "i_1_1"."page_range",
                    "i_1_1"."vat_treatment",
                    "i_1_1"."business_line_id",
                    "i_1_1"."business_line_code",
                    "i_1_1"."assignment_source",
                    "i_1_1"."workflow_status",
                    "i_1_1"."assigned_to",
                    "i_1_1"."order_number",
                    "i_1_1"."due_date",
                    "i_1_1"."paid_at",
                    "i_1_1"."updated_at",
                    "i_1_1"."deleted_at",
                    "i_1_1"."deleted_by",
                    "i_1_1"."delete_reason",
                    "i_1_1"."paid_source",
                    "i_1_1"."vat_source",
                    "i_1_1"."cost_category_source",
                    "i_1_1"."not_relevant_at",
                    "i_1_1"."not_relevant_by",
                    "i_1_1"."not_relevant_note",
                    "i_1_1"."mailbox_reset_at",
                    "i_1_1"."archived_at",
                    "i_1_1"."archived_by",
                    "i_1_1"."archive_note",
                    "i_1_1"."assignment_decided_by",
                    "i_1_1"."category_id",
                    "i_1_1"."vat_deductible_pct",
                    "i_1_1"."vat_deductibility_source",
                    "i_1_1"."vat_special_case",
                    "i_1_1"."vat_conflict_at",
                    "i_1_1"."vat_conflict_note",
                    "i_1_1"."vat_deductible_amount",
                    "i_1_1"."vat_nondeductible_amount",
                    "i_1_1"."datev_handed_over_at",
                    "i_1_1"."datev_batch_id",
                    COALESCE("s"."name", "i_1_1"."issuer") AS "issuer_sort",
                    (((((((((
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'brutto_vorhanden'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END +
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'steller_vorhanden'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'summe_ok'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'ust_satz_ok'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'iban_ok'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN (("i_1_1"."validation" ->> 'datum_plausibel'::"text") = 'false'::"text") THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN ((COALESCE(("i_1_1"."validation" ->> 'is_small_amount'::"text"), ''::"text") <> 'true'::"text") AND (("i_1_1"."validation" ->> 'rechnungsnr_vorhanden'::"text") = 'false'::"text")) THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN ((COALESCE(("i_1_1"."validation" ->> 'is_small_amount'::"text"), ''::"text") <> 'true'::"text") AND (("i_1_1"."validation" ->> 'datum_vorhanden'::"text") = 'false'::"text")) THEN 10
                            ELSE 0
                        END) +
                        CASE
                            WHEN ("i_1_1"."status" = 'zu_pruefen'::"text") THEN 5
                            ELSE 0
                        END) +
                        CASE
                            WHEN (( SELECT "min"(("e"."v")::numeric) AS "min"
                               FROM "jsonb_each_text"(COALESCE(("i_1_1"."extracted" -> 'konfidenz'::"text"), '{}'::"jsonb")) "e"("k", "v")
                              WHERE ("e"."v" ~ '^[0-9.]+$'::"text")) < 0.8) THEN 3
                            WHEN (( SELECT "min"(("e"."v")::numeric) AS "min"
                               FROM "jsonb_each_text"(COALESCE(("i_1_1"."extracted" -> 'konfidenz'::"text"), '{}'::"jsonb")) "e"("k", "v")
                              WHERE ("e"."v" ~ '^[0-9.]+$'::"text")) < 0.95) THEN 1
                            ELSE 0
                        END) AS "review_score",
                    (EXISTS ( SELECT 1
                           FROM "public"."invoice_transaction_matches" "m"
                          WHERE (("m"."document_id" = "i_1_1"."id") AND ("m"."status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text"]))))) AS "has_suggested_bank_match",
                    (EXISTS ( SELECT 1
                           FROM "public"."invoice_transaction_matches" "m"
                          WHERE (("m"."document_id" = "i_1_1"."id") AND ("m"."status" = 'bestaetigt'::"text")))) AS "has_confirmed_bank_match"
                   FROM ("public"."documents" "i_1_1"
                     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "i_1_1"."supplier_id")))
                  WHERE (("i_1_1"."deleted_at" IS NULL) AND ("i_1_1"."status" <> 'aufgeteilt'::"text"))) "sub_1"
             LEFT JOIN "public"."documents" "i_1" ON (("i_1"."id" = "sub_1"."id")))) "sub"
     LEFT JOIN "public"."documents" "i" ON (("i"."id" = "sub"."id")));


ALTER VIEW "public"."v_invoices_list" OWNER TO "postgres";

--
-- Name: v_invoices_review; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_invoices_review" WITH ("security_invoker"='true') AS
 SELECT "sub"."id",
    "sub"."company_id",
    "sub"."company_code",
    "sub"."supplier_id",
    "sub"."issuer",
    "sub"."document_type",
    "sub"."document_date",
    "sub"."service_date",
    "sub"."invoice_number",
    "sub"."amount_net",
    "sub"."vat_rate",
    "sub"."vat_amount",
    "sub"."amount_gross",
    "sub"."currency",
    "sub"."is_small_amount",
    "sub"."intake_channel",
    "sub"."source",
    "sub"."property_code",
    "sub"."storage_path",
    "sub"."ocr_fulltext",
    "sub"."status",
    "sub"."extracted",
    "sub"."validation",
    "sub"."source_item_id",
    "sub"."created_at",
    "sub"."service_period_from",
    "sub"."service_period_to",
    "sub"."cost_category",
    "sub"."service_description",
    "sub"."line_items",
    "sub"."tax",
    "sub"."issuer_address",
    "sub"."recipient_name",
    "sub"."recipient_address",
    "sub"."customer_number",
    "sub"."payment_reference",
    "sub"."payment_method",
    "sub"."tax_note",
    "sub"."traffic_light",
    "sub"."confidence_score",
    "sub"."already_paid",
    "sub"."fts",
    "sub"."embedding",
    "sub"."property_id",
    "sub"."source_document_id",
    "sub"."page_range",
    "sub"."vat_treatment",
    "sub"."business_line_id",
    "sub"."business_line_code",
    "sub"."assignment_source",
    "sub"."workflow_status",
    "sub"."assigned_to",
    "sub"."order_number",
    "sub"."due_date",
    "sub"."paid_at",
    "sub"."updated_at",
    "sub"."deleted_at",
    "sub"."deleted_by",
    "sub"."delete_reason",
    "sub"."paid_source",
    "sub"."vat_source",
    "sub"."cost_category_source",
    "sub"."not_relevant_at",
    "sub"."not_relevant_by",
    "sub"."not_relevant_note",
    "sub"."mailbox_reset_at",
    "sub"."archived_at",
    "sub"."archived_by",
    "sub"."archive_note",
    "sub"."assignment_decided_by",
    "sub"."category_id",
    "sub"."vat_deductible_pct",
    "sub"."vat_deductibility_source",
    "sub"."vat_special_case",
    "sub"."vat_conflict_at",
    "sub"."vat_conflict_note",
    "sub"."vat_deductible_amount",
    "sub"."vat_nondeductible_amount",
    "sub"."datev_handed_over_at",
    "sub"."datev_batch_id",
    "sub"."issuer_sort",
    "sub"."review_score",
    "sub"."has_suggested_bank_match",
    "sub"."has_confirmed_bank_match",
    "sub"."company_assignment_source",
    "sub"."property_assignment_source",
    "sub"."review_problem_count",
    "sub"."review_unchecked",
    "sub"."search_text",
    "i"."is_overhead"
   FROM (( SELECT "sub_1"."id",
            "sub_1"."company_id",
            "sub_1"."company_code",
            "sub_1"."supplier_id",
            "sub_1"."issuer",
            "sub_1"."document_type",
            "sub_1"."document_date",
            "sub_1"."service_date",
            "sub_1"."invoice_number",
            "sub_1"."amount_net",
            "sub_1"."vat_rate",
            "sub_1"."vat_amount",
            "sub_1"."amount_gross",
            "sub_1"."currency",
            "sub_1"."is_small_amount",
            "sub_1"."intake_channel",
            "sub_1"."source",
            "sub_1"."property_code",
            "sub_1"."storage_path",
            "sub_1"."ocr_fulltext",
            "sub_1"."status",
            "sub_1"."extracted",
            "sub_1"."validation",
            "sub_1"."source_item_id",
            "sub_1"."created_at",
            "sub_1"."service_period_from",
            "sub_1"."service_period_to",
            "sub_1"."cost_category",
            "sub_1"."service_description",
            "sub_1"."line_items",
            "sub_1"."tax",
            "sub_1"."issuer_address",
            "sub_1"."recipient_name",
            "sub_1"."recipient_address",
            "sub_1"."customer_number",
            "sub_1"."payment_reference",
            "sub_1"."payment_method",
            "sub_1"."tax_note",
            "sub_1"."traffic_light",
            "sub_1"."confidence_score",
            "sub_1"."already_paid",
            "sub_1"."fts",
            "sub_1"."embedding",
            "sub_1"."property_id",
            "sub_1"."source_document_id",
            "sub_1"."page_range",
            "sub_1"."vat_treatment",
            "sub_1"."business_line_id",
            "sub_1"."business_line_code",
            "sub_1"."assignment_source",
            "sub_1"."workflow_status",
            "sub_1"."assigned_to",
            "sub_1"."order_number",
            "sub_1"."due_date",
            "sub_1"."paid_at",
            "sub_1"."updated_at",
            "sub_1"."deleted_at",
            "sub_1"."deleted_by",
            "sub_1"."delete_reason",
            "sub_1"."paid_source",
            "sub_1"."vat_source",
            "sub_1"."cost_category_source",
            "sub_1"."not_relevant_at",
            "sub_1"."not_relevant_by",
            "sub_1"."not_relevant_note",
            "sub_1"."mailbox_reset_at",
            "sub_1"."archived_at",
            "sub_1"."archived_by",
            "sub_1"."archive_note",
            "sub_1"."assignment_decided_by",
            "sub_1"."category_id",
            "sub_1"."vat_deductible_pct",
            "sub_1"."vat_deductibility_source",
            "sub_1"."vat_special_case",
            "sub_1"."vat_conflict_at",
            "sub_1"."vat_conflict_note",
            "sub_1"."vat_deductible_amount",
            "sub_1"."vat_nondeductible_amount",
            "sub_1"."datev_handed_over_at",
            "sub_1"."datev_batch_id",
            "sub_1"."issuer_sort",
            "sub_1"."review_score",
            "sub_1"."has_suggested_bank_match",
            "sub_1"."has_confirmed_bank_match",
            "sub_1"."company_assignment_source",
            "sub_1"."property_assignment_source",
            ( SELECT "rs"."problem_count"
                   FROM "public"."invoice_review_state"("bi"."validation_detail", "sub_1"."extracted", "bi"."validation", "sub_1"."issuer", "sub_1"."invoice_number", "sub_1"."document_date", "sub_1"."amount_gross", "sub_1"."amount_net", "sub_1"."vat_amount", "sub_1"."vat_rate", "sub_1"."recipient_name", "sub_1"."company_code", "sup"."iban") "rs"("problem_count", "unchecked")) AS "review_problem_count",
            ( SELECT "rs"."unchecked"
                   FROM "public"."invoice_review_state"("bi"."validation_detail", "sub_1"."extracted", "bi"."validation", "sub_1"."issuer", "sub_1"."invoice_number", "sub_1"."document_date", "sub_1"."amount_gross", "sub_1"."amount_net", "sub_1"."vat_amount", "sub_1"."vat_rate", "sub_1"."recipient_name", "sub_1"."company_code", "sup"."iban") "rs"("problem_count", "unchecked")) AS "review_unchecked",
            "lower"(((((((((((((((COALESCE("sub_1"."issuer", ''::"text") || ' '::"text") || COALESCE("sub_1"."invoice_number", ''::"text")) || ' '::"text") || COALESCE("sub_1"."service_description", ''::"text")) || ' '::"text") || COALESCE("sub_1"."cost_category", ''::"text")) || ' '::"text") || COALESCE("to_char"("sub_1"."amount_gross", 'FM9999999990.00'::"text"), ''::"text")) || ' '::"text") || COALESCE("replace"("to_char"("sub_1"."amount_gross", 'FM9999999990.00'::"text"), '.'::"text", ','::"text"), ''::"text")) || ' '::"text") || COALESCE("to_char"("sub_1"."amount_gross", 'FM9,999,999,990.00'::"text"), ''::"text")) || ' '::"text") || COALESCE("replace"("replace"("replace"("to_char"("sub_1"."amount_gross", 'FM9,999,999,990.00'::"text"), ','::"text", '#'::"text"), '.'::"text", ','::"text"), '#'::"text", '.'::"text"), ''::"text"))) AS "search_text"
           FROM ((( SELECT "sub_1_1"."id",
                    "sub_1_1"."company_id",
                    "sub_1_1"."company_code",
                    "sub_1_1"."supplier_id",
                    "sub_1_1"."issuer",
                    "sub_1_1"."document_type",
                    "sub_1_1"."document_date",
                    "sub_1_1"."service_date",
                    "sub_1_1"."invoice_number",
                    "sub_1_1"."amount_net",
                    "sub_1_1"."vat_rate",
                    "sub_1_1"."vat_amount",
                    "sub_1_1"."amount_gross",
                    "sub_1_1"."currency",
                    "sub_1_1"."is_small_amount",
                    "sub_1_1"."intake_channel",
                    "sub_1_1"."source",
                    "sub_1_1"."property_code",
                    "sub_1_1"."storage_path",
                    "sub_1_1"."ocr_fulltext",
                    "sub_1_1"."status",
                    "sub_1_1"."extracted",
                    "sub_1_1"."validation",
                    "sub_1_1"."source_item_id",
                    "sub_1_1"."created_at",
                    "sub_1_1"."service_period_from",
                    "sub_1_1"."service_period_to",
                    "sub_1_1"."cost_category",
                    "sub_1_1"."service_description",
                    "sub_1_1"."line_items",
                    "sub_1_1"."tax",
                    "sub_1_1"."issuer_address",
                    "sub_1_1"."recipient_name",
                    "sub_1_1"."recipient_address",
                    "sub_1_1"."customer_number",
                    "sub_1_1"."payment_reference",
                    "sub_1_1"."payment_method",
                    "sub_1_1"."tax_note",
                    "sub_1_1"."traffic_light",
                    "sub_1_1"."confidence_score",
                    "sub_1_1"."already_paid",
                    "sub_1_1"."fts",
                    "sub_1_1"."embedding",
                    "sub_1_1"."property_id",
                    "sub_1_1"."source_document_id",
                    "sub_1_1"."page_range",
                    "sub_1_1"."vat_treatment",
                    "sub_1_1"."business_line_id",
                    "sub_1_1"."business_line_code",
                    "sub_1_1"."assignment_source",
                    "sub_1_1"."workflow_status",
                    "sub_1_1"."assigned_to",
                    "sub_1_1"."order_number",
                    "sub_1_1"."due_date",
                    "sub_1_1"."paid_at",
                    "sub_1_1"."updated_at",
                    "sub_1_1"."deleted_at",
                    "sub_1_1"."deleted_by",
                    "sub_1_1"."delete_reason",
                    "sub_1_1"."paid_source",
                    "sub_1_1"."vat_source",
                    "sub_1_1"."cost_category_source",
                    "sub_1_1"."not_relevant_at",
                    "sub_1_1"."not_relevant_by",
                    "sub_1_1"."not_relevant_note",
                    "sub_1_1"."mailbox_reset_at",
                    "sub_1_1"."archived_at",
                    "sub_1_1"."archived_by",
                    "sub_1_1"."archive_note",
                    "sub_1_1"."assignment_decided_by",
                    "sub_1_1"."category_id",
                    "sub_1_1"."vat_deductible_pct",
                    "sub_1_1"."vat_deductibility_source",
                    "sub_1_1"."vat_special_case",
                    "sub_1_1"."vat_conflict_at",
                    "sub_1_1"."vat_conflict_note",
                    "sub_1_1"."vat_deductible_amount",
                    "sub_1_1"."vat_nondeductible_amount",
                    "sub_1_1"."datev_handed_over_at",
                    "sub_1_1"."datev_batch_id",
                    "sub_1_1"."issuer_sort",
                    "sub_1_1"."review_score",
                    "sub_1_1"."has_suggested_bank_match",
                    "sub_1_1"."has_confirmed_bank_match",
                    "i_1"."company_assignment_source",
                    "i_1"."property_assignment_source"
                   FROM (( SELECT "v_invoices_list"."id",
                            "v_invoices_list"."company_id",
                            "v_invoices_list"."company_code",
                            "v_invoices_list"."supplier_id",
                            "v_invoices_list"."issuer",
                            "v_invoices_list"."document_type",
                            "v_invoices_list"."document_date",
                            "v_invoices_list"."service_date",
                            "v_invoices_list"."invoice_number",
                            "v_invoices_list"."amount_net",
                            "v_invoices_list"."vat_rate",
                            "v_invoices_list"."vat_amount",
                            "v_invoices_list"."amount_gross",
                            "v_invoices_list"."currency",
                            "v_invoices_list"."is_small_amount",
                            "v_invoices_list"."intake_channel",
                            "v_invoices_list"."source",
                            "v_invoices_list"."property_code",
                            "v_invoices_list"."storage_path",
                            "v_invoices_list"."ocr_fulltext",
                            "v_invoices_list"."status",
                            "v_invoices_list"."extracted",
                            "v_invoices_list"."validation",
                            "v_invoices_list"."source_item_id",
                            "v_invoices_list"."created_at",
                            "v_invoices_list"."service_period_from",
                            "v_invoices_list"."service_period_to",
                            "v_invoices_list"."cost_category",
                            "v_invoices_list"."service_description",
                            "v_invoices_list"."line_items",
                            "v_invoices_list"."tax",
                            "v_invoices_list"."issuer_address",
                            "v_invoices_list"."recipient_name",
                            "v_invoices_list"."recipient_address",
                            "v_invoices_list"."customer_number",
                            "v_invoices_list"."payment_reference",
                            "v_invoices_list"."payment_method",
                            "v_invoices_list"."tax_note",
                            "v_invoices_list"."traffic_light",
                            "v_invoices_list"."confidence_score",
                            "v_invoices_list"."already_paid",
                            "v_invoices_list"."fts",
                            "v_invoices_list"."embedding",
                            "v_invoices_list"."property_id",
                            "v_invoices_list"."source_document_id",
                            "v_invoices_list"."page_range",
                            "v_invoices_list"."vat_treatment",
                            "v_invoices_list"."business_line_id",
                            "v_invoices_list"."business_line_code",
                            "v_invoices_list"."assignment_source",
                            "v_invoices_list"."workflow_status",
                            "v_invoices_list"."assigned_to",
                            "v_invoices_list"."order_number",
                            "v_invoices_list"."due_date",
                            "v_invoices_list"."paid_at",
                            "v_invoices_list"."updated_at",
                            "v_invoices_list"."deleted_at",
                            "v_invoices_list"."deleted_by",
                            "v_invoices_list"."delete_reason",
                            "v_invoices_list"."paid_source",
                            "v_invoices_list"."vat_source",
                            "v_invoices_list"."cost_category_source",
                            "v_invoices_list"."not_relevant_at",
                            "v_invoices_list"."not_relevant_by",
                            "v_invoices_list"."not_relevant_note",
                            "v_invoices_list"."mailbox_reset_at",
                            "v_invoices_list"."archived_at",
                            "v_invoices_list"."archived_by",
                            "v_invoices_list"."archive_note",
                            "v_invoices_list"."assignment_decided_by",
                            "v_invoices_list"."category_id",
                            "v_invoices_list"."vat_deductible_pct",
                            "v_invoices_list"."vat_deductibility_source",
                            "v_invoices_list"."vat_special_case",
                            "v_invoices_list"."vat_conflict_at",
                            "v_invoices_list"."vat_conflict_note",
                            "v_invoices_list"."vat_deductible_amount",
                            "v_invoices_list"."vat_nondeductible_amount",
                            "v_invoices_list"."datev_handed_over_at",
                            "v_invoices_list"."datev_batch_id",
                            "v_invoices_list"."issuer_sort",
                            "v_invoices_list"."review_score",
                            "v_invoices_list"."has_suggested_bank_match",
                            "v_invoices_list"."has_confirmed_bank_match"
                           FROM "public"."v_invoices_list") "sub_1_1"
                     LEFT JOIN "public"."documents" "i_1" ON (("i_1"."id" = "sub_1_1"."id")))) "sub_1"
             LEFT JOIN "public"."documents" "bi" ON (("bi"."id" = "sub_1"."id")))
             LEFT JOIN "public"."suppliers" "sup" ON (("sup"."id" = "sub_1"."supplier_id")))) "sub"
     LEFT JOIN "public"."documents" "i" ON (("i"."id" = "sub"."id")));


ALTER VIEW "public"."v_invoices_review" OWNER TO "postgres";

--
-- Name: is_direct_debit("public"."v_invoices_review"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_direct_debit"("public"."v_invoices_review") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $_$
  select public.is_direct_debit($1.payment_method);
$_$;


ALTER FUNCTION "public"."is_direct_debit"("public"."v_invoices_review") OWNER TO "postgres";

--
-- Name: is_invoice_reconciled("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_invoice_reconciled"("p_invoice_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when v.soll <= 0 then false
    else v.matched >= v.soll - least(greatest(v.soll * 0.03, 0.01), 150)
  end
  from (
    select
      abs(coalesce(i.amount_gross, 0)) as soll,
      coalesce((
        select sum(abs(m.amount_matched))
          from public.invoice_transaction_matches m
         where m.document_id = i.id and m.status = 'bestaetigt'
      ), 0) as matched
    from public.documents i
    where i.id = p_invoice_id
  ) v;
$$;


ALTER FUNCTION "public"."is_invoice_reconciled"("p_invoice_id" "uuid") OWNER TO "postgres";

--
-- Name: learn_assignment_rule_from_match("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_match   public.invoice_transaction_matches;
  v_inv     public.documents;
  v_txn     public.bank_transactions;
  v_pattern text;
  v_existing uuid;
  v_rule_id  uuid;
begin
  select * into v_match from public.invoice_transaction_matches where id = p_match;
  if not found then
    return null;
  end if;

  select * into v_inv from public.documents where id = v_match.document_id and deleted_at is null;
  if not found or v_inv.supplier_id is null then
    return null;
  end if;

  if coalesce(v_inv.cost_category_source, 'ai') not in ('rule', 'human') then
    return null;
  end if;
  if v_inv.category_id is null and coalesce(v_inv.cost_category, '') = '' then
    return null;
  end if;

  select * into v_txn from public.bank_transactions where id = v_match.transaction_id;
  if found and v_txn.transaction_type = 'lastschrift' and coalesce(v_txn.payment_reference, '') <> '' then
    v_pattern := v_txn.payment_reference;
  else
    v_pattern := null;
  end if;

  select id into v_existing
    from public.assignment_rules
   where target = 'cost_category'
     and deleted_at is null
     and supplier_id = v_inv.supplier_id
     and business_line_id is null and property_id is null and company_id is null
     and coalesce(lower(btrim(reference_pattern)), '') = coalesce(lower(btrim(v_pattern)), '');

  if v_existing is not null then
    update public.assignment_rules
       set cost_category = v_inv.cost_category,
           category_id = v_inv.category_id,
           is_active = true,
           note = 'Automatisch gelernt aus bestätigtem Bankabgleich (zuletzt aktualisiert über Beleg '
                  || v_inv.id || ').',
           updated_at = now()
     where id = v_existing
    returning id into v_rule_id;
    return v_rule_id;
  end if;

  insert into public.assignment_rules (
    target, cost_category, category_id, supplier_id, reference_pattern, created_by, note
  ) values (
    'cost_category', v_inv.cost_category, v_inv.category_id, v_inv.supplier_id, v_pattern, p_actor,
    'Automatisch gelernt aus bestätigtem Bankabgleich (Beleg ' || v_inv.id || ').'
  )
  returning id into v_rule_id;
  return v_rule_id;
end $$;


ALTER FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text") IS 'Called when a bank match is confirmed: upserts a supplier (+ reference, for a recurring direct debit) -> category rule from the receipt''s own rule/human-decided category. Never learns from a bare AI guess. Idempotent: repeated confirmation updates the same rule rather than duplicating it. See migration 0030.';


--
-- Name: link_invoice_transaction("uuid", "uuid", numeric, "jsonb", numeric, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric DEFAULT NULL::numeric, "p_reasons" "jsonb" DEFAULT NULL::"jsonb", "p_amount" numeric DEFAULT NULL::numeric, "p_difference_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_now        timestamptz := now();
  v_match_id   uuid;
  v_withdrawn  int := 0;
  v_batch      int;
  v_released   boolean := false;
  v_tx_total   numeric;
  v_tx_other   numeric;
  v_tx_rest    numeric;
  v_inv_gross  numeric;
  v_inv_other  numeric;
  v_inv_rest   numeric;
  v_amount     numeric;
begin
  if p_invoice_id is null or p_transaction_id is null then
    raise exception 'link_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.documents where id = p_invoice_id and deleted_at is null) then
    raise exception 'link_invoice_transaction: invoice % not found', p_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.documents where id = p_invoice_id and deleted_at is null;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against',
      p_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'bestaetigt' and document_id <> p_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.invoice_transaction_matches
   where document_id = p_invoice_id and status = 'bestaetigt' and transaction_id <> p_invoice_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
  v_released := found;

  insert into public.invoice_transaction_matches
         (document_id, transaction_id, status, score, match_reasons, amount_matched,
          difference_reason, matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          p_difference_reason, v_actor, v_actor, v_now, v_now)
  on conflict (document_id, transaction_id) do update
     set status            = 'bestaetigt',
         amount_matched    = excluded.amount_matched,
         score             = coalesce(excluded.score, public.invoice_transaction_matches.score),
         match_reasons     = coalesce(excluded.match_reasons, public.invoice_transaction_matches.match_reasons),
         difference_reason = coalesce(excluded.difference_reason, public.invoice_transaction_matches.difference_reason),
         confirmed_by      = excluded.confirmed_by,
         confirmed_at      = excluded.confirmed_at,
         rejected_by       = null,
         rejected_at       = null,
         reject_reason     = null,
         updated_at        = v_now
  returning id into v_match_id;

  if public.transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.invoice_matched_sum(p_invoice_id)
     >= v_inv_gross - public.payment_tolerance(v_inv_gross) then
    update public.invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where document_id = p_invoice_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.document_history (document_id, type, text, actor, data)
  values (p_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_difference_reason is not null then format(', Differenzgrund: %s', p_difference_reason) else '' end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'difference_reason', p_difference_reason,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released));

  return v_match_id;
end $$;


ALTER FUNCTION "public"."link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric, "p_difference_reason" "text") OWNER TO "postgres";

--
-- Name: link_outgoing_invoice_transaction("uuid", "uuid", numeric, "jsonb", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric DEFAULT NULL::numeric, "p_reasons" "jsonb" DEFAULT NULL::"jsonb", "p_amount" numeric DEFAULT NULL::numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_now        timestamptz := now();
  v_match_id   uuid;
  v_withdrawn  int := 0;
  v_batch      int;
  v_released   boolean := false;
  v_tx_total   numeric;
  v_tx_other   numeric;
  v_tx_rest    numeric;
  v_inv_gross  numeric;
  v_inv_other  numeric;
  v_inv_rest   numeric;
  v_amount     numeric;
begin
  if p_outgoing_invoice_id is null or p_transaction_id is null then
    raise exception 'link_outgoing_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.outgoing_invoices where id = p_outgoing_invoice_id) then
    raise exception 'link_outgoing_invoice_transaction: outgoing invoice % not found', p_outgoing_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_outgoing_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = p_outgoing_invoice_id;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_outgoing_invoice_transaction: invoice % has no gross amount to allocate against',
      p_outgoing_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'bestaetigt'
     and outgoing_invoice_id <> p_outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice_id and status = 'bestaetigt'
     and transaction_id <> p_transaction_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_outgoing_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  -- A credit is being linked, so "no receipt expected" was wrong -- release the hide first, same
  -- as the incoming side.
  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
  v_released := found;

  insert into public.outgoing_invoice_transaction_matches
         (outgoing_invoice_id, transaction_id, status, score, match_reasons, amount_matched,
          matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_outgoing_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          v_actor, v_actor, v_now, v_now)
  on conflict (outgoing_invoice_id, transaction_id) do update
     set status         = 'bestaetigt',
         amount_matched = excluded.amount_matched,
         score          = coalesce(excluded.score, public.outgoing_invoice_transaction_matches.score),
         match_reasons  = coalesce(excluded.match_reasons, public.outgoing_invoice_transaction_matches.match_reasons),
         confirmed_by   = excluded.confirmed_by,
         confirmed_at   = excluded.confirmed_at,
         rejected_by    = null,
         rejected_at    = null,
         reject_reason  = null,
         updated_at     = v_now
  returning id into v_match_id;

  if public.outgoing_transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.outgoing_invoice_matched_sum(p_outgoing_invoice_id) >= v_inv_gross - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where outgoing_invoice_id = p_outgoing_invoice_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_outgoing_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released),
          v_now);

  return v_match_id;
end;
$$;


ALTER FUNCTION "public"."link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric) OWNER TO "postgres";

--
-- Name: link_uploaded_invoice_when_extracted(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."link_uploaded_invoice_when_extracted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_amount numeric;
begin
  if new.uploaded_for_transaction_id is null then
    return null;
  end if;
  -- Nothing to allocate against yet. Extraction has not run, or it ran and found no total.
  if new.amount_gross is null or new.amount_gross = 0 then
    return null;
  end if;
  -- `after update of amount_gross` also fires when the column is merely present in the SET list,
  -- so the transition itself has to be checked rather than assumed.
  if old.amount_gross is not distinct from new.amount_gross then
    return null;
  end if;
  -- Already linked. link_invoice_transaction would re-stamp it happily, but re-running it can also
  -- raise once the remainders have moved on, and there is nothing to gain by trying.
  if exists (
    select 1 from public.invoice_transaction_matches
     where document_id = new.id
       and transaction_id = new.uploaded_for_transaction_id
       and status = 'bestaetigt'
  ) then
    return null;
  end if;

  -- WRAPPED, because this runs inside the pipeline's own UPDATE. A raise here would roll that back
  -- and the extraction result would be lost, which is a far worse outcome than an unlinked invoice.
  -- The reason is written where somebody will see it rather than swallowed.
  begin
    perform public.link_invoice_transaction(
      p_invoice_id        => new.id,
      p_transaction_id    => new.uploaded_for_transaction_id,
      p_score             => null,
      p_reasons           => jsonb_build_object('uploaded_for_transaction', true),
      p_amount            => null,
      p_difference_reason => null
    );

    select amount_matched into v_amount
      from public.invoice_transaction_matches
     where document_id = new.id and transaction_id = new.uploaded_for_transaction_id;

    insert into public.document_history (document_id, type, text, actor)
    values (
      new.id, 'aenderung',
      -- Persisted audit text stays German.
      'Automatisch der Banktransaktion zugeordnet, aus der die Rechnung hochgeladen wurde ('
        || to_char(coalesce(v_amount, 0), 'FM999G999G990D00') || ' EUR).',
      'hub'
    );
  exception when others then
    insert into public.document_history (document_id, type, text, actor)
    values (
      new.id, 'aenderung',
      'Automatische Zuordnung zur Banktransaktion nicht möglich: ' || sqlerrm,
      'hub'
    );
  end;

  return null;
end $$;


ALTER FUNCTION "public"."link_uploaded_invoice_when_extracted"() OWNER TO "postgres";

--
-- Name: log_supplier_bank_account_event(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."log_supplier_bank_account_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    akteur text := coalesce(auth.uid()::text, 'pipeline');
begin
    if tg_op = 'INSERT' then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'account_added');
        -- A supplier's first account arrives as the default, so both events are true of it and
        -- both are recorded. The list then reads the same whether the default was set on the way
        -- in or picked later.
        if new.is_default then
            insert into public.supplier_iban_history
                (supplier_id, iban, bic, bank_name, changed_by, event)
            values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
        end if;
    elsif new.is_default and not coalesce(old.is_default, false) then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
    end if;
    return null;
end;
$$;


ALTER FUNCTION "public"."log_supplier_bank_account_event"() OWNER TO "postgres";

--
-- Name: manual_bookings_expanded("uuid", "date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid" DEFAULT NULL::"uuid", "p_von" "date" DEFAULT NULL::"date", "p_bis" "date" DEFAULT NULL::"date") RETURNS TABLE("source_id" "uuid", "company_id" "uuid", "property_id" "uuid", "category_id" "uuid", "period" "date", "amount" numeric, "note" "text", "is_recurring" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  -- Non-recurring: pass through unchanged when its period falls in range.
  select b.id as source_id, b.company_id, b.property_id, b.category_id, b.period, b.amount,
         b.note, b.is_recurring
    from public.manual_bookings b
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and not b.is_recurring
     and b.period between date_trunc('month', p_von)::date and date_trunc('month', p_bis)::date

  union all

  -- Recurring: one row per calendar month between its own start/end and the requested range.
  -- generate_series(start, stop, step) with start > stop returns zero rows (no separate guard
  -- needed for a template outside the requested range, or one whose recurrence_until precedes it).
  select b.id as source_id, b.company_id, b.property_id, b.category_id, m.month::date as period,
         b.amount, b.note, b.is_recurring
    from public.manual_bookings b
    cross join lateral generate_series(
      greatest(b.period, date_trunc('month', p_von)::date),
      least(coalesce(b.recurrence_until, p_bis), date_trunc('month', p_bis)::date),
      interval '1 month'
    ) as m(month)
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and b.is_recurring;
$$;


ALTER FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date") IS 'Per-company (or, with p_company null, every company) manual bookings in [p_von, p_bis], with a recurring row (is_recurring) expanded into one output row per calendar month it covers in that range -- read-time only, nothing materialized. source_id always points at the template row (equal to its own id for a one-off item). See migrations 0033, 0034.';


--
-- Name: mark_datev_batch_bounced("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_reset  int;
begin
  select status into v_status
    from public.datev_handover_batches
   where id = p_batch_id
   for update;

  if v_status is null then
    raise exception 'mark_datev_batch_bounced: no batch %', p_batch_id;
  end if;

  -- Idempotent: a mailbox read that sees the same report twice must not undo an acknowledgement.
  if v_status = 'bounced' then
    return;
  end if;

  update public.datev_handover_batches
     set status        = 'bounced',
         bounced_at    = now(),
         bounce_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_batch_id;

  -- Not handed over after all, so it goes back on the ready list. datev_batch_id stays, so the
  -- failed attempt is still traceable from the receipt.
  update public.documents
     set datev_handed_over_at = null
   where datev_batch_id = p_batch_id
     and datev_handed_over_at is not null;
  get diagnostics v_reset = row_count;

  raise notice 'batch % marked bounced, % invoice(s) returned to the ready list', p_batch_id, v_reset;
end;
$$;


ALTER FUNCTION "public"."mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text") OWNER TO "postgres";

--
-- Name: mark_notifications_seen(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_notifications_seen"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    return;
  end if;

  update public.app_users
     set notifications_seen_at = now(),
         updated_at = now()
   where lower(email) = lower(v_email);
end;
$$;


ALTER FUNCTION "public"."mark_notifications_seen"() OWNER TO "postgres";

--
-- Name: match_opos_whitelist("text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text") RETURNS TABLE("rule_id" "uuid", "category" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.id, r.category
    from public.opos_whitelist_rules r
   where r.is_active
     and r.deleted_at is null
     and public.opos_norm(r.term) <> ''
     and position(
           public.opos_norm(r.term) in
           case r.scope
             when 'reference'    then public.opos_norm(p_reference)
             when 'counterparty' then public.opos_norm(p_counterparty)
             when 'iban'         then public.opos_norm(p_iban)
             when 'booking_text' then public.opos_norm(p_booking_text)
             else public.opos_norm(concat_ws(' ', p_reference, p_counterparty, p_iban, p_booking_text))
           end
         ) > 0
   order by r.created_at, r.term
   limit 1;
$$;


ALTER FUNCTION "public"."match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text") OWNER TO "postgres";

--
-- Name: merge_suppliers("uuid", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."suppliers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_keep    public.suppliers;
  v_merge   public.suppliers;
  v_fk      record;
  v_result  public.suppliers;
begin
  if p_keep_id = p_merge_id then
    raise exception 'merge_suppliers: p_keep_id and p_merge_id must differ';
  end if;

  select * into v_keep from public.suppliers where id = p_keep_id;
  if not found then
    raise exception 'merge_suppliers: keep supplier % not found', p_keep_id;
  end if;
  if v_keep.deleted_at is not null then
    raise exception 'merge_suppliers: keep supplier % is already deleted', p_keep_id;
  end if;

  select * into v_merge from public.suppliers where id = p_merge_id;
  if not found then
    raise exception 'merge_suppliers: merge-away supplier % not found', p_merge_id;
  end if;
  if v_merge.deleted_at is not null then
    raise exception 'merge_suppliers: merge-away supplier % is already deleted', p_merge_id;
  end if;

  -- Reassign every FK column pointing at suppliers(id), across every table in `public`. Discovered
  -- dynamically rather than hardcoded: suppliers/documents predate this repo's tracked migration
  -- history (renamed from German outside any versioned migration), so a hardcoded table list could
  -- silently miss a real FK. This also future-proofs the function against tables added later.
  for v_fk in
    select kcu.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and ccu.table_name = 'suppliers'
       and ccu.column_name = 'id'
       and kcu.table_name not in ('supplier_iban_history', 'supplier_bank_accounts') -- reassigned explicitly below instead
  loop
    execute format(
      'update public.%I set %I = $1 where %I = $2',
      v_fk.table_name, v_fk.column_name, v_fk.column_name
    ) using p_keep_id, p_merge_id;
  end loop;

  -- Preserve the merged-away supplier's bank details if they differ from the survivor's, so
  -- nothing is silently lost even though only one IBAN can be "current" going forward.
  if v_merge.iban is not null and v_merge.iban is distinct from v_keep.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (p_keep_id, v_merge.iban, v_merge.bic, v_merge.bank_name, p_merged_by);
  end if;

  -- Also carry the merged-away supplier's own history rows forward, so "IBAN-Verlauf" on the
  -- survivor stays complete.
  update public.supplier_iban_history set supplier_id = p_keep_id where supplier_id = p_merge_id;

  -- Move every account the merged-away supplier held onto the survivor. Where both already hold
  -- the same IBAN the survivor's own row wins and the duplicate is simply dropped afterwards, never
  -- overwritten, since a name or verification somebody already checked must not be replaced blind.
  insert into public.supplier_bank_accounts (supplier_id, iban, bic, bank_name, source, is_active, created_by)
  select p_keep_id, iban, bic, bank_name, source, is_active, created_by
    from public.supplier_bank_accounts
   where supplier_id = p_merge_id
  on conflict (supplier_id, iban) do nothing;

  delete from public.supplier_bank_accounts where supplier_id = p_merge_id;

  -- Carry the merged-away supplier's aliases across. A move changes entity_code and nothing else,
  -- and entity_aliases_one_owner_uniq is keyed on (entity_type, folded(alias)), so it is indifferent
  -- to the move: the only index a move can violate is entity_aliases_uniq, and the guard below is
  -- exactly its columns. It deliberately does not test is_active -- that index is partial on three
  -- of the four Hubs and plain on Immonetz, and ignoring is_active is the correct guard under both.
  update public.entity_aliases a
     set entity_code = p_keep_id::text,
         updated_at = now()
   where a.entity_type = 'lieferant'
     and a.entity_code = p_merge_id::text
     and a.is_active
     and not exists (
       select 1 from public.entity_aliases k
        where k.entity_type = 'lieferant'
          and k.entity_code = p_keep_id::text
          and k.alias = a.alias);

  -- Whatever could not move is a spelling the survivor already has. Deactivated rather than deleted,
  -- so the record survives (GoBD) and the one-owner slot the dead row would keep is released.
  update public.entity_aliases
     set is_active = false,
         updated_at = now(),
         note = coalesce(note || ' | ', '') || 'deactivated by merge into ' || p_keep_id::text
   where entity_type = 'lieferant'
     and entity_code = p_merge_id::text
     and is_active;

  -- Remember the merged-away name as a known spelling of the survivor.
  --
  -- ON CONFLICT carries no target on purpose. A target has to repeat the predicate of the index it
  -- names, and entity_aliases_uniq is partial here but plain on Immonetz -- and naming either one
  -- leaves a clash on entity_aliases_one_owner_uniq unswallowed, which would roll back the entire
  -- merge to avoid losing a single alias. Untargeted, it takes DO NOTHING on any unique index.
  --
  -- The blank test is separate because ON CONFLICT does not swallow a CHECK violation, and
  -- entity_aliases_alias_not_blank refuses an empty alias.
  if btrim(coalesce(v_merge.name, '')) <> '' then
    insert into public.entity_aliases (entity_type, entity_code, alias, note)
    values ('lieferant', p_keep_id::text, v_merge.name, 'merged from ' || p_merge_id::text)
    on conflict do nothing;
  end if;

  update public.suppliers
     set deleted_at = now(),
         deleted_by = p_merged_by,
         delete_reason = coalesce(p_reason, 'merged into ' || p_keep_id::text)
   where id = p_merge_id;

  select * into v_result from public.suppliers where id = p_keep_id;
  return v_result;
end;
$_$;


ALTER FUNCTION "public"."merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text") OWNER TO "postgres";

--
-- Name: my_profile(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."my_profile"() RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "picture_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'my_profile: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id, u.name, u.email, u.picture_url
      from public.app_users u
     where lower(u.email) = lower(v_email);
end;
$$;


ALTER FUNCTION "public"."my_profile"() OWNER TO "postgres";

--
-- Name: notify_dispatch_now(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."notify_dispatch_now"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_key text;
begin
  -- Same Vault secret the cron job reads (migration 20260827130000). Missing key means the POST
  -- would be rejected at the gateway anyway, so skip quietly: the cron still delivers this event
  -- on its next tick, which is exactly the old behaviour.
  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'service_role_key';
  exception when others then
    v_key := null;
  end;
  if v_key is null or v_key = '' then
    return null;
  end if;

  -- The id goes in the body so the dispatcher delivers THIS event rather than draining the whole
  -- undelivered batch. Two notifications written a second apart would otherwise start two runs
  -- that both read the same batch and both post it.
  --
  -- PORTING NOTE: this ref is THIS project's, exactly like the cron migration. Replace the host
  -- when copying to another Hub.
  perform net.http_post(
    url := 'https://xsgbdtdwhrrhoeximeon.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'event', 'id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end $$;


ALTER FUNCTION "public"."notify_dispatch_now"() OWNER TO "postgres";

--
-- Name: notify_event_from_history(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."notify_event_from_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name           text;
  v_recipient      uuid;
  v_actor_user     uuid;
  v_type           text;
  v_invoice_number text;
begin
  if new.type not in ('rueckfrage', 'ablehnung', 'zuweisung') then
    return null;
  end if;

  v_type := case new.type
              when 'rueckfrage' then 'rueckfrage'
              when 'ablehnung'  then 'abgelehnt'
              else 'zuweisung'
            end;

  -- The name, for the payload and for the legacy fallback below. 'returned_to' for the two return
  -- types, 'assigned_to' for an assignment.
  v_name := nullif(btrim(coalesce(
              new.data ->> 'returned_to',
              new.data ->> 'assigned_to',
              '')), '');

  -- The id the app writes. Guarded rather than cast bare: a malformed value must degrade to the
  -- name fallback, not raise.
  begin
    v_recipient := nullif(btrim(coalesce(new.data ->> 'recipient_user_id', '')), '')::uuid;
  exception when others then
    v_recipient := null;
  end;

  -- Rows written before this migration carry only a name. Matched against app_users directly:
  -- the approvers table this used to go through is frozen and gains no new people.
  if v_recipient is null and v_name is not null then
    select u.id into v_recipient
      from public.app_users u
     where u.name is not null and lower(u.name) = lower(v_name)
     limit 1;
  end if;

  -- An un-assignment ("Zuweisung entfernt") has nobody to tell.
  if v_type = 'zuweisung' and v_recipient is null then
    return null;
  end if;

  -- Do not ring your own bell.
  if v_recipient is not null and new.actor is not null then
    select u.id into v_actor_user
      from public.app_users u
     where lower(u.email) = lower(new.actor)
        or (u.name is not null and lower(u.name) = lower(new.actor))
     limit 1;
    if v_actor_user = v_recipient then
      return null;
    end if;
  end if;

  select i.invoice_number into v_invoice_number
    from public.documents i where i.id = new.document_id;

  insert into public.notification_events (type, payload, recipient_user_id)
  values (
    v_type,
    jsonb_strip_nulls(jsonb_build_object(
      'document_id', new.document_id,
      'invoice_number', v_invoice_number,
      -- Kept under its original key for the two return types so existing consumers and stored
      -- payloads keep their vocabulary; an assignment says assigned_to.
      'returned_to', case when v_type <> 'zuweisung' then v_name end,
      'assigned_to', case when v_type =  'zuweisung' then v_name end,
      'note', nullif(btrim(coalesce(new.text, '')), ''),
      'actor', new.actor
    )),
    v_recipient
  );
  return null;
exception when others then
  -- A notification must never block the workflow write it observes.
  return null;
end;
$$;


ALTER FUNCTION "public"."notify_event_from_history"() OWNER TO "postgres";

--
-- Name: FUNCTION "notify_event_from_history"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."notify_event_from_history"() IS 'Producer: turns invoice_history entries into notification_events. rueckfrage -> rueckfrage, ablehnung -> abgelehnt, zuweisung -> zuweisung. The recipient comes from data->>recipient_user_id written by the app, falling back to a name match against app_users for rows written before 20260901160500 (it used to go through approvers, which is frozen and gains no new people). Self-notification is suppressed, an un-assignment produces nothing, and every failure is swallowed: a notification must never block the write it observes.';


--
-- Name: opos_clear_no_receipt("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."opos_clear_no_receipt"("p_transaction_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
end;
$$;


ALTER FUNCTION "public"."opos_clear_no_receipt"("p_transaction_id" "uuid") OWNER TO "postgres";

--
-- Name: opos_norm("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."opos_norm"("p_text" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."opos_norm"("p_text" "text") OWNER TO "postgres";

--
-- Name: opos_reapply_whitelist("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."opos_reapply_whitelist"("p_rule_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_changed integer := 0;
begin
  -- Same gate as the policies above: this rewrites matching_status across every company.
  if not coalesce(
       public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']), false) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  with kandidaten as (
    select t.id, t.payment_reference, t.counterparty_holder, t.counterparty_iban, t.booking_text,
           t.no_receipt_set_by, t.no_receipt_set_at, t.whitelist_rule_id
      from public.bank_transactions t
     where t.matching_status = 'ignoriert'
       -- A non-null whitelist_rule_id is exactly what separates "a rule hid this" from "a person
       -- did" -- opos_set_no_receipt leaves the column null. A human decision must never be undone
       -- here, which is the same guard apply_opos_whitelist() applies for the same reason.
       -- 'zugeordnet' rows are excluded by the status filter, so a reconciled payment is untouched.
       and t.whitelist_rule_id is not null
       and (p_rule_id is null or t.whitelist_rule_id = p_rule_id)
  ),
  neu as (
    select k.*, m.rule_id as neue_regel, m.category as neue_kategorie
      from kandidaten k
      left join lateral public.match_opos_whitelist(
        k.payment_reference, k.counterparty_holder, k.counterparty_iban, k.booking_text) m on true
  )
  update public.bank_transactions t
     set matching_status   = case when n.neue_regel is null then 'offen' else 'ignoriert' end,
         no_receipt_reason = n.neue_kategorie,
         whitelist_rule_id = n.neue_regel,
         no_receipt_set_by = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_by, 'system') end,
         no_receipt_set_at = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_at, now()) end
    from neu n
   where t.id = n.id
     and n.neue_regel is distinct from n.whitelist_rule_id;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;


ALTER FUNCTION "public"."opos_reapply_whitelist"("p_rule_id" "uuid") OWNER TO "postgres";

--
-- Name: opos_set_category("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.bank_transactions
     set category_id     = p_category_id,
         category_source = case when p_category_id is null then null else 'human' end
   where id = p_transaction_id;
end;
$$;


ALTER FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") IS 'Human sets or clears a bank transaction''s category (offene-posten screen). Same SECURITY DEFINER shape as opos_set_no_receipt -- bank_transactions has SELECT-only RLS for authenticated (migration 0046). p_category_id null clears back to unresolved, ready to be re-suggested by the categorize trigger next time this row''s IBAN/reference changes. See migration 0057.';


--
-- Name: opos_set_no_receipt("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_reason is null or p_reason not in ('salary', 'tax_prepayment', 'private_withdrawal',
        'rebooking', 'loan_installment', 'fee_interest', 'atm_withdrawal', 'other') then
    raise exception 'opos_set_no_receipt: invalid reason %', p_reason;
  end if;

  update public.bank_transactions
     set matching_status   = 'ignoriert',
         no_receipt_reason = p_reason,
         whitelist_rule_id = null,           -- NULL = a human decided this
         no_receipt_set_by = coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub'),
         no_receipt_set_at = now()
   where id = p_transaction_id
     and matching_status <> 'zugeordnet';    -- never un-reconcile a matched payment
end;
$$;


ALTER FUNCTION "public"."opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text") OWNER TO "postgres";

--
-- Name: outgoing_invoice_matched_sum("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice and status = 'bestaetigt';
$$;


ALTER FUNCTION "public"."outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid") OWNER TO "postgres";

--
-- Name: outgoing_transaction_allocated_sum("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."outgoing_transaction_allocated_sum"("p_transaction" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction and status = 'bestaetigt';
$$;


ALTER FUNCTION "public"."outgoing_transaction_allocated_sum"("p_transaction" "uuid") OWNER TO "postgres";

--
-- Name: payment_tolerance(numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."payment_tolerance"("p_gross" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  -- How far BELOW the gross a payment may land and still close the invoice. German Skonto is
  -- typically 2% and occasionally 3%, so 3% covers the real cases. The absolute cap stops the
  -- percentage from silently writing off a large sum: 3% of a 50.000 invoice would be 1.500,
  -- which no one should auto-close. The 0.01 floor keeps plain rounding working on tiny documents.
  select least(greatest(abs(coalesce(p_gross, 0)) * 0.03, 0.01), 150.00);
$$;


ALTER FUNCTION "public"."payment_tolerance"("p_gross" numeric) OWNER TO "postgres";

--
-- Name: FUNCTION "payment_tolerance"("p_gross" numeric); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."payment_tolerance"("p_gross" numeric) IS 'Allowed shortfall for an invoice to still count as paid (Appendix A8 discount tolerance). Mirrored in src/lib/data/format.ts as paymentTolerance() -- keep the two in step.';


--
-- Name: pending_receipt_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."pending_receipt_count"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     and not exists (
       select 1 from public.document_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     );
$$;


ALTER FUNCTION "public"."pending_receipt_count"() OWNER TO "postgres";

--
-- Name: pending_receipt_downloads(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."pending_receipt_downloads"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "external_id" "text", "booking_date" "date", "missing_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id,
         b.external_id,
         b.booking_date,
         count(*)::int as missing_count
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     -- the anti-join: this receipt has no stored file
     and not exists (
       select 1 from public.document_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     )
   group by b.id, b.external_id, b.booking_date
   order by b.booking_date nulls last, b.id
   limit greatest(p_limit, 1);
$$;


ALTER FUNCTION "public"."pending_receipt_downloads"("p_limit" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "pending_receipt_downloads"("p_limit" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."pending_receipt_downloads"("p_limit" integer) IS 'Transactions with Pleo receipts that are not yet stored in invoice_files. Used by the pleo-receipts function; the anti-join cannot be expressed through PostgREST.';


--
-- Name: promote_first_bank_account_to_default(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."promote_first_bank_account_to_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
begin
    -- Being demoted right now, so not a candidate. Without this the single-default trigger's own
    -- cascade is undone row by row and the statement fails on the unique index.
    if tg_op = 'UPDATE' and old.is_default and not new.is_default then
        return new;
    end if;

    -- Already the default, or not a live account: nothing to promote.
    if new.is_default or new.deleted_at is not null or not coalesce(new.is_active, true) then
        return new;
    end if;

    -- A masked IBAN cannot be the default: supplier_bank_accounts_default_is_payable forbids it,
    -- and money cannot be sent to it. Tested against the value rather than the generated
    -- is_payable column, which a BEFORE trigger cannot yet see.
    if new.iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
        return new;
    end if;

    if exists (select 1
                 from public.supplier_bank_accounts
                where supplier_id = new.supplier_id
                  and id <> new.id
                  and is_default
                  and deleted_at is null) then
        return new;
    end if;

    new.is_default := true;
    return new;
end;
$_$;


ALTER FUNCTION "public"."promote_first_bank_account_to_default"() OWNER TO "postgres";

--
-- Name: propagate_account_company(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."propagate_account_company"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.company_id is distinct from old.company_id then
    update public.bank_transactions
       set company_id = new.company_id
     where account_id = new.id
       and company_id is distinct from new.company_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."propagate_account_company"() OWNER TO "postgres";

--
-- Name: purge_record("text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."purge_record"("p_table" "text", "p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_actor    text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_snapshot jsonb;
begin
  if not (public.is_admin() or public.has_permission('page.papierkorb')) then
    raise exception 'purge_record: not permitted' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'purge_record: table and id are required';
  end if;
  if p_table = 'documents' then
    raise exception
      'purge_record: documents cannot be purged -- GoBD requires receipts to be deactivated and '
      'kept, never hard-deleted. Restore it or leave it in the trash.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_table = 'approvers' then
    raise exception
      'purge_record: approvers cannot be purged -- approval_rules and approvers.deputy_name '
      'reference approvers(name), and purging a deputy would silently blank that reference. '
      'Restore it or leave it in the trash.'
      using errcode = 'insufficient_privilege';
  end if;
  if not (p_table = any(public.trash_purge_eligible_tables())) then
    raise exception 'purge_record: table % is not trash-eligible', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and deleted_at is not null', p_table)
    into v_snapshot using p_id;
  if v_snapshot is null then
    raise exception 'purge_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values (p_table, p_id, 'purged', 'Datensatz endgültig gelöscht', v_actor, v_snapshot, now());

  execute format('delete from public.%I where id = $1', p_table) using p_id;
end;
$_$;


ALTER FUNCTION "public"."purge_record"("p_table" "text", "p_id" "uuid") OWNER TO "postgres";

--
-- Name: refuse_deleting_default_bank_account(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."refuse_deleting_default_bank_account"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if old.is_default then
        raise exception 'cannot delete the default bank account of supplier %; set another account '
            'as the default first', old.supplier_id
            using errcode = 'restrict_violation';
    end if;
    return old;
end;
$$;


ALTER FUNCTION "public"."refuse_deleting_default_bank_account"() OWNER TO "postgres";

--
-- Name: request_approval_ping("uuid", "uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text", "p_transaction_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_transaction_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'transaction', p_transaction_id::text,
      '/banktransaktionen/' || p_transaction_id::text
    );
  elsif p_invoice_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'invoice', p_invoice_id::text,
      '/eingangsrechnungen/' || p_invoice_id::text
    );
  else
    perform public.send_notification(p_recipient, p_note, null, null, null);
  end if;
end $$;


ALTER FUNCTION "public"."request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid", "p_note" "text", "p_transaction_id" "uuid") OWNER TO "postgres";

--
-- Name: approval_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."approval_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid",
    "property_id" "uuid",
    "company_id" "uuid",
    "min_amount" numeric DEFAULT 0 NOT NULL,
    "step_1_approver" "text",
    "step_2_approver" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "specificity" integer GENERATED ALWAYS AS ("public"."approval_rule_specificity"("supplier_id", "property_id", "company_id")) STORED,
    "skip_step_2" boolean DEFAULT false NOT NULL,
    "step_1_user_id" "uuid",
    "step_2_user_id" "uuid",
    CONSTRAINT "approval_rules_min_amount_check" CHECK (("min_amount" >= (0)::numeric)),
    CONSTRAINT "approval_rules_scope_not_empty" CHECK ((("supplier_id" IS NOT NULL) OR ("property_id" IS NOT NULL) OR ("company_id" IS NOT NULL)))
);


ALTER TABLE "public"."approval_rules" OWNER TO "postgres";

--
-- Name: COLUMN "approval_rules"."step_1_approver"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approval_rules"."step_1_approver" IS 'HISTORICAL. Superseded by step_1_user_id. Not written any more; existing values are what past approvals were actually routed by.';


--
-- Name: COLUMN "approval_rules"."step_2_approver"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approval_rules"."step_2_approver" IS 'HISTORICAL. Superseded by step_2_user_id.';


--
-- Name: COLUMN "approval_rules"."skip_step_2"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approval_rules"."skip_step_2" IS 'True = this rule is deliberately single-step (no manager sign-off at all); resolve_approval_rule() leaves step_2_approver at NULL even if the invoice''s company has an area with an active approver. False (default) = an empty step_2_approver falls through to area-based auto-resolution instead. Ignored when step_2_approver is explicitly set (that always wins).';


--
-- Name: COLUMN "approval_rules"."step_1_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approval_rules"."step_1_user_id" IS 'Who checks. Replaces step_1_approver, which matched approvers(name) by string.';


--
-- Name: COLUMN "approval_rules"."step_2_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approval_rules"."step_2_user_id" IS 'Who gives the final approval. NULL with skip_step_2 = false means "resolve by area of responsibility" -- resolve_approval_rule() fills it. Replaces step_2_approver.';


--
-- Name: resolve_approval_rule("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") RETURNS "public"."approval_rules"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_rule public.approval_rules;
  v_area text;
  v_area_user uuid;
begin
  select r.* into v_rule
    from public.approval_rules r
    join public.documents i on i.id = p_invoice_id
   where r.is_active
     and r.deleted_at is null
     and r.min_amount <= coalesce(i.amount_gross, 0)
     and (r.supplier_id is null or r.supplier_id = i.supplier_id)
     and (r.property_id is null or r.property_id = i.property_id)
     and (r.company_id  is null or r.company_id  = i.company_id)
   order by r.specificity desc, r.min_amount desc, r.created_at desc
   limit 1;

  if v_rule.id is null then
    return null;
  end if;

  if v_rule.step_2_user_id is null and not v_rule.skip_step_2 then
    select c.area into v_area
      from public.documents i
      join public.companies c on c.id = i.company_id
     where i.id = p_invoice_id;

    select ru.id into v_area_user from public.resolve_area_user(v_area) ru;

    v_rule.step_2_user_id := v_area_user;
  end if;

  return v_rule;
end;
$$;


ALTER FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_approval_rule"("p_invoice_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") IS 'The winning approval chain for one invoice: most specific scope first, then the highest min_amount still at or below the invoice amount. If the winning rule left step_2_user_id empty and did not set skip_step_2, the resolved row''s step_2_user_id falls back to the area-based department head (resolve_area_user) for the invoice''s company -- an explicit step_2_user_id on the rule always wins over this fallback. Returns a genuine NULL (not an all-null-fields row) when no rule matches at all: see 0089 for why the naive plpgsql rewrite got that wrong. The HISTORICAL step_1_approver/step_2_approver columns ride along on the returned row untouched; nothing reads them.';


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text",
    "role_id" "uuid",
    "is_active" boolean DEFAULT false NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notifications_seen_at" timestamp with time zone,
    "slack_user_id" "text",
    "deputy_user_id" "uuid",
    "escalation_days" integer,
    "area" "text",
    "covers_all_areas" boolean DEFAULT false NOT NULL,
    "picture_url" "text",
    CONSTRAINT "app_users_area_shape" CHECK ((("area" IS NULL) OR (NOT "covers_all_areas"))),
    CONSTRAINT "app_users_area_valid" CHECK ((("area" IS NULL) OR ("area" = ANY (ARRAY['hospitality'::"text", 'stay_re'::"text"])))),
    CONSTRAINT "app_users_deputy_not_self" CHECK ((("deputy_user_id" IS NULL) OR ("deputy_user_id" <> "id"))),
    CONSTRAINT "app_users_escalation_days_positive" CHECK ((("escalation_days" IS NULL) OR ("escalation_days" > 0)))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";

--
-- Name: TABLE "app_users"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."app_users" IS 'One row per person who can sign in. Reconstructed in 0000 -- the original table was created outside version control. Matched to the session by lower(email) = lower(auth.jwt()->>''email'').';


--
-- Name: COLUMN "app_users"."notifications_seen_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."notifications_seen_at" IS 'When this user last opened the notification bell. Written only via mark_notifications_seen(). Null = never opened (the bell falls back to a bounded window).';


--
-- Name: COLUMN "app_users"."slack_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."slack_user_id" IS 'Slack member id, resolved once from this user''s email by notify-dispatch and cached here. Member ids are per workspace, so notify-dispatch clears them when the workspace changes.';


--
-- Name: COLUMN "app_users"."deputy_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."deputy_user_id" IS 'Who covers for this person while they are away. Display only: the deputy is NAMED in the overdue warning, they are not granted anything by it. Was approvers.deputy_name, a name-based self-FK.';


--
-- Name: COLUMN "app_users"."escalation_days"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."escalation_days" IS 'After how many days without approval-chain movement a receipt waiting on this person reads as overdue. NULL = no overdue warning for them. Was approvers.escalation_days.';


--
-- Name: COLUMN "app_users"."area"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."area" IS 'Business area this person signs off for (migration 0087; client: "each department head approves their own area"). Feeds resolve_area_user(), which fills a rule''s empty step 2. Mutually exclusive with covers_all_areas. Was approvers.area.';


--
-- Name: COLUMN "app_users"."covers_all_areas"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."covers_all_areas" IS 'Signs off for every area, used as the fallback when no exact area match is active. Was approvers.covers_all_areas.';


--
-- Name: COLUMN "app_users"."picture_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."app_users"."picture_url" IS 'Public url of the profile picture inside the profile-pictures storage bucket. NULL means the app shows the person''s initials instead.';


--
-- Name: resolve_area_user("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_area_user"("p_area" "text") RETURNS SETOF "public"."app_users"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select u.*
    from public.app_users u
   where p_area is not null
     and u.is_active
     and (
       u.area = p_area
       or (
         u.covers_all_areas
         and not exists (
           select 1 from public.app_users x
            where x.is_active and x.area = p_area
         )
       )
     )
   order by (u.area = p_area) desc, u.created_at asc
   limit 1;
$$;


ALTER FUNCTION "public"."resolve_area_user"("p_area" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_area_user"("p_area" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_area_user"("p_area" "text") IS 'The department head for one area: an exact area match if an active one exists, else any active covers_all_areas account (oldest first, deterministic tiebreak). No row if p_area is NULL or nothing matches -- an unassigned company never silently guesses an approver. Replaces resolve_area_approver(), which read the frozen approvers table.';


--
-- Name: resolve_assignment_rule("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select r.id
    from public.assignment_rules r
    join public.documents i on i.id = p_invoice
   where r.is_active
     and r.deleted_at is null
     and r.target = p_target
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
     and (
       r.reference_pattern is null
       or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;


ALTER FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") IS 'The winning rule for one receipt and one target, most specific first. business_line_id dropped as a dimension (0083).';


--
-- Name: resolve_assignment_rule_candidates("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") RETURNS TABLE("rule_id" "uuid", "specificity" integer, "is_winner" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select r.id, r.specificity,
         row_number() over (order by r.specificity desc, r.created_at desc) = 1
    from public.assignment_rules r
    join public.documents i on i.id = p_invoice
   where r.is_active
     and r.deleted_at is null
     and r.target = p_target
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
     and (
       r.reference_pattern is null
       or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   order by r.specificity desc, r.created_at desc;
$$;


ALTER FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") IS 'Every rule matching one receipt + target, most specific first, is_winner flagging the same row resolve_assignment_rule would return alone. business_line_id dropped as a dimension (0083).';


--
-- Name: resolve_default_vat_deductible_pct("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select case p.vat_status
           when 'steuerpflichtig' then 100
           when 'steuerfrei'      then 0
           else null -- 'gemischt', or an unresolved property: genuinely ambiguous, needs a decision
         end
    from public.properties p
   where p.id = p_property;
$$;


ALTER FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_default_vat_deductible_pct"("p_property" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") IS 'Default deductibility from the PROPERTY''s own vat_status (migration 0083; previously keyed on business_line.vat_treatment): steuerpflichtig -> 100%, steuerfrei -> 0%, gemischt or an unresolved property -> NULL (ambiguous, needs a rule or human decision). Only ever applied when nothing more specific already decided otherwise.';


--
-- Name: resolve_transaction_category("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select r.category_id
    from public.bank_transactions t
    join public.suppliers s
      on s.iban is not null
     and s.iban = t.counterparty_iban
     and s.deleted_at is null
    join public.assignment_rules r
      on r.target = 'cost_category'
     and r.is_active
     and r.deleted_at is null
     and r.supplier_id = s.id
     and r.category_id is not null
     and (
       r.reference_pattern is null
       or coalesce(t.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   where t.id = p_transaction
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;


ALTER FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "resolve_transaction_category"("p_transaction" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") IS 'Read-only suggested category for a transaction with no matched receipt, resolved via an exact IBAN match to a supplier and that supplier''s assignment_rules. A recommendation for offene-posten, never a booking. See migration 0030.';


--
-- Name: restore_record("text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_actor  text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_rows   int;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (public.is_admin() or public.has_permission('page.papierkorb')) then
    raise exception 'restore_record: not permitted' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'restore_record: table and id are required';
  end if;
  if not (p_table = any(public.trash_eligible_tables())) then
    raise exception 'restore_record: table % is not trash-eligible', p_table;
  end if;

  -- GET DIAGNOSTICS, not FOUND: unreliable after a dynamic EXECUTE ... USING UPDATE on this
  -- project, per migration 0046's own note.
  execute format(
    'update public.%I set deleted_at = null, deleted_by = null, delete_reason = null '
    'where id = $1 and deleted_at is not null',
    p_table
  ) using p_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'restore_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, at)
  values (
    p_table,
    p_id,
    'restored',
    case
      when v_reason is null then 'Datensatz aus dem Papierkorb wiederhergestellt'
      else 'Datensatz aus dem Papierkorb wiederhergestellt: ' || v_reason
    end,
    v_actor,
    now()
  );
end;
$_$;


ALTER FUNCTION "public"."restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text") OWNER TO "postgres";

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

--
-- Name: run_bank_sync("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."run_bank_sync"("p_mode" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url  text;
  v_key  text;
  v_body jsonb;
  v_req  bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'bank_sync_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_sync_service_key';

  if v_url is null or v_key is null then
    raise exception 'run_bank_sync: Vault secrets bank_sync_url / bank_sync_service_key are missing. '
                    'Load them with: .venv/bin/python pipeline/set_bank_sync_secrets.py --apply';
  end if;

  v_body := case when p_mode is null then '{}'::jsonb else jsonb_build_object('mode', p_mode) end;

  select net.http_post(
           url                  := rtrim(v_url, '/') || '/functions/v1/bank-sync',
           body                 := v_body,
           headers              := jsonb_build_object(
                                     'Content-Type', 'application/json',
                                     'Authorization', 'Bearer ' || v_key,
                                     'apikey', v_key),
           timeout_milliseconds := 60000
         )
    into v_req;

  return v_req;
end;
$$;


ALTER FUNCTION "public"."run_bank_sync"("p_mode" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "run_bank_sync"("p_mode" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."run_bank_sync"("p_mode" "text") IS 'Invoke the bank-sync Edge Function over pg_net, credentials from Vault. Called hourly by the pg_cron job "bank-sync-hourly". p_mode null = full sync (import + match), ''match'' = matching only.';


--
-- Name: send_notification("uuid", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."send_notification"("p_recipient" "uuid", "p_note" "text" DEFAULT NULL::"text", "p_target_kind" "text" DEFAULT NULL::"text", "p_target_id" "text" DEFAULT NULL::"text", "p_target_path" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_sender      uuid := public.current_app_user_id();
  v_sender_name text;
  v_kind        public.notification_target_kinds%rowtype;
  v_exists      boolean;
  v_target      jsonb;
  v_id          bigint;
begin
  if v_sender is null then
    raise exception 'send_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_recipient is null then
    raise exception 'send_notification: recipient is required';
  end if;

  -- YOURSELF IS NOT A RECIPIENT. A notification is how you ask somebody else to look at something;
  -- sent to your own account it is a bell entry from you, to you, about what is already on your
  -- screen. The picker filters you out too, so reaching this means a stale page or a direct call.
  if p_recipient = v_sender then
    raise exception 'send_notification: cannot notify yourself'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.app_users where id = p_recipient and is_active) then
    raise exception 'send_notification: recipient % is not an active user', p_recipient;
  end if;

  if p_target_kind is not null then
    select * into v_kind
      from public.notification_target_kinds
     where kind = p_target_kind and is_active;
    if not found then
      raise exception 'send_notification: unknown target kind %', p_target_kind
        using errcode = 'check_violation';
    end if;

    -- The record has to be there. A notification pointing at something deleted sends the recipient
    -- to a broken page with no way to tell whether they misread it or it is gone.
    --
    -- format %I quotes the identifiers, and both of them come from this table rather than from the
    -- caller, so the dynamic statement cannot be steered from outside.
    if v_kind.source_table is not null and p_target_id is not null then
      execute format(
        'select exists (select 1 from public.%I where %I::text = $1)',
        v_kind.source_table, v_kind.id_column
      ) into v_exists using p_target_id;
      if not v_exists then
        raise exception 'send_notification: no % with id %', p_target_kind, p_target_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A relative path only. An absolute URL here would let a notification carry somebody off to
  -- another host, which is not what "open the record" should be able to mean.
  if p_target_path is not null and p_target_path !~ '^/[^/]' then
    raise exception 'send_notification: target path must be a relative path starting with /'
      using errcode = 'check_violation';
  end if;

  select name into v_sender_name from public.app_users where id = v_sender;

  if p_target_kind is not null or p_target_path is not null then
    v_target := jsonb_strip_nulls(jsonb_build_object(
      'kind', p_target_kind,
      'id',   p_target_id,
      'path', p_target_path
    ));
  end if;

  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values (
    'ping',
    jsonb_strip_nulls(jsonb_build_object(
      'target',    v_target,
      'note',      nullif(btrim(coalesce(p_note, '')), ''),
      'from_name', v_sender_name,
      -- WRITTEN FOR THE OLD READERS TOO. Rows created before today carry document_id/transaction_id
      -- at the top level and several places still read them. Keeping both shapes on new rows means
      -- the front end and the dispatcher can be migrated after this ships rather than in the same
      -- breath, and nothing has to backfill the history.
      'document_id',     case when p_target_kind = 'invoice' then p_target_id end,
      'transaction_id', case when p_target_kind = 'transaction' then p_target_id end
    )),
    p_recipient,
    v_sender
  )
  returning id into v_id;

  return v_id;
end $_$;


ALTER FUNCTION "public"."send_notification"("p_recipient" "uuid", "p_note" "text", "p_target_kind" "text", "p_target_id" "text", "p_target_path" "text") OWNER TO "postgres";

--
-- Name: set_bank_account_connect_route(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_bank_account_connect_route"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.provider_id is null then
    new.connect_route := coalesce(new.connect_route, 'ebics_or_manual');
  else
    select case when p.is_supported then 'banksapi' else 'ebics_or_manual' end
      into new.connect_route
      from bank_providers p where p.id = new.provider_id;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."set_bank_account_connect_route"() OWNER TO "postgres";

--
-- Name: set_bank_transaction_company(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_bank_transaction_company"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  select ba.company_id into new.company_id
    from public.bank_accounts ba
   where ba.id = new.account_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_bank_transaction_company"() OWNER TO "postgres";

--
-- Name: set_channel_secret("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_channel_secret"("p_channel" "text", "p_secret" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name text;
  v_id uuid;
  v_old text;
  v_pattern text;
  v_secret text := nullif(regexp_replace(coalesce(p_secret, ''), '\s', '', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'set_channel_secret: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(config ->> 'secret_pattern', '') into v_pattern
    from public.notification_channels
   where key = p_channel;

  if not found then
    raise exception 'set_channel_secret: unknown channel %', p_channel;
  end if;

  if v_secret is not null and v_pattern <> '' and v_secret !~ v_pattern then
    raise exception 'set_channel_secret: value does not match the format % expects', p_channel;
  end if;

  v_name := public.channel_secret_name(p_channel);
  select id into v_id from vault.secrets where name = v_name limit 1;
  if v_id is not null then
    select decrypted_secret into v_old from vault.decrypted_secrets where id = v_id;
  end if;

  if v_secret is null then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
    end if;
    update public.notification_channels
       set enabled = false, updated_at = now()
     where key = p_channel and enabled;
    return;
  end if;

  if v_id is null then
    begin
      perform vault.create_secret(v_secret, v_name, 'Credential for notification channel ' || p_channel);
    exception when unique_violation then
      select id into v_id from vault.secrets where name = v_name limit 1;
      perform vault.update_secret(v_id, v_secret);
    end;
  elsif v_old is distinct from v_secret then
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;


ALTER FUNCTION "public"."set_channel_secret"("p_channel" "text", "p_secret" "text") OWNER TO "postgres";

--
-- Name: set_datev_route("uuid", "text", "text", boolean, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Must come BEFORE has_company_access(): that function answers true for an anonymous caller.
  if auth.uid() is null then
    raise exception 'set_datev_route: authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_company_access(p_company_id) then
    raise exception 'set_datev_route: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  insert into public.datev_routes (company_id, direction, address, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_direction, p_address, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id, direction) do update set
    address    = excluded.address,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;


ALTER FUNCTION "public"."set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") OWNER TO "postgres";

--
-- Name: set_my_name("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_my_name"("p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if v_email = '' then
    raise exception 'set_my_name: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' then
    raise exception 'set_my_name: the name must not be empty' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 then
    raise exception 'set_my_name: the name is longer than 120 characters' using errcode = 'check_violation';
  end if;

  update public.app_users
     set name = v_name,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_name: no app_users row for %', v_email;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_my_name"("p_name" "text") OWNER TO "postgres";

--
-- Name: set_my_picture_url("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_my_picture_url"("p_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_email = '' then
    raise exception 'set_my_picture_url: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  -- Only a url inside our own bucket. Without this the column would accept any address on the
  -- internet, and every screen showing the picture would fetch it from there.
  if v_url is not null and position('/storage/v1/object/public/profile-pictures/' in v_url) = 0 then
    raise exception 'set_my_picture_url: the url does not point at the profile-pictures bucket'
      using errcode = 'check_violation';
  end if;

  update public.app_users
     set picture_url = v_url,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_picture_url: no app_users row for %', v_email;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_my_picture_url"("p_url" "text") OWNER TO "postgres";

--
-- Name: set_transaction_fully_used("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_alloc numeric;
begin
  if p_transaction_id is null then
    raise exception 'set_transaction_fully_used: transaction is required';
  end if;

  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);
  if coalesce(v_alloc, 0) <= 0 then
    raise exception
      'set_transaction_fully_used: nothing is allocated to this transaction yet'
      using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set fully_used_at   = now(),
         fully_used_by   = v_actor,
         fully_used_note = p_note,
         matching_status = case when matching_status = 'ignoriert' then matching_status
                                else 'zugeordnet' end
   where id = p_transaction_id;
end $$;


ALTER FUNCTION "public"."set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text") OWNER TO "postgres";

--
-- Name: set_transaction_spender(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_transaction_spender"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.spender_email := lower(nullif(trim(coalesce(new.spender_email, '')), ''));
  new.spender_name := nullif(trim(coalesce(new.spender_name, '')), '');
  return new;
end;
$$;


ALTER FUNCTION "public"."set_transaction_spender"() OWNER TO "postgres";

--
-- Name: set_uploaded_outgoing_invoice_status("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_source text;
begin
  if p_status not in ('draft', 'open', 'paidoff', 'voided') then
    raise exception 'set_uploaded_outgoing_invoice_status: invalid status %', p_status
      using errcode = 'check_violation';
  end if;

  select source into v_source from public.outgoing_invoices where id = p_id;
  if v_source is null then
    raise exception 'set_uploaded_outgoing_invoice_status: outgoing invoice % not found', p_id;
  end if;
  if v_source <> 'upload' then
    raise exception
      'set_uploaded_outgoing_invoice_status: invoice % is source=%, not upload -- LexOffice is the status authority for it, not this app',
      p_id, v_source using errcode = 'insufficient_privilege';
  end if;

  update public.outgoing_invoices
     set voucher_status = p_status, status_source = 'manual', updated_at = now()
   where id = p_id;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_id, 'statuswechsel',
          format('Status manuell auf "%s" gesetzt', p_status), p_actor,
          jsonb_build_object('voucher_status', p_status), now());
end;
$$;


ALTER FUNCTION "public"."set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text") OWNER TO "postgres";

--
-- Name: set_user_slack_id("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_value text := btrim(coalesce(p_slack_id, ''));
begin
  if not public.is_admin() then
    raise exception 'set_user_slack_id: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  if p_slack_id is not null and v_value <> '' and v_value !~ '^[UW][A-Z0-9]+$' then
    raise exception 'set_user_slack_id: % is not a Slack member id', v_value;
  end if;

  update public.app_users
     set slack_user_id = case when p_slack_id is null then null else v_value end,
         updated_at = now()
   where id = p_user;

  if not found then
    raise exception 'set_user_slack_id: unknown user %', p_user;
  end if;
end;
$_$;


ALTER FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "set_user_slack_id"("p_user" "uuid", "p_slack_id" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") IS 'Links a Hub user to a Slack member. Empty string means never send them a direct message; null resets to matching by email address.';


--
-- Name: suggest_assignment_rules(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."suggest_assignment_rules"() RETURNS TABLE("supplier_id" "uuid", "category_id" "uuid", "cost_category" "text", "receipt_count" bigint, "total_receipts" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with base as (
    select i.id, i.supplier_id, i.category_id, i.cost_category
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and i.supplier_id is not null
       and (i.category_id is not null or coalesce(i.cost_category, '') <> '')
       and public.resolve_assignment_rule(i.id, 'cost_category') is null
  ),
  grouped as (
    select supplier_id, category_id, cost_category, count(*) as n
      from base
     group by supplier_id, category_id, cost_category
  ),
  ranked as (
    select *, row_number() over (partition by supplier_id order by n desc) as rnk
      from grouped
  ),
  totals as (
    select supplier_id, count(*) as total from base group by supplier_id
  )
  select r.supplier_id, r.category_id, r.cost_category, r.n, t.total
    from ranked r
    join totals t on t.supplier_id = r.supplier_id
   where r.rnk = 1
   order by t.total desc;
$$;


ALTER FUNCTION "public"."suggest_assignment_rules"() OWNER TO "postgres";

--
-- Name: FUNCTION "suggest_assignment_rules"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."suggest_assignment_rules"() IS 'Suppliers not yet covered by an active cost_category rule, grouped by their most common existing category, for the Vorschläge tab. See migration 0030.';


--
-- Name: supplier_bank_accounts_single_default(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."supplier_bank_accounts_single_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if not new.is_default then
        return new;
    end if;

    -- A row ARRIVING from another supplier (merge_suppliers reassigns supplier_id) must not depose
    -- the keeper's own default. Without this the merge just fails on the unique index below.
    if tg_op = 'UPDATE'
       and new.supplier_id is distinct from old.supplier_id
       and exists (select 1 from public.supplier_bank_accounts
                    where supplier_id = new.supplier_id and id <> new.id and is_default) then
        new.is_default := false;
        return new;
    end if;

    -- Setting a default clears the previous one. No recursion: the inner update writes
    -- is_default = false, and this function returns early for those rows.
    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.supplier_id
       and id <> new.id
       and is_default;

    return new;
end;
$$;


ALTER FUNCTION "public"."supplier_bank_accounts_single_default"() OWNER TO "postgres";

--
-- Name: supplier_default_account_sync(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."supplier_default_account_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if not new.is_default then
        return null;
    end if;

    -- The IBAN is written ONLY when it actually differs compacted. Two reasons, and the second is
    -- the one that bites: many suppliers store their IBAN with spaces, so assigning the compacted
    -- form unconditionally would rewrite `suppliers.iban` on an edit that only touched the BIC.
    -- That is not a change of account, but supplier_iban_history would record it as one and the
    -- supplier list would show a bank-details warning for it.
    update public.suppliers s
       set iban = case
                    when upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
                         is distinct from new.iban
                    then new.iban
                    else s.iban
                  end,
           bic        = coalesce(new.bic, s.bic),
           bank_name  = coalesce(new.bank_name, s.bank_name),
           updated_at = now()
     where s.id = new.supplier_id
       and (
             upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
               is distinct from new.iban
             or (new.bic is not null and s.bic is distinct from new.bic)
             or (new.bank_name is not null and s.bank_name is distinct from new.bank_name)
           );

    return null;
end;
$$;


ALTER FUNCTION "public"."supplier_default_account_sync"() OWNER TO "postgres";

--
-- Name: supplier_default_iban_sync(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."supplier_default_iban_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
    compact text := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
begin
    if compact = '' then
        update public.supplier_bank_accounts
           set is_default = false
         where supplier_id = new.id and is_default;
        return null;
    end if;

    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.id and is_default and iban <> compact;

    update public.supplier_bank_accounts
       set is_default = true, is_active = true
     where supplier_id = new.id and iban = compact and not is_default;

    return null;
end;
$$;


ALTER FUNCTION "public"."supplier_default_iban_sync"() OWNER TO "postgres";

--
-- Name: sync_invoice_paid_from_matches(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_invoice_paid_from_matches"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invoice   uuid := coalesce(new.document_id, old.document_id);
  v_gross     numeric;
  v_matched   numeric;
  v_paydate   date;
  v_paid_at   timestamptz;
  v_source    text;
  v_shortfall numeric;
  -- The person, when a person did it. Empty for the pipeline and for cron.
  v_actor     text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
begin
  select abs(amount_gross), paid_at, paid_source
    into v_gross, v_paid_at, v_source
    from public.documents where id = v_invoice;
  if not found then
    return null;
  end if;

  select coalesce(sum(m.amount_matched), 0), max(t.booking_date)
    into v_matched, v_paydate
    from public.invoice_transaction_matches m
    join public.bank_transactions t on t.id = m.transaction_id
   where m.document_id = v_invoice and m.status = 'bestaetigt';

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    if v_paid_at is null then
      update public.documents
         set paid_at     = coalesce(v_paydate::timestamptz, now()),
             paid_source = 'bank_match',
             updated_at  = now()
       where id = v_invoice;

      v_shortfall := v_gross - v_matched;
      insert into public.document_history (document_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        -- Unchanged wording. Persisted audit text stays German.
        case when v_shortfall > 0.01
          then format('Als bezahlt markiert (bestätigter Bankabgleich, Skonto %s EUR)',
                      to_char(v_shortfall, 'FM999G999G990D00'))
          else 'Als bezahlt markiert (bestätigter Bankabgleich)'
        end,
        v_actor,
        jsonb_strip_nulls(jsonb_build_object(
          'event', 'paid_from_match',
          'skonto', case when v_shortfall > 0.01 then v_shortfall end
        ))
      );
    end if;
  else
    if v_paid_at is not null and v_source = 'bank_match' then
      update public.documents
         set paid_at     = null,
             paid_source = null,
             updated_at  = now()
       where id = v_invoice;

      insert into public.document_history (document_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        format('Zahlung zurückgenommen: Bankabgleich deckt nur noch %s von %s EUR',
               to_char(v_matched, 'FM999G999G990D00'),
               to_char(v_gross, 'FM999G999G990D00')),
        v_actor,
        jsonb_build_object(
          'event', 'payment_withdrawn',
          'matched', v_matched,
          'gross', v_gross
        )
      );
    end if;
  end if;

  return null;
end $$;


ALTER FUNCTION "public"."sync_invoice_paid_from_matches"() OWNER TO "postgres";

--
-- Name: sync_transaction_matching_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_transaction_matching_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tx    uuid := coalesce(new.transaction_id, old.transaction_id);
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = v_tx;
  if v_total is null then
    return null;
  end if;

  v_alloc := public.transaction_allocated_sum(v_tx) + public.outgoing_transaction_allocated_sum(v_tx);

  update public.bank_transactions t
     set matching_status = case
           -- A hand-closed transaction stays closed even with a remainder. It still has to carry
           -- at least one confirmed allocation: "fully used" describes what happened to a payment
           -- that paid something, not a way to file an untouched one away.
           when t.fully_used_at is not null and v_alloc > 0 then 'zugeordnet'
           when v_alloc > 0 and v_alloc >= v_total - 0.01 then 'zugeordnet'
           else 'offen'
         end
   where t.id = v_tx
     and t.matching_status <> 'ignoriert';

  return null;
end;
$$;


ALTER FUNCTION "public"."sync_transaction_matching_status"() OWNER TO "postgres";

--
-- Name: sync_uploaded_outgoing_invoice_status_from_matches(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invoice_id    uuid := coalesce(new.outgoing_invoice_id, old.outgoing_invoice_id);
  v_source        text;
  v_gross         numeric;
  v_status        text;
  v_status_source text;
  v_matched       numeric;
begin
  select source, amount_gross, voucher_status, status_source
    into v_source, v_gross, v_status, v_status_source
    from public.outgoing_invoices where id = v_invoice_id;
  if not found or v_source <> 'upload' then
    return null;
  end if;

  select public.outgoing_invoice_matched_sum(v_invoice_id) into v_matched;

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    -- A manual override (status_source='manual') is never touched in EITHER direction -- e.g.
    -- someone deliberately holding an invoice 'open' despite a covering match must not have it
    -- silently flipped back to 'paidoff' the next time this trigger fires.
    if v_status_source is distinct from 'manual' and v_status not in ('paidoff', 'voided') then
      update public.outgoing_invoices
         set voucher_status = 'paidoff', status_source = 'auto', updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Als bezahlt markiert (bestätigter Bankabgleich)', 'system',
              jsonb_build_object('voucher_status', 'paidoff', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  else
    -- No longer covered (link removed or amount reduced). Only a status THIS trigger set is
    -- withdrawn -- a manual override is never touched.
    if v_status = 'paidoff' and v_status_source = 'auto' then
      update public.outgoing_invoices
         set voucher_status = 'open', status_source = null, updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Zahlung zurückgenommen: Bankabgleich deckt die Rechnung nicht mehr vollständig',
              'system',
              jsonb_build_object('voucher_status', 'open', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"() OWNER TO "postgres";

--
-- Name: tell_the_pipeline(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."tell_the_pipeline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    perform pg_notify('pipeline_run_requested', new.channel);
    return null;
end
$$;


ALTER FUNCTION "public"."tell_the_pipeline"() OWNER TO "postgres";

--
-- Name: touch_tour_progress(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_tour_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at := now();
    new.first_seen_at := old.first_seen_at;
    return new;
end;
$$;


ALTER FUNCTION "public"."touch_tour_progress"() OWNER TO "postgres";

--
-- Name: transaction_allocated_sum("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."transaction_allocated_sum"("p_transaction" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.invoice_transaction_matches
   where transaction_id = p_transaction and status = 'bestaetigt';
$$;


ALTER FUNCTION "public"."transaction_allocated_sum"("p_transaction" "uuid") OWNER TO "postgres";

--
-- Name: trash_eligible_tables(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trash_eligible_tables"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select array[
    'documents', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'categories', 'properties', 'companies', 'business_line', 'approvers',
    'supplier_bank_accounts'
  ];
$$;


ALTER FUNCTION "public"."trash_eligible_tables"() OWNER TO "postgres";

--
-- Name: trash_purge_eligible_tables(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trash_purge_eligible_tables"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select array(
    select t from unnest(public.trash_eligible_tables()) as t
    where t not in ('documents', 'approvers')
  );
$$;


ALTER FUNCTION "public"."trash_purge_eligible_tables"() OWNER TO "postgres";

--
-- Name: trash_require_delete_reason(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trash_require_delete_reason"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if btrim(coalesce(new.delete_reason, '')) = '' then
    raise exception
      'Ein Löschgrund ist erforderlich (%.%): delete_reason darf beim Löschen nicht leer sein.',
      tg_table_schema, tg_table_name
      using errcode = 'check_violation',
            hint = 'Bitte einen Grund angeben, warum dieser Datensatz gelöscht wird.';
  end if;
  -- Store the trimmed value, so trailing whitespace cannot make a reason look present when it is
  -- one space long.
  new.delete_reason := btrim(new.delete_reason);
  return new;
end;
$$;


ALTER FUNCTION "public"."trash_require_delete_reason"() OWNER TO "postgres";

--
-- Name: FUNCTION "trash_require_delete_reason"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."trash_require_delete_reason"() IS 'BEFORE UPDATE guard for every trash-eligible table: a soft delete must say why. Fires only when a row is being deleted or its reason changed, never on a restore (docs/audit/papierkorb/trash/ISSUES.md #2).';


--
-- Name: trg_fn_bank_transactions_categorize(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_fn_bank_transactions_categorize"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_category uuid;
begin
  v_category := public.resolve_transaction_category(new.id);
  if v_category is not null then
    update public.bank_transactions
       set category_id = v_category, category_source = 'rule'
     where id = new.id
       and coalesce(category_source, 'rule') <> 'human';
  end if;
  return null; -- ignored on an AFTER trigger
end $$;


ALTER FUNCTION "public"."trg_fn_bank_transactions_categorize"() OWNER TO "postgres";

--
-- Name: FUNCTION "trg_fn_bank_transactions_categorize"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."trg_fn_bank_transactions_categorize"() IS 'Writes resolve_transaction_category()''s result onto the row as category_source=''rule'' -- never touches a human-sourced value. AFTER, not BEFORE: resolve_transaction_category re-reads the committed row by id. See migration 0057.';


--
-- Name: trg_fn_invoices_apply_rules_on_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.apply_assignment_rules(new.id, 'pipeline-intake');
  return new;
end $$;


ALTER FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"() OWNER TO "postgres";

--
-- Name: trg_fn_invoices_vat_deductible_default(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trg_fn_invoices_vat_deductible_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(new.vat_deductibility_source, 'ai') = 'ai' then
    new.vat_deductible_pct := public.resolve_default_vat_deductible_pct(new.property_id);
    new.vat_deductibility_source := case when new.vat_deductible_pct is null then null else 'ai' end;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."trg_fn_invoices_vat_deductible_default"() OWNER TO "postgres";

--
-- Name: update_datev_route_status("uuid", boolean, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'update_datev_route_status: authentication required' using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company from public.datev_routes where id = p_id;
  if v_company is null then
    raise exception 'update_datev_route_status: route % not found', p_id;
  end if;
  if not public.has_company_access(v_company) then
    raise exception 'update_datev_route_status: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  update public.datev_routes
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$$;


ALTER FUNCTION "public"."update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") OWNER TO "postgres";

--
-- Name: upsert_external_transactions("jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("inserted_count" integer, "updated_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_external_transactions: p_rows must be a JSON array';
  end if;

  with incoming as (
    select
      r->>'source'              as source,
      r->>'external_id'         as external_id,
      (r->>'amount')::numeric   as amount,
      r->>'currency'            as currency,
      nullif(r->>'booking_date','')::date as booking_date,
      nullif(r->>'value_date','')::date   as value_date,
      r->>'booking_text'        as booking_text,
      r->>'payment_reference'   as payment_reference,
      r->>'counterparty_holder' as counterparty_holder,
      r->>'counterparty_iban'   as counterparty_iban,
      r->>'counterparty_bic'    as counterparty_bic,
      nullif(trim(coalesce(r->>'spender_name','')),'')  as spender_name,
      nullif(trim(coalesce(r->>'spender_email','')),'') as spender_email,
      nullif(r->>'pleo_tag_id','')::uuid     as pleo_tag_id,
      nullif(r->>'pleo_account_id','')::uuid as pleo_account_id,
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data,
      p_account_id as account_id
    from jsonb_array_elements(p_rows) as r
  ),
  deduped as (
    select distinct on (source, external_id) *
      from incoming
     where external_id is not null and source is not null
     order by source, external_id
  ),
  upserted as (
    insert into public.bank_transactions as bt (
      source, external_id, amount, currency, booking_date, value_date,
      booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
      spender_name, spender_email, pleo_tag_id, pleo_account_id,
      is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
           spender_name, spender_email, pleo_tag_id, pleo_account_id,
           is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
      from deduped
    on conflict (source, external_id) do update set
      amount              = excluded.amount,
      currency            = excluded.currency,
      booking_date        = excluded.booking_date,
      value_date          = excluded.value_date,
      booking_text        = excluded.booking_text,
      payment_reference   = excluded.payment_reference,
      counterparty_holder = excluded.counterparty_holder,
      counterparty_iban   = excluded.counterparty_iban,
      counterparty_bic    = excluded.counterparty_bic,
      spender_name        = coalesce(excluded.spender_name, bt.spender_name),
      spender_email       = coalesce(excluded.spender_email, bt.spender_email),
      -- coalesce, like spender: a manual import carries neither, and plain assignment would wipe
      -- what the Pleo sync had already established for that same transaction.
      pleo_tag_id         = coalesce(excluded.pleo_tag_id, bt.pleo_tag_id),
      pleo_account_id     = coalesce(excluded.pleo_account_id, bt.pleo_account_id),
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      account_id          = coalesce(excluded.account_id, bt.account_id),
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;


ALTER FUNCTION "public"."upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid") IS 'Merge-safe upsert for provider syncs (pleo, manual, banksapi). Merges raw_data instead of replacing it and never writes user-owned columns. p_account_id applies to the whole batch (manual imports only; pleo omits it) and is coalesced on conflict so it is never cleared by a re-sync. Use this rather than a PostgREST upsert.';


--
-- Name: vat_reserve("uuid", "date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date" DEFAULT NULL::"date", "p_bis" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "von" "date", "bis" "date", "input_vat_total" numeric, "input_vat_deductible" numeric, "input_vat_nondeductible" numeric, "input_vat_unresolved_count" bigint, "input_vat_unresolved_amount" numeric, "output_vat" numeric, "reserve" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with input as (
    select
      round(coalesce(sum(i.vat_amount), 0), 2)                                            as vat_total,
      round(coalesce(sum(i.vat_deductible_amount), 0), 2)                                 as vat_deductible,
      round(coalesce(sum(i.vat_nondeductible_amount), 0), 2)                              as vat_nondeductible,
      count(*) filter (where i.vat_amount is not null and i.vat_deductible_pct is null)    as unresolved_count,
      round(coalesce(sum(i.vat_amount) filter (where i.vat_deductible_pct is null), 0), 2) as unresolved_amount
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and i.company_id = p_company
       and (p_von is null or i.document_date >= p_von)
       and (p_bis is null or i.document_date <= p_bis)
  ),
  output as (
    select
      round(coalesce(sum(o.amount_gross - o.amount_net), 0), 2) as vat_total
      from public.outgoing_invoices o
     where o.deleted_at is null
       and o.company_id = p_company
       and o.voucher_status not in ('draft', 'voided')
       and o.amount_gross is not null
       and o.amount_net is not null
       and (p_von is null or o.voucher_date >= p_von)
       and (p_bis is null or o.voucher_date <= p_bis)
  )
  select
    p_company,
    p_von,
    p_bis,
    input.vat_total,
    input.vat_deductible,
    input.vat_nondeductible,
    input.unresolved_count,
    input.unresolved_amount,
    output.vat_total,
    output.vat_total - input.vat_deductible
    from input, output;
$$;


ALTER FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date") OWNER TO "postgres";

--
-- Name: FUNCTION "vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date") IS 'Per-company VAT reserve (Briefing Screen 5): input-VAT summary (total, deductible, non-deductible, unresolved) plus output_vat from outgoing_invoices (amount_gross - amount_net, excluding draft/voided vouchers). reserve = output_vat - deductible input VAT, the amount owed to the tax office. A recommendation only, never a booking.';


--
-- Name: ai_search_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_search_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "search_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question" "text" NOT NULL,
    "language" "text",
    "intent" "text",
    "stage" "text" NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "ai_search_usage_stage_check" CHECK (("stage" = ANY (ARRAY['classify'::"text", 'sql_generate'::"text"])))
);


ALTER TABLE "public"."ai_search_usage" OWNER TO "postgres";

--
-- Name: approvers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."approvers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "deputy_name" "text",
    "escalation_days" integer,
    "payment_handler" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area" "text",
    "covers_all_areas" boolean DEFAULT false NOT NULL,
    "app_user_id" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    CONSTRAINT "approvers_all_areas_requires_manager" CHECK (((NOT "covers_all_areas") OR ("role" = 'manager'::"text"))),
    CONSTRAINT "approvers_area_check" CHECK (("area" = ANY (ARRAY['hospitality'::"text", 'stay_re'::"text"]))),
    CONSTRAINT "approvers_area_requires_manager" CHECK ((("area" IS NULL) OR ("role" = 'manager'::"text"))),
    CONSTRAINT "approvers_area_shape" CHECK ((("area" IS NULL) OR (NOT "covers_all_areas"))),
    CONSTRAINT "approvers_escalation_days_check" CHECK ((("escalation_days" IS NULL) OR ("escalation_days" > 0))),
    CONSTRAINT "approvers_payment_handler_check" CHECK ((("payment_handler" IS NULL) OR ("payment_handler" = ANY (ARRAY['boss'::"text", 'account_holder'::"text"])))),
    CONSTRAINT "approvers_role_check" CHECK (("role" = ANY (ARRAY['assistant'::"text", 'manager'::"text"])))
);


ALTER TABLE "public"."approvers" OWNER TO "postgres";

--
-- Name: TABLE "approvers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."approvers" IS 'HISTORICAL as of this migration. The approval chain now names app_users by id (app_users.deputy_user_id/escalation_days/area/covers_all_areas and approval_rules.step_1_user_id/step_2_user_id). Nothing in the app reads this table any more. Kept, with its rows, its trash entries and its FKs, as the record of who was in a chain when.';


--
-- Name: COLUMN "approvers"."area"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approvers"."area" IS 'The one area this approver signs off for. NULL if not area-scoped (covers_all_areas, or a step_1-only accounting approver like Petra/Vanessa with no department-head role at all).';


--
-- Name: COLUMN "approvers"."covers_all_areas"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approvers"."covers_all_areas" IS 'True for a department head whose area is "All areas" (client: Saskia Christ, Andreas Christ) -- resolve_area_approver() falls back to any covers_all_areas approver when no exact-area match exists. Mutually exclusive with area (see approvers_area_shape below).';


--
-- Name: COLUMN "approvers"."app_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."approvers"."app_user_id" IS 'Optional link to the real app_users identity this approver slot represents (added after the fact -- approvers predates this FK, see migration 0048). Set going forward by the create flow in freigabe-regeln (src/routes/freigabe-regeln/index.tsx), which already only ever offers a real employee to pick from. NULL is valid: approvers are not required to have a Supabase Auth login. Not yet used by any resolution function -- name/role remain canonical for routing.';


--
-- Name: assignment_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."assignment_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target" "text" NOT NULL,
    "cost_category" "text",
    "vat_rate" numeric,
    "vat_treatment" "text",
    "supplier_id" "uuid",
    "property_id" "uuid",
    "company_id" "uuid",
    "reference_pattern" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "category_id" "uuid",
    "vat_deductible_pct" numeric,
    "vat_special_case" "text",
    "specificity" integer GENERATED ALWAYS AS ("public"."assignment_rule_specificity"("reference_pattern", "supplier_id", "property_id", "company_id")) STORED,
    CONSTRAINT "assignment_rules_deductibility_target_check" CHECK (((("vat_deductible_pct" IS NULL) AND ("vat_special_case" IS NULL)) OR ("target" = 'vat_rate'::"text"))),
    CONSTRAINT "assignment_rules_scope_not_empty" CHECK ((("supplier_id" IS NOT NULL) OR ("property_id" IS NOT NULL) OR ("company_id" IS NOT NULL) OR ("reference_pattern" IS NOT NULL))),
    CONSTRAINT "assignment_rules_target_check" CHECK (("target" = ANY (ARRAY['cost_category'::"text", 'vat_rate'::"text"]))),
    CONSTRAINT "assignment_rules_value_present" CHECK (((("target" = 'cost_category'::"text") AND ("cost_category" IS NOT NULL)) OR (("target" = 'vat_rate'::"text") AND ("vat_rate" IS NOT NULL)))),
    CONSTRAINT "assignment_rules_vat_deductible_pct_check" CHECK ((("vat_deductible_pct" IS NULL) OR (("vat_deductible_pct" >= (0)::numeric) AND ("vat_deductible_pct" <= (100)::numeric)))),
    CONSTRAINT "assignment_rules_vat_special_case_check" CHECK ((("vat_special_case" IS NULL) OR ("vat_special_case" = ANY (ARRAY['hospitality'::"text", 'partial'::"text", 'down_payment'::"text"])))),
    CONSTRAINT "assignment_rules_vat_treatment_check" CHECK ((("vat_treatment" IS NULL) OR ("vat_treatment" = ANY (ARRAY['steuerpflichtig'::"text", 'steuerfrei'::"text", 'reverse_charge'::"text", 'kleinunternehmer'::"text"]))))
);


ALTER TABLE "public"."assignment_rules" OWNER TO "postgres";

--
-- Name: COLUMN "assignment_rules"."category_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."assignment_rules"."category_id" IS 'Structured taxonomy reference. A rule created before migration 0030 (or inserted directly by the pipeline''s own test fixtures) may have this null and only a free-text cost_category — resolution falls back to comparing that text exactly as it did before this migration.';


--
-- Name: COLUMN "assignment_rules"."vat_deductible_pct"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."assignment_rules"."vat_deductible_pct" IS 'Percentage of input VAT this rule''s scope can reclaim (100 = fully deductible, cost is net; 0 = not reclaimable, cost is gross). Additive to vat_rate on the SAME rule row -- one rule still describes one VAT decision. Only meaningful when target = ''vat_rate''. See migration 0031.';


--
-- Name: COLUMN "assignment_rules"."vat_special_case"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."assignment_rules"."vat_special_case" IS 'Flags a tax special case that changes the deductible amount (hospitality, partial deductibility, a down payment) -- see the migration header for the hospitality income-tax-vs-VAT caveat. Only meaningful when target = ''vat_rate''.';


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid",
    "banksapi_product_id" "text",
    "account_name" "text",
    "iban" "text",
    "bic" "text",
    "holder" "text",
    "product_type" "text",
    "currency" "text" DEFAULT 'EUR'::"text",
    "balance" numeric,
    "balance_date" "date",
    "is_own_account" boolean DEFAULT true NOT NULL,
    "is_sandbox" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid",
    "bank_name" "text",
    "banksapi_provider_id" "text",
    "provider_id" "uuid",
    "connect_route" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "excluded_at" timestamp with time zone,
    "excluded_by" "text",
    "exclusion_reason" "text",
    "name_is_custom" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";

--
-- Name: COLUMN "bank_accounts"."is_active"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_accounts"."is_active" IS 'false = do not import new transactions for this account. Existing rows are kept. Set by hand in the Hub; bank-sync must never write it. Distinct from excluded_at, which purges the movements.';


--
-- Name: COLUMN "bank_accounts"."excluded_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_accounts"."excluded_at" IS 'Set = never import this product again. bank-sync skips it entirely (no update, no transactions). Stronger than deleted_at, which the sync may revive.';


--
-- Name: COLUMN "bank_accounts"."name_is_custom"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_accounts"."name_is_custom" IS 'Set = account_name was chosen by a human; the BANKSapi feed must not overwrite it.';


--
-- Name: bank_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bank_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "banksapi_access_id" "text",
    "banksapi_user" "text",
    "provider_id" "text",
    "provider_name" "text",
    "bank_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_sandbox" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_status" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bank_provider_id" "uuid",
    "credential_ref" "text",
    "disconnected_at" timestamp with time zone,
    "connected_by" "uuid",
    "connected_by_email" "text",
    CONSTRAINT "bank_connections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'error'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."bank_connections" OWNER TO "postgres";

--
-- Name: COLUMN "bank_connections"."disconnected_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_connections"."disconnected_at" IS 'Set = the BANKSapi access was deleted from the Hub. The connection, its accounts and their transactions are kept as history; the accounts are switched to is_active = false so nothing new is imported. Distinct from status = ''expired'', which is a consent the BANK withdrew.';


--
-- Name: COLUMN "bank_connections"."connected_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_connections"."connected_by" IS 'The Hub account that started this bank connection, and so whose consent it is to renew. Written by bank-connect. Null on connections made before 15.09.2026.';


--
-- Name: COLUMN "bank_connections"."connected_by_email"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_connections"."connected_by_email" IS 'Email of connected_by at the time, kept so the answer survives that account being removed.';


--
-- Name: bank_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bank_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bank_name" "text" NOT NULL,
    "banksapi_provider_id" "uuid",
    "provider_name" "text",
    "ebics_available" boolean DEFAULT false NOT NULL,
    "is_supported" boolean GENERATED ALWAYS AS (("banksapi_provider_id" IS NOT NULL)) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bank_providers" OWNER TO "postgres";

--
-- Name: bank_sync_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bank_sync_logs" (
    "id" bigint NOT NULL,
    "run_id" "uuid",
    "connection_id" "uuid",
    "event" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text",
    "counts" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_sync_logs_level_check" CHECK (("level" = ANY (ARRAY['info'::"text", 'warn'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."bank_sync_logs" OWNER TO "postgres";

--
-- Name: bank_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_sync_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."bank_sync_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "connection_id" "uuid",
    "banksapi_hash" "text",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text",
    "booking_date" "date",
    "value_date" "date",
    "payment_reference" "text",
    "booking_text" "text",
    "counterparty_holder" "text",
    "counterparty_iban" "text",
    "counterparty_bic" "text",
    "direction" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("amount" < (0)::numeric) THEN 'ausgehend'::"text"
    ELSE 'eingehend'::"text"
END) STORED,
    "matching_status" "text" DEFAULT 'offen'::"text" NOT NULL,
    "is_sandbox" boolean DEFAULT true NOT NULL,
    "raw_data" "jsonb",
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"german"'::"regconfig", ((((COALESCE("payment_reference", ''::"text") || ' '::"text") || COALESCE("booking_text", ''::"text")) || ' '::"text") || COALESCE("counterparty_holder", ''::"text")))) STORED,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid",
    "no_receipt_reason" "text",
    "whitelist_rule_id" "uuid",
    "no_receipt_set_by" "text",
    "no_receipt_set_at" timestamp with time zone,
    "transaction_type" "text",
    "transaction_type_source" "text" DEFAULT 'auto'::"text" NOT NULL,
    "category_id" "uuid",
    "category_source" "text",
    "source" "text" DEFAULT 'banksapi'::"text" NOT NULL,
    "external_id" "text",
    "spender_name" "text",
    "spender_email" "text",
    "fully_used_at" timestamp with time zone,
    "fully_used_by" "text",
    "fully_used_note" "text",
    "pleo_tag_id" "uuid",
    "pleo_account_id" "uuid",
    CONSTRAINT "bank_transactions_category_source_check" CHECK ((("category_source" IS NULL) OR ("category_source" = ANY (ARRAY['rule'::"text", 'human'::"text"])))),
    CONSTRAINT "bank_transactions_matching_status_check" CHECK (("matching_status" = ANY (ARRAY['offen'::"text", 'zugeordnet'::"text", 'ignoriert'::"text"]))),
    CONSTRAINT "bank_transactions_source_check" CHECK (("source" = ANY (ARRAY['banksapi'::"text", 'pleo'::"text", 'manual'::"text"]))),
    CONSTRAINT "bank_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['ueberweisung'::"text", 'lastschrift'::"text", 'kreditkarte'::"text", 'kartenzahlung'::"text", 'gutschrift'::"text", 'unbekannt'::"text"]))),
    CONSTRAINT "bank_transactions_transaction_type_source_check" CHECK (("transaction_type_source" = ANY (ARRAY['auto'::"text", 'manuell'::"text"])))
);


ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";

--
-- Name: COLUMN "bank_transactions"."company_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."company_id" IS 'Owning company, inherited from account_id -> bank_accounts.company_id (kept in sync by trigger). The second route to a receipt''s company when the document does not name one (Screen 7 / DFD).';


--
-- Name: COLUMN "bank_transactions"."no_receipt_reason"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."no_receipt_reason" IS 'Why this transaction will never have a receipt (opos_whitelist_rules.category). Set together with matching_status=''ignoriert''.';


--
-- Name: COLUMN "bank_transactions"."whitelist_rule_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."whitelist_rule_id" IS 'The whitelist rule that hid this transaction. NULL while hidden means a HUMAN decided it — rules must never overwrite or release that.';


--
-- Name: COLUMN "bank_transactions"."transaction_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."transaction_type" IS 'Normalized movement type driving reconciliation. Derived by the classifier in supabase/functions/_shared/transaction-type.ts, not by the bank. NULL = not yet classified; bank-sync fills those on its next run.';


--
-- Name: COLUMN "bank_transactions"."transaction_type_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."transaction_type_source" IS 'auto = set by the classifier, manuell = corrected by a human. A human correction is never overwritten: the backfill in bank-sync only touches rows where transaction_type is NULL.';


--
-- Name: COLUMN "bank_transactions"."category_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."category_id" IS 'Cost category for a transaction with no matched receipt of its own (the receiptless/recurring-debit case, Briefing Screen 4 "learning system"). A matched transaction is still categorized through its linked invoice, not this column. See migration 0057.';


--
-- Name: COLUMN "bank_transactions"."category_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."category_source" IS 'rule = written automatically by resolve_transaction_category() via the categorize trigger; human = set or overridden via opos_set_category(). Same ai|rule|human-style provenance and "human is never auto-overwritten" rule as cost_category_source/vat_source elsewhere (no ai value here — nothing extracts a bank transaction''s category from AI). See migration 0057.';


--
-- Name: COLUMN "bank_transactions"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."source" IS 'Where the transaction came from: banksapi (bank accounts + company cards), pleo (employee cards), manual (XML/CSV/Excel upload). bank_transactions is the single source of truth for all three -- matching, OPOS and reporting never branch on provider.';


--
-- Name: COLUMN "bank_transactions"."external_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."external_id" IS 'The provider''s own transaction id. Dedup key for pleo/manual rows (banksapi uses banksapi_hash).';


--
-- Name: COLUMN "bank_transactions"."spender_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."spender_name" IS 'Person who made the payment (Pleo employee). Null when the source does not report one.';


--
-- Name: COLUMN "bank_transactions"."spender_email"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."spender_email" IS 'Stable key for spender_name. Matches app_users.email when that person also has a Hub account.';


--
-- Name: COLUMN "bank_transactions"."fully_used_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."fully_used_at" IS 'Set when somebody declared the transaction spent even though part of it is unallocated. Read by sync_transaction_matching_status, which would otherwise recompute it back to offen.';


--
-- Name: COLUMN "bank_transactions"."pleo_tag_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."pleo_tag_id" IS 'The tag Pleo carries for this entry (its cost centre, for Stäy the property). Resolve through pleo_tags to a Hub property. Provider-owned: rewritten on every sync.';


--
-- Name: COLUMN "bank_transactions"."pleo_account_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bank_transactions"."pleo_account_id" IS 'The chart-of-accounts line Pleo carries for this entry. Resolve through pleo_accounts to a BWA category. Provider-owned: rewritten on every sync.';


--
-- Name: bwa_account_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."bwa_account_mapping" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fiscal_year" integer NOT NULL,
    "account" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "company_id" "uuid" NOT NULL,
    CONSTRAINT "bwa_account_mapping_fiscal_year_check" CHECK ((("fiscal_year" >= 2000) AND ("fiscal_year" <= 2100)))
);


ALTER TABLE "public"."bwa_account_mapping" OWNER TO "postgres";

--
-- Name: TABLE "bwa_account_mapping"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."bwa_account_mapping" IS 'Category-to-DATEV-account mapping, keyed by (fiscal year, account, company) — DATEV rebuilds the chart of accounts every year, and different companies keep independent mappings even when the account numbers happen to match. Seeded empty (migration 0043); rows arrive per company via the Hub''s Kontenrahmen import screen.';


--
-- Name: COLUMN "bwa_account_mapping"."company_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."bwa_account_mapping"."company_id" IS 'Which company this account-to-category mapping belongs to. Two companies can use the same account NUMBER but must never share a row — kept completely separate even when identical.';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "parent_id" "uuid",
    "bwa_block" "text" NOT NULL,
    "bwa_line" "text" NOT NULL,
    "is_nicht_guv" boolean DEFAULT false NOT NULL,
    "is_catchall" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "direction" "text" DEFAULT 'ausgang'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "bwa_categories_bwa_block_check" CHECK (("bwa_block" = ANY (ARRAY['einnahmen'::"text", 'wareneinsatz'::"text", 'kosten'::"text", 'neutral'::"text", 'steuern'::"text", 'sonderfall'::"text"]))),
    CONSTRAINT "bwa_categories_direction_check" CHECK (("direction" = ANY (ARRAY['eingang'::"text", 'ausgang'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";

--
-- Name: COLUMN "categories"."direction"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."categories"."direction" IS 'Which tab the category appears under: eingang = Zahlungseingänge, ausgang = Zahlungsausgänge.';


--
-- Name: COLUMN "categories"."sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."categories"."sort_order" IS 'Manual order within one level (siblings under the same parent_id). Lower sorts first; ties fall back to name_de so the order is always deterministic.';


--
-- Name: category_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."category_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "alias" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."category_aliases" OWNER TO "postgres";

--
-- Name: change_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."change_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "text" "text",
    "data" "jsonb",
    "actor" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."change_history" OWNER TO "postgres";

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_basis" "text" DEFAULT 'payment_date'::"text",
    "overhead_cost_center" integer,
    "area" "text",
    "drive_folder_id" "text",
    CONSTRAINT "companies_area_check" CHECK (("area" = ANY (ARRAY['hospitality'::"text", 'stay_re'::"text"]))),
    CONSTRAINT "companies_booking_basis_check" CHECK (("booking_basis" = ANY (ARRAY['invoice_date'::"text", 'payment_date'::"text"]))),
    CONSTRAINT "companies_drive_folder_id_shape" CHECK ((("drive_folder_id" IS NULL) OR (("btrim"("drive_folder_id") = "drive_folder_id") AND ("left"("drive_folder_id", 1) = '/'::"text") AND ("length"("drive_folder_id") > 1) AND ("right"("drive_folder_id", 1) <> '/'::"text") AND ("drive_folder_id" !~ '[[:cntrl:]]'::"text") AND ("drive_folder_id" !~~ '%//%'::"text"))))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";

--
-- Name: COLUMN "companies"."booking_basis"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."companies"."booking_basis" IS 'Which date buckets an invoice into a period for the cost analysis (Briefing Screen 10): ''invoice_date'' = accrual accounting (document_date, falling back to service_date). ''payment_date'' = surplus accounting (paid_at, only set once bank-matched) — the default for every other company until their tax status is confirmed.';


--
-- Name: COLUMN "companies"."overhead_cost_center"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."companies"."overhead_cost_center" IS 'The company''s "Gemeinkosten" (GK) cost centre from the tax advisor''s workbook.';


--
-- Name: COLUMN "companies"."area"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."companies"."area" IS 'Business area of responsibility (client: "each department head approves their own area"). NULL means not yet assigned -- resolve_approval_rule() leaves step_2_approver at whatever the rule itself set (typically NULL) rather than guessing. Distinct from company/cost-centre identity (client: "areas of responsibility are not companies") -- this mapping is a Stäy-Hub-side inference, not a client-confirmed fact; see docs/APPROVAL_ROUTING.md.';


--
-- Name: COLUMN "companies"."drive_folder_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."companies"."drive_folder_id" IS 'Dropbox folder this company''s documents are filed into, as a path under the app folder. Read by the shared pipeline''s entity_folder_for_item(). Null means not configured, and nothing is filed on a guess.';


--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "is_company" boolean DEFAULT true NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "email" "text",
    "phone" "text",
    "address_street" "text",
    "address_zip" "text",
    "address_city" "text",
    "address_country_code" "text" DEFAULT 'DE'::"text" NOT NULL,
    "vat_id" "text",
    "customer_number" "text",
    "normalized_name" "text",
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    CONSTRAINT "customers_source_check" CHECK (("source" = ANY (ARRAY['app'::"text", 'upload'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";

--
-- Name: COLUMN "customers"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."customers"."source" IS '''app'' = created directly in the Hub (e.g. /kunden), ''upload'' = created alongside an uploaded outgoing invoice (migration 0085). LexOffice removed entirely by migration 0086.';


--
-- Name: datev_handover_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."datev_handover_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "invoice_count" integer DEFAULT 0 NOT NULL,
    "total_bytes" bigint DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "sent_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bounced_at" timestamp with time zone,
    "bounce_reason" "text",
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "text",
    CONSTRAINT "datev_handover_batches_direction_check" CHECK (("direction" = ANY (ARRAY['incoming'::"text", 'outgoing'::"text", 'other'::"text"]))),
    CONSTRAINT "datev_handover_batches_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'bounced'::"text"])))
);


ALTER TABLE "public"."datev_handover_batches" OWNER TO "postgres";

--
-- Name: COLUMN "datev_handover_batches"."bounce_reason"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."datev_handover_batches"."bounce_reason" IS 'The non-delivery report verbatim. It names the address that could not be reached, which is what diagnosing a wrong DATEV address needs.';


--
-- Name: COLUMN "datev_handover_batches"."acknowledged_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."datev_handover_batches"."acknowledged_at" IS 'Set when somebody has dealt with the bounce. Until then the batch stays on the screen: a misdelivery nobody has seen is the failure mode this column exists to prevent.';


--
-- Name: datev_routes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."datev_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "address" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "note" "text",
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "datev_routes_direction_check" CHECK (("direction" = ANY (ARRAY['incoming'::"text", 'outgoing'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."datev_routes" OWNER TO "postgres";

--
-- Name: COLUMN "datev_routes"."direction"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."datev_routes"."direction" IS 'Which DATEV upload address this row holds for the company: ''incoming'' (incoming invoices), ''outgoing'' (outgoing invoices) or ''other'' (everything else -- contracts, statements, correspondence). One row per company x direction; the address itself is a blind write, never readable back through the API (migration 0051).';


--
-- Name: document_bank_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."document_bank_accounts" (
    "document_id" "uuid" NOT NULL,
    "supplier_bank_account_id" "uuid" NOT NULL,
    "position" smallint,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin" "text" DEFAULT 'invoice'::"text" NOT NULL,
    CONSTRAINT "invoice_bank_accounts_origin_known" CHECK (("origin" = ANY (ARRAY['invoice'::"text", 'supplier_default'::"text"])))
);


ALTER TABLE "public"."document_bank_accounts" OWNER TO "postgres";

--
-- Name: TABLE "document_bank_accounts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."document_bank_accounts" IS 'Which bank accounts each invoice named. Written by the pipeline at ingest. The raw text stays in invoices.extracted, including fragments that could never become an account row.';


--
-- Name: COLUMN "document_bank_accounts"."origin"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."document_bank_accounts"."origin" IS 'invoice = the document printed this account. supplier_default = it printed none and the supplier''s standing account is standing in.';


--
-- Name: document_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."document_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid",
    "filename" "text",
    "mime" "text",
    "size_bytes" integer,
    "role" "text" DEFAULT 'original'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "storage_bucket" "text",
    "storage_path" "text",
    "checksum_sha256" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "transaction_id" "uuid",
    "external_id" "text",
    "source" "text",
    CONSTRAINT "invoice_files_owner_check" CHECK ((("document_id" IS NOT NULL) OR ("transaction_id" IS NOT NULL)))
);


ALTER TABLE "public"."document_files" OWNER TO "postgres";

--
-- Name: COLUMN "document_files"."transaction_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."document_files"."transaction_id" IS 'Set when the document belongs to a bank_transaction rather than an invoice -- e.g. a Pleo card receipt, where the purchase itself is the document and no invoice record exists.';


--
-- Name: COLUMN "document_files"."external_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."document_files"."external_id" IS 'The provider''s file id (e.g. Pleo receipt id). Dedup key so re-runs do not store a file twice.';


--
-- Name: document_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."document_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "text" "text",
    "data" "jsonb",
    "actor" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_history" OWNER TO "postgres";

--
-- Name: document_line_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."document_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "position" integer,
    "description" "text",
    "quantity" numeric,
    "unit_price" numeric(12,2),
    "amount" numeric(12,2),
    "vat_rate" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_line_items" OWNER TO "postgres";

--
-- Name: document_taxes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."document_taxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "rate" numeric(5,2),
    "net" numeric(12,2),
    "vat_amount" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_taxes" OWNER TO "postgres";

--
-- Name: entity_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."entity_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_code" "text" NOT NULL,
    "alias" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    CONSTRAINT "entity_aliases_alias_not_blank" CHECK (("btrim"("alias") <> ''::"text"))
);


ALTER TABLE "public"."entity_aliases" OWNER TO "postgres";

--
-- Name: filename_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."filename_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "separator" "text" DEFAULT ' '::"text" NOT NULL,
    "vat_suffix" "text" DEFAULT 'UST'::"text" NOT NULL,
    "include_vat_suffix" boolean DEFAULT true NOT NULL,
    "include_amount" boolean DEFAULT true NOT NULL,
    "include_property" boolean DEFAULT true NOT NULL,
    "description_source" "text" DEFAULT 'service_description'::"text" NOT NULL,
    "transliterate_umlauts" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    CONSTRAINT "filename_settings_description_source_check" CHECK (("description_source" = ANY (ARRAY['service_description'::"text", 'cost_category'::"text", 'none'::"text"]))),
    CONSTRAINT "filename_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."filename_settings" OWNER TO "postgres";

--
-- Name: filing_placements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."filing_placements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "workflow_status" "text" NOT NULL,
    "folder_id" "text" NOT NULL,
    "folder_label" "text",
    "month_partition" boolean DEFAULT false NOT NULL,
    "routing" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    CONSTRAINT "filing_placements_channel_chk" CHECK (("channel" = ANY (ARRAY['scan_folder'::"text", 'mailbox'::"text"]))),
    CONSTRAINT "filing_placements_routing_chk" CHECK (("routing" = ANY (ARRAY['fixed'::"text", 'company'::"text", 'property'::"text"]))),
    CONSTRAINT "filing_placements_routing_month_chk" CHECK ((("routing" = 'fixed'::"text") OR (NOT "month_partition"))),
    CONSTRAINT "filing_placements_status_chk" CHECK (("workflow_status" = ANY (ARRAY['eingegangen'::"text", 'in_pruefung'::"text", 'rueckfrage'::"text", 'freigegeben_assistenz'::"text", 'freigegeben_vorgesetzter'::"text", 'bezahlt'::"text", 'uebergeben_datev'::"text", 'abgeschlossen'::"text", 'abgelehnt'::"text", 'nicht_relevant'::"text"])))
);


ALTER TABLE "public"."filing_placements" OWNER TO "postgres";

--
-- Name: imported_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."imported_items" (
    "source_item_id" "text" NOT NULL,
    "attachment_id" "text" DEFAULT ''::"text" NOT NULL,
    "document_id" "uuid",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'ok'::"text",
    "content_hash" "text",
    "content_anchor" "text"
);


ALTER TABLE "public"."imported_items" OWNER TO "postgres";

--
-- Name: COLUMN "imported_items"."content_hash"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."imported_items"."content_hash" IS 'The provider''s own hash or tag for this file, as its listing gave it. Answers "was this file edited in place", by comparing it with the same provider''s later answer.';


--
-- Name: COLUMN "imported_items"."content_anchor"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."imported_items"."content_anchor" IS 'sha256 of the bytes stored for this file. Answers "have I seen this content anywhere", across channels and wherever the file has been moved to since.';


--
-- Name: ingest_exclusions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ingest_exclusions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope" "text" DEFAULT 'party'::"text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    CONSTRAINT "ingest_exclusions_scope_check" CHECK (("scope" = ANY (ARRAY['party'::"text", 'sender'::"text", 'subject'::"text", 'filename'::"text", 'envelope'::"text", 'body'::"text", 'company'::"text", 'property'::"text", 'supplier'::"text"])))
);


ALTER TABLE "public"."ingest_exclusions" OWNER TO "postgres";

--
-- Name: mail_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."mail_settings" (
    "provider" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "mailbox_address" "text",
    "mail_source_folders" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "mail_processed_folder" "text",
    "mail_return_folder" "text",
    "drive_source_folders" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "drive_processed_folder" "text",
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drive_return_folder" "text",
    CONSTRAINT "mail_settings_provider_check" CHECK (("provider" = ANY (ARRAY['microsoft'::"text", 'dropbox'::"text"])))
);


ALTER TABLE "public"."mail_settings" OWNER TO "postgres";

--
-- Name: TABLE "mail_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."mail_settings" IS 'Mail and Drive intake configuration, one row per provider (Briefing Screen 1). Read by the external ingestion pipeline; the Hub only edits it. Folder columns hold opaque provider ids (Gmail label id / Graph folder id), never display names.';


--
-- Name: COLUMN "mail_settings"."provider"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."provider" IS 'microsoft (Graph mailbox, accounting@staey.de) or dropbox (StaeyBelege app folder). Exactly one row per provider. The microsoft row only uses the mail_* columns; the dropbox row only uses the drive_* columns — each provider here only serves one of the two channels, unlike the old google row which served both.';


--
-- Name: COLUMN "mail_settings"."mail_source_folders"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."mail_source_folders" IS 'Opaque provider ids read as a source. Microsoft: Graph mailFolder id. Unused for provider=dropbox.';


--
-- Name: COLUMN "mail_settings"."mail_processed_folder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."mail_processed_folder" IS 'Where a successfully processed email is moved to. Null means: nothing is moved after extraction — moving is opt-in purely by choosing a destination, there is no separate switch.';


--
-- Name: COLUMN "mail_settings"."mail_return_folder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."mail_return_folder" IS 'Where a not-relevant email is handed back to (microsoft row only). Null means: leave it where it is.';


--
-- Name: COLUMN "mail_settings"."drive_source_folders"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."drive_source_folders" IS 'Opaque provider ids read as a source. Dropbox: a path string (e.g. "/Rechnungen"), not an internal Dropbox file id — pipeline_new''s DRIVE_SOURCE_FOLDER_ID is path-based. Unused for provider=microsoft.';


--
-- Name: COLUMN "mail_settings"."drive_processed_folder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."drive_processed_folder" IS 'Where a successfully processed file is moved to. Null means: nothing is moved after extraction — moving is opt-in purely by choosing a destination, there is no separate switch.';


--
-- Name: COLUMN "mail_settings"."drive_return_folder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."mail_settings"."drive_return_folder" IS 'Where a not-relevant Dropbox file is moved to (dropbox row only). Null means: leave it where it is.';


--
-- Name: manual_bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."manual_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "category_id" "uuid" NOT NULL,
    "period" "date" NOT NULL,
    "amount" numeric NOT NULL,
    "note" "text",
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_until" "date",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "updated_by" "text",
    CONSTRAINT "manual_bookings_amount_nonzero" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "manual_bookings_period_is_month_start" CHECK ((EXTRACT(day FROM "period") = (1)::numeric)),
    CONSTRAINT "manual_bookings_recurrence_after_period" CHECK ((("recurrence_until" IS NULL) OR ("recurrence_until" >= "period"))),
    CONSTRAINT "manual_bookings_recurrence_until_after_period" CHECK ((("recurrence_until" IS NULL) OR ("recurrence_until" >= "period")))
);


ALTER TABLE "public"."manual_bookings" OWNER TO "postgres";

--
-- Name: TABLE "manual_bookings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."manual_bookings" IS 'Manually entered cost items that never arrive as a receipt or a bank transaction (Briefing Screen 11): personnel costs, depreciation, corporate/trade tax. A recurring row is a template, expanded into calendar months at read time by manual_bookings_expanded(), never materialized. See migration 0033.';


--
-- Name: COLUMN "manual_bookings"."category_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."manual_bookings"."category_id" IS 'Required BWA line/category (bwa_categories, migration 0030) -- a manual item always has a clear, deliberately-chosen category, unlike an AI-extracted receipt that might only get a fuzzy guess, so there is no free-text fallback here (contrast invoices.cost_category).';


--
-- Name: COLUMN "manual_bookings"."period"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."manual_bookings"."period" IS 'First day of the month this item economically belongs to -- for a recurring row, its first occurrence.';


--
-- Name: COLUMN "manual_bookings"."is_recurring"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."manual_bookings"."is_recurring" IS 'true = this row is a recurring template (period = first month, recurrence_until = last month or open-ended if null), expanded into real months at read time. false = a single one-off item.';


--
-- Name: COLUMN "manual_bookings"."updated_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."manual_bookings"."updated_by" IS 'Who last edited this booking. created_by existed; this is its missing counterpart -- an edit to an amount that feeds the P&L used to leave only updated_at behind.';


--
-- Name: matching_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."matching_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "amount_tolerance" numeric DEFAULT 0.01 NOT NULL,
    "auto_match_threshold" numeric DEFAULT 0.90 NOT NULL,
    "candidate_threshold" numeric DEFAULT 0.60 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "matching_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."matching_settings" OWNER TO "postgres";

--
-- Name: notification_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_channels" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_channels" OWNER TO "postgres";

--
-- Name: notification_dispatch_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_dispatch_log" (
    "id" bigint NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "ok" boolean DEFAULT false NOT NULL,
    "events" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "digests" integer DEFAULT 0 NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."notification_dispatch_log" OWNER TO "postgres";

--
-- Name: notification_dispatch_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_dispatch_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."notification_dispatch_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notification_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_events" (
    "id" bigint NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recipient_user_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "acknowledged_at" timestamp with time zone
);


ALTER TABLE "public"."notification_events" OWNER TO "postgres";

--
-- Name: COLUMN "notification_events"."acknowledged_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."notification_events"."acknowledged_at" IS 'When the RECIPIENT dismissed this notification on the record it points at. Separate from app_users.notifications_seen_at, which is one timestamp for the whole bell.';


--
-- Name: notification_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."notification_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "bell_events" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "digest_enabled" boolean DEFAULT false NOT NULL,
    "digest_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "digest_channel" "text" DEFAULT 'team'::"text" NOT NULL,
    "digest_events" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/Berlin'::"text" NOT NULL,
    "last_digest_sent_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bell_ack" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "notification_settings_digest_channel_check" CHECK (("digest_channel" = ANY (ARRAY['team'::"text", 'personal'::"text"])))
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";

--
-- Name: COLUMN "notification_settings"."bell_ack"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."notification_settings"."bell_ack" IS 'Per bell row the count the user last acknowledged by clicking through. {row key: count}.';


--
-- Name: notification_target_kinds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notification_target_kinds" (
    "kind" "text" NOT NULL,
    "source_table" "text",
    "id_column" "text" DEFAULT 'id'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."notification_target_kinds" OWNER TO "postgres";

--
-- Name: TABLE "notification_target_kinds"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."notification_target_kinds" IS 'What a notification may point at. The front end resolves the kind to a label and an icon; this table exists so the RPC can confirm the kind is known and the record really exists.';


--
-- Name: opos_whitelist_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."opos_whitelist_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term" "text" NOT NULL,
    "scope" "text" DEFAULT 'reference'::"text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    CONSTRAINT "opos_whitelist_rules_category_chk" CHECK (("category" = ANY (ARRAY['salary'::"text", 'tax_prepayment'::"text", 'private_withdrawal'::"text", 'rebooking'::"text", 'loan_installment'::"text", 'fee_interest'::"text", 'atm_withdrawal'::"text", 'other'::"text"]))),
    CONSTRAINT "opos_whitelist_rules_scope_chk" CHECK (("scope" = ANY (ARRAY['reference'::"text", 'counterparty'::"text", 'iban'::"text", 'booking_text'::"text", 'any'::"text"])))
);


ALTER TABLE "public"."opos_whitelist_rules" OWNER TO "postgres";

--
-- Name: TABLE "opos_whitelist_rules"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."opos_whitelist_rules" IS 'OPOS whitelist (Briefing Screen 10): booking-text/counterparty terms whose transactions never have a receipt. A match parks the transaction in matching_status=''ignoriert'' so it drops out of the open-items list and out of matching. Hub-editable; the pipeline only seeds.';


--
-- Name: outgoing_invoice_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."outgoing_invoice_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outgoing_invoice_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "mime" "text",
    "size_bytes" integer,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "checksum_sha256" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outgoing_invoice_files" OWNER TO "postgres";

--
-- Name: outgoing_invoice_transaction_matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."outgoing_invoice_transaction_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outgoing_invoice_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'kandidat'::"text" NOT NULL,
    "score" numeric,
    "match_reasons" "jsonb",
    "amount_matched" numeric NOT NULL,
    "matched_by" "text",
    "matched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_by" "text",
    "confirmed_at" timestamp with time zone,
    "rejected_by" "text",
    "rejected_at" timestamp with time zone,
    "reject_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "difference_reason" "text",
    CONSTRAINT "outgoing_invoice_transaction_matches_amount_matched_check" CHECK (("amount_matched" > (0)::numeric)),
    CONSTRAINT "outgoing_invoice_transaction_matches_status_check" CHECK (("status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text", 'bestaetigt'::"text", 'abgelehnt'::"text"])))
);


ALTER TABLE "public"."outgoing_invoice_transaction_matches" OWNER TO "postgres";

--
-- Name: TABLE "outgoing_invoice_transaction_matches"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."outgoing_invoice_transaction_matches" IS 'Outgoing-invoice side of bank matching: an outgoing invoice (revenue) linked to an incoming (credit) bank transaction. Same m:n/partial-amount model as invoice_transaction_matches, mirrored for the opposite direction.';


--
-- Name: outgoing_invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."outgoing_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "voucher_number" "text",
    "voucher_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "voucher_date" "date",
    "due_date" "date",
    "amount_net" numeric,
    "amount_gross" numeric,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "line_items" "jsonb",
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "dunning_level" integer,
    "dunning_due_date" "date",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_synced_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "status_source" "text",
    "datev_handed_over_at" timestamp with time zone,
    "datev_batch_id" "uuid",
    CONSTRAINT "outgoing_invoices_source_check" CHECK (("source" = 'upload'::"text")),
    CONSTRAINT "outgoing_invoices_status_source_check" CHECK (("status_source" = ANY (ARRAY['auto'::"text", 'manual'::"text"]))),
    CONSTRAINT "outgoing_invoices_voucher_status_check" CHECK (("voucher_status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'paidoff'::"text", 'voided'::"text"])))
);


ALTER TABLE "public"."outgoing_invoices" OWNER TO "postgres";

--
-- Name: COLUMN "outgoing_invoices"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."outgoing_invoices"."source" IS 'Always ''upload'' (migration 0085) -- LexOffice removed entirely by migration 0086, so there is no other way an outgoing invoice enters this table.';


--
-- Name: COLUMN "outgoing_invoices"."status_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."outgoing_invoices"."status_source" IS 'Only meaningful for source=''upload'' rows: who last set voucher_status -- ''auto'' (the bank-match trigger below) or ''manual'' (set_uploaded_outgoing_invoice_status). Always NULL for source in (''app'',''lexoffice''), where LexOffice itself stays the sole status authority.';


--
-- Name: COLUMN "outgoing_invoices"."datev_handed_over_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."outgoing_invoices"."datev_handed_over_at" IS 'Set once this invoice has been emailed to the DATEV upload address. The guard against sending it twice; written only after the send is confirmed, never before.';


--
-- Name: COLUMN "outgoing_invoices"."datev_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."outgoing_invoices"."datev_batch_id" IS 'Which datev_handover_batches row carried this invoice.';


--
-- Name: package_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."package_migrations" (
    "version" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."package_migrations" OWNER TO "postgres";

--
-- Name: payment_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."payment_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "recipient_name" "text",
    "recipient_iban" "text" NOT NULL,
    "recipient_bic" "text",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "payment_reference" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "status_reason" "text",
    "banksapi_access_id" "text",
    "banksapi_product_id" "text",
    "banksapi_payment_id" "text",
    "is_sandbox" boolean DEFAULT true NOT NULL,
    "idempotency_key" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_iban_changed_recently" boolean DEFAULT false NOT NULL,
    "fraud_flags" "jsonb",
    "initiated_by" "text",
    "initiated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "authorized_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_orders_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payment_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_sca'::"text", 'authorized'::"text", 'executed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."payment_orders" OWNER TO "postgres";

--
-- Name: TABLE "payment_orders"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."payment_orders" IS 'One row per BANKSapi payment ATTEMPT (docs/BANKSAPI_PAYMENT_INITIATION.md). Recipient fields are a snapshot taken at trigger time, not a live join to suppliers. Immutable audit record -- no soft-delete; a failed/cancelled attempt stays as a row, a retry is a new one.';


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "label_de" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "description_de" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "description_en" "text"
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";

--
-- Name: pipeline_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pipeline_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "ai_calls" integer DEFAULT 0 NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."pipeline_runs" OWNER TO "postgres";

--
-- Name: pipeline_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pipeline_settings" (
    "only_row" boolean DEFAULT true NOT NULL,
    "run_now_enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "text",
    CONSTRAINT "pipeline_settings_only_row_check" CHECK ("only_row")
);


ALTER TABLE "public"."pipeline_settings" OWNER TO "postgres";

--
-- Name: pleo_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pleo_accounts" (
    "id" "uuid" NOT NULL,
    "code" "text",
    "name" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "external_id" "text",
    "category_id" "uuid",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pleo_accounts" OWNER TO "postgres";

--
-- Name: TABLE "pleo_accounts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."pleo_accounts" IS 'Pleo chart of accounts mirrored from POST /v1/chart-of-accounts:search, with the BWA category each account maps to. `accountId` on an accounting entry points at one of these.';


--
-- Name: pleo_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pleo_tags" (
    "id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "name" "text",
    "code" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "property_id" "uuid",
    "is_overhead" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pleo_tags_overhead_xor_property" CHECK ((NOT ("is_overhead" AND ("property_id" IS NOT NULL))))
);


ALTER TABLE "public"."pleo_tags" OWNER TO "postgres";

--
-- Name: TABLE "pleo_tags"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."pleo_tags" IS 'Pleo tag values mirrored from GET /v0/tag-groups/{group}/tags, with the Hub property each one means. Archived tags are kept: a 2022 entry still carries the tag it was given.';


--
-- Name: processing_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."processing_log" (
    "id" bigint NOT NULL,
    "source_item_id" "text",
    "subject" "text",
    "sender" "text",
    "status" "text",
    "reason" "text",
    "document_id" "uuid",
    "processed_at" timestamp with time zone DEFAULT "now"(),
    "body" "text",
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."processing_log" OWNER TO "postgres";

--
-- Name: processing_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."processing_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."processing_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text",
    "address" "text",
    "vat_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "drive_folder_id" "text",
    CONSTRAINT "properties_drive_folder_id_shape" CHECK ((("drive_folder_id" IS NULL) OR (("btrim"("drive_folder_id") = "drive_folder_id") AND ("left"("drive_folder_id", 1) = '/'::"text") AND ("length"("drive_folder_id") > 1) AND ("right"("drive_folder_id", 1) <> '/'::"text") AND ("drive_folder_id" !~ '[[:cntrl:]]'::"text") AND ("drive_folder_id" !~~ '%//%'::"text"))))
);


ALTER TABLE "public"."properties" OWNER TO "postgres";

--
-- Name: COLUMN "properties"."drive_folder_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."properties"."drive_folder_id" IS 'Dropbox folder this property''s documents are filed into. Same contract as the company column.';


--
-- Name: property_companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."property_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "cost_center_number" integer
);


ALTER TABLE "public"."property_companies" OWNER TO "postgres";

--
-- Name: TABLE "property_companies"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."property_companies" IS 'Direct property <-> company assignment, replacing the business-line model (migration 0083). A property may belong to more than one company (the client''s dual-ownership cases); the UI requires at least one before a property''s form can be saved, enforced client-side. Insert/update open to any authenticated user, matching properties'' own write policy (migration 0014) -- fixed by 0084 after review found it gated to admin-only while property creation itself is not. Soft-delete only -- a past link explains how earlier receipts were booked.';


--
-- Name: COLUMN "property_companies"."cost_center_number"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."property_companies"."cost_center_number" IS 'Cost-centre number from the tax adviser''s workbook, per company/property pairing: the same property carries a different number in each company''s books (Ludwigshafen 6 for Stäy, 101 for Impuls). The overhead counterpart is companies.overhead_cost_center.';


--
-- Name: read_cursors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."read_cursors" (
    "channel_key" "text" NOT NULL,
    "identity" "text" DEFAULT ''::"text" NOT NULL,
    "folder_id" "text" NOT NULL,
    "scope" "text" DEFAULT ''::"text" NOT NULL,
    "bookmark" "text",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."read_cursors" OWNER TO "postgres";

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";

--
-- Name: TABLE "roles"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."roles" IS 'Fixed set of four roles (Appendix A7): super_admin, admin, supervisor, assistant. Single tenant -- no per-tenant role customization, so this is a small closed list, not a user-manageable table.';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."schema_migrations" (
    "id" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schema_migrations_id_check" CHECK (("length"("btrim"("id")) > 0))
);


ALTER TABLE "public"."schema_migrations" OWNER TO "postgres";

--
-- Name: supplier_bank_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."supplier_bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "iban" "text" NOT NULL,
    "bic" "text",
    "bank_name" "text",
    "source" "text" DEFAULT 'pipeline'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text",
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "text",
    "is_payable" boolean GENERATED ALWAYS AS (("iban" ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'::"text")) STORED,
    CONSTRAINT "supplier_bank_accounts_default_is_active" CHECK (((NOT "is_default") OR "is_active")),
    CONSTRAINT "supplier_bank_accounts_default_is_payable" CHECK (((NOT "is_default") OR "is_payable")),
    CONSTRAINT "supplier_bank_accounts_iban_shape" CHECK (("iban" ~ '^[A-Z]{2}[0-9*]{2}[A-Z0-9*]{11,30}$'::"text")),
    CONSTRAINT "supplier_bank_accounts_source_known" CHECK (("source" = ANY (ARRAY['pipeline'::"text", 'human'::"text", 'backfill'::"text"])))
);


ALTER TABLE "public"."supplier_bank_accounts" OWNER TO "postgres";

--
-- Name: COLUMN "supplier_bank_accounts"."is_default"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."supplier_bank_accounts"."is_default" IS 'The account this supplier is paid on. At most one per supplier (partial unique index). Mirrors suppliers.iban, which stays authoritative. See trg_supplier_default_iban_sync.';


--
-- Name: COLUMN "supplier_bank_accounts"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."supplier_bank_accounts"."deleted_at" IS 'Set when the owning supplier is soft-deleted. Cleared again when it is restored. Separate from is_active, which says the supplier stopped billing from this account.';


--
-- Name: COLUMN "supplier_bank_accounts"."confirmed_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."supplier_bank_accounts"."confirmed_at" IS 'When a person vouched for this account. Null on a pipeline-added account means it is waiting for review. Accounts added in the Hub, carried over by a backfill, or belonging to a supplier the pipeline created in the same run are confirmed on the way in.';


--
-- Name: COLUMN "supplier_bank_accounts"."is_payable"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."supplier_bank_accounts"."is_payable" IS 'False for a masked IBAN the reader could only partly make out. Generated, so it cannot drift from the value it describes.';


--
-- Name: supplier_iban_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."supplier_iban_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "iban" "text",
    "bic" "text",
    "bank_name" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "text",
    "event" "text" DEFAULT 'default_changed'::"text" NOT NULL,
    CONSTRAINT "supplier_iban_history_event_known" CHECK (("event" = ANY (ARRAY['account_added'::"text", 'default_set'::"text", 'default_changed'::"text"])))
);


ALTER TABLE "public"."supplier_iban_history" OWNER TO "postgres";

--
-- Name: COLUMN "supplier_iban_history"."event"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."supplier_iban_history"."event" IS 'account_added: this account was put on file. default_set: it became the default. default_changed: legacy rows, where the row holds the account that was REPLACED.';


--
-- Name: tour_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tour_progress" (
    "user_id" "uuid" NOT NULL,
    "tour_id" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" "text" NOT NULL,
    "last_step" integer DEFAULT 0 NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tour_progress_counts_sane" CHECK ((("version" >= 1) AND ("last_step" >= 0))),
    CONSTRAINT "tour_progress_status_known" CHECK (("status" = ANY (ARRAY['skipped'::"text", 'completed'::"text"]))),
    CONSTRAINT "tour_progress_tour_id_present" CHECK (("length"("btrim"("tour_id")) > 0))
);


ALTER TABLE "public"."tour_progress" OWNER TO "postgres";

--
-- Name: user_company_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_company_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_company_access" OWNER TO "postgres";

--
-- Name: TABLE "user_company_access"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_company_access" IS 'Which companies a person may see. No grants for a user means full visibility, which keeps current behaviour until the permissions feature switches enforcement on.';


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "user_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "granted" boolean NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";

--
-- Name: v_bank_transactions_list; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_bank_transactions_list" WITH ("security_invoker"='true') AS
 SELECT "id",
    "account_id",
    "connection_id",
    "banksapi_hash",
    "amount",
    "currency",
    "booking_date",
    "value_date",
    "payment_reference",
    "booking_text",
    "counterparty_holder",
    "counterparty_iban",
    "counterparty_bic",
    "direction",
    "matching_status",
    "is_sandbox",
    "raw_data",
    "fts",
    "imported_at",
    "created_at",
    "company_id",
    "no_receipt_reason",
    "whitelist_rule_id",
    "no_receipt_set_by",
    "no_receipt_set_at",
    "transaction_type",
    "transaction_type_source",
    "category_id",
    "category_source",
    "source",
    "external_id",
    "spender_name",
    "spender_email",
    "fully_used_at",
    "fully_used_by",
    "fully_used_note",
    "pleo_tag_id",
    "pleo_account_id",
    ((EXISTS ( SELECT 1
           FROM "public"."invoice_transaction_matches" "m"
          WHERE (("m"."transaction_id" = "bt"."id") AND ("m"."status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text"]))))) OR (EXISTS ( SELECT 1
           FROM "public"."outgoing_invoice_transaction_matches" "m"
          WHERE (("m"."transaction_id" = "bt"."id") AND ("m"."status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text"])))))) AS "has_suggested_match"
   FROM "public"."bank_transactions" "bt";


ALTER VIEW "public"."v_bank_transactions_list" OWNER TO "postgres";

--
-- Name: v_company_invoice_totals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_company_invoice_totals" WITH ("security_invoker"='true') AS
 SELECT "company_id",
    "count"(*) AS "beleg_anzahl",
    COALESCE("sum"("amount_gross"), (0)::numeric) AS "beleg_summe"
   FROM "public"."documents" "i"
  WHERE (("company_id" IS NOT NULL) AND ("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("not_relevant_at" IS NULL) AND ("status" <> 'aufgeteilt'::"text"))
  GROUP BY "company_id";


ALTER VIEW "public"."v_company_invoice_totals" OWNER TO "postgres";

--
-- Name: v_customer_invoice_totals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_customer_invoice_totals" WITH ("security_invoker"='true') AS
 SELECT "customer_id",
    "count"(*) AS "rechnung_anzahl",
    COALESCE("sum"("amount_gross"), (0)::numeric) AS "rechnung_summe",
    "count"(*) FILTER (WHERE (("voucher_status" = 'open'::"text") AND ("due_date" IS NOT NULL) AND ("due_date" < CURRENT_DATE))) AS "ueberfaellig_anzahl"
   FROM "public"."outgoing_invoices" "o"
  WHERE (("customer_id" IS NOT NULL) AND ("deleted_at" IS NULL) AND ("voucher_status" <> ALL (ARRAY['voided'::"text", 'draft'::"text"])))
  GROUP BY "customer_id";


ALTER VIEW "public"."v_customer_invoice_totals" OWNER TO "postgres";

--
-- Name: v_invoices_search; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_invoices_search" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "company_code",
    "supplier_id",
    "issuer",
    "document_type",
    "document_date",
    "service_date",
    "invoice_number",
    "amount_net",
    "vat_rate",
    "vat_amount",
    "amount_gross",
    "currency",
    "is_small_amount",
    "intake_channel",
    "source",
    "property_code",
    "storage_path",
    "ocr_fulltext",
    "status",
    "extracted",
    "validation",
    "source_item_id",
    "created_at",
    "service_period_from",
    "service_period_to",
    "cost_category",
    "service_description",
    "line_items",
    "tax",
    "issuer_address",
    "recipient_name",
    "recipient_address",
    "customer_number",
    "payment_reference",
    "payment_method",
    "tax_note",
    "traffic_light",
    "confidence_score",
    "already_paid",
    "fts",
    "embedding",
    "property_id",
    "source_document_id",
    "page_range",
    "vat_treatment",
    "business_line_id",
    "business_line_code",
    "assignment_source",
    "workflow_status",
    "assigned_to",
    "order_number",
    "due_date",
    "paid_at",
    "updated_at",
    "deleted_at",
    "deleted_by",
    "delete_reason",
    "paid_source",
    "vat_source",
    "cost_category_source",
    "not_relevant_at",
    "not_relevant_by",
    "not_relevant_note",
    "mailbox_reset_at",
    "archived_at",
    "archived_by",
    "archive_note",
    "assignment_decided_by",
    "category_id",
    "vat_deductible_pct",
    "vat_deductibility_source",
    "vat_special_case",
    "vat_conflict_at",
    "vat_conflict_note",
    "vat_deductible_amount",
    "vat_nondeductible_amount",
    "datev_handed_over_at",
    "datev_batch_id",
    "issuer_sort",
    "review_score",
    "has_suggested_bank_match",
    "has_confirmed_bank_match",
    "company_assignment_source",
    "property_assignment_source",
    "lower"(((((((((((((((COALESCE("issuer", ''::"text") || ' '::"text") || COALESCE("invoice_number", ''::"text")) || ' '::"text") || COALESCE("service_description", ''::"text")) || ' '::"text") || COALESCE("cost_category", ''::"text")) || ' '::"text") || COALESCE("to_char"("amount_gross", 'FM9999999990.00'::"text"), ''::"text")) || ' '::"text") || COALESCE("replace"("to_char"("amount_gross", 'FM9999999990.00'::"text"), '.'::"text", ','::"text"), ''::"text")) || ' '::"text") || COALESCE("to_char"("amount_gross", 'FM9,999,999,990.00'::"text"), ''::"text")) || ' '::"text") || COALESCE("replace"("replace"("replace"("to_char"("amount_gross", 'FM9,999,999,990.00'::"text"), ','::"text", '#'::"text"), '.'::"text", ','::"text"), '#'::"text", '.'::"text"), ''::"text"))) AS "search_text"
   FROM "public"."v_invoices_list" "l";


ALTER VIEW "public"."v_invoices_search" OWNER TO "postgres";

--
-- Name: v_open_items; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_open_items" WITH ("security_invoker"='on') AS
 SELECT "i"."id",
    "i"."company_id",
    "i"."company_code",
    "i"."supplier_id",
    "i"."issuer",
    "i"."document_type",
    "i"."document_date",
    "i"."service_date",
    "i"."invoice_number",
    "i"."amount_net",
    "i"."vat_rate",
    "i"."vat_amount",
    "i"."amount_gross",
    "i"."currency",
    "i"."is_small_amount",
    "i"."intake_channel",
    "i"."source",
    "i"."property_code",
    "i"."storage_path",
    "i"."ocr_fulltext",
    "i"."status",
    "i"."extracted",
    "i"."validation",
    "i"."source_item_id",
    "i"."created_at",
    "i"."service_period_from",
    "i"."service_period_to",
    "i"."cost_category",
    "i"."service_description",
    "i"."line_items",
    "i"."tax",
    "i"."issuer_address",
    "i"."recipient_name",
    "i"."recipient_address",
    "i"."customer_number",
    "i"."payment_reference",
    "i"."payment_method",
    "i"."tax_note",
    "i"."traffic_light",
    "i"."confidence_score",
    "i"."already_paid",
    "i"."fts",
    "i"."embedding",
    "i"."property_id",
    "i"."source_document_id",
    "i"."page_range",
    "i"."vat_treatment",
    "i"."business_line_id",
    "i"."business_line_code",
    "i"."assignment_source",
    "i"."workflow_status",
    "i"."assigned_to",
    "i"."order_number",
    "i"."due_date",
    "i"."paid_at",
    "i"."updated_at",
    "i"."deleted_at",
    "i"."deleted_by",
    "i"."delete_reason",
    "i"."paid_source",
    "i"."vat_source",
    "i"."cost_category_source",
    "i"."not_relevant_at",
    "i"."not_relevant_by",
    "i"."not_relevant_note",
    "i"."mailbox_reset_at",
    "i"."archived_at",
    "i"."archived_by",
    "i"."archive_note",
    "i"."assignment_decided_by",
    "i"."category_id",
    "i"."vat_deductible_pct",
    "i"."vat_deductibility_source",
    "i"."vat_special_case",
    "i"."vat_conflict_at",
    "i"."vat_conflict_note",
    "i"."vat_deductible_amount",
    "i"."vat_nondeductible_amount",
    "i"."datev_handed_over_at",
    "i"."datev_batch_id",
    "i"."income_tax_treatment",
    "i"."filed_at",
    "i"."validation_detail",
    "i"."urgency",
    "i"."days_until_due",
    "i"."early_payment_deadline",
    "i"."early_payment_discount_percent",
    "i"."early_payment_discount_amount",
    COALESCE("m"."matched_sum", (0)::numeric) AS "matched_sum",
    "public"."invoice_is_fully_covered"("i"."amount_gross",
        CASE
            WHEN ("i"."paid_at" IS NOT NULL) THEN "abs"(COALESCE("i"."amount_gross", (0)::numeric))
            ELSE COALESCE("m"."matched_sum", (0)::numeric)
        END) AS "is_covered",
        CASE
            WHEN "public"."invoice_is_fully_covered"("i"."amount_gross",
            CASE
                WHEN ("i"."paid_at" IS NOT NULL) THEN "abs"(COALESCE("i"."amount_gross", (0)::numeric))
                ELSE COALESCE("m"."matched_sum", (0)::numeric)
            END) THEN NULL::"text"
            WHEN (COALESCE("i"."amount_gross", (0)::numeric) = (0)::numeric) THEN 'kein_betrag'::"text"
            WHEN ("i"."amount_gross" < (0)::numeric) THEN 'gutschrift'::"text"
            WHEN COALESCE("i"."already_paid", false) THEN 'privat_bezahlt'::"text"
            ELSE NULL::"text"
        END AS "open_blocker",
    ((NOT "public"."invoice_is_fully_covered"("i"."amount_gross",
        CASE
            WHEN ("i"."paid_at" IS NOT NULL) THEN "abs"(COALESCE("i"."amount_gross", (0)::numeric))
            ELSE COALESCE("m"."matched_sum", (0)::numeric)
        END)) AND (COALESCE("i"."amount_gross", (0)::numeric) > (0)::numeric) AND (COALESCE("i"."already_paid", false) = false)) AS "is_open"
   FROM ("public"."documents" "i"
     LEFT JOIN ( SELECT "invoice_transaction_matches"."document_id",
            "sum"("abs"("invoice_transaction_matches"."amount_matched")) AS "matched_sum"
           FROM "public"."invoice_transaction_matches"
          WHERE ("invoice_transaction_matches"."status" = 'bestaetigt'::"text")
          GROUP BY "invoice_transaction_matches"."document_id") "m" ON (("m"."document_id" = "i"."id")))
  WHERE (("i"."deleted_at" IS NULL) AND ("i"."archived_at" IS NULL) AND ("i"."not_relevant_at" IS NULL) AND ("i"."status" <> 'aufgeteilt'::"text"));


ALTER VIEW "public"."v_open_items" OWNER TO "postgres";

--
-- Name: v_property_invoice_totals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_property_invoice_totals" WITH ("security_invoker"='true') AS
 SELECT "property_id",
    "count"(*) AS "beleg_anzahl",
    COALESCE("sum"("amount_gross"), (0)::numeric) AS "beleg_summe"
   FROM "public"."documents" "i"
  WHERE (("property_id" IS NOT NULL) AND ("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("not_relevant_at" IS NULL) AND ("status" <> 'aufgeteilt'::"text"))
  GROUP BY "property_id";


ALTER VIEW "public"."v_property_invoice_totals" OWNER TO "postgres";

--
-- Name: v_supplier_duplicates; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_supplier_duplicates" AS
 WITH "basis" AS (
         SELECT "suppliers"."id",
            NULLIF("lower"("regexp_replace"(COALESCE("suppliers"."name", ''::"text"), '[^[:alnum:]]'::"text", ''::"text", 'g'::"text")), ''::"text") AS "name_key",
            NULLIF("replace"(("regexp_match"("upper"(COALESCE("suppliers"."vat_id", ''::"text")), '(?:^|[^A-Z])([A-Z]{2} ?[0-9][0-9 ]{7,13})'::"text"))[1], ' '::"text", ''::"text"), ''::"text") AS "ust_key",
            NULLIF(("regexp_match"(COALESCE("suppliers"."vat_id", ''::"text"), '(?:^|[^0-9])([0-9]{2,4}/[0-9]{3}/[0-9]{4,5})'::"text"))[1], ''::"text") AS "steuer_key"
           FROM "public"."suppliers"
          WHERE ("suppliers"."deleted_at" IS NULL)
        )
 SELECT 'name'::"text" AS "key_type",
    "basis"."name_key" AS "key_value",
    "count"(*) AS "n",
    "array_agg"("basis"."id" ORDER BY "basis"."id") AS "ids"
   FROM "basis"
  WHERE ("basis"."name_key" IS NOT NULL)
  GROUP BY "basis"."name_key"
 HAVING ("count"(*) > 1)
UNION ALL
 SELECT 'vat_id'::"text" AS "key_type",
    "basis"."ust_key" AS "key_value",
    "count"(*) AS "n",
    "array_agg"("basis"."id" ORDER BY "basis"."id") AS "ids"
   FROM "basis"
  WHERE ("basis"."ust_key" IS NOT NULL)
  GROUP BY "basis"."ust_key"
 HAVING ("count"(*) > 1)
UNION ALL
 SELECT 'steuernummer'::"text" AS "key_type",
    "basis"."steuer_key" AS "key_value",
    "count"(*) AS "n",
    "array_agg"("basis"."id" ORDER BY "basis"."id") AS "ids"
   FROM "basis"
  WHERE ("basis"."steuer_key" IS NOT NULL)
  GROUP BY "basis"."steuer_key"
 HAVING ("count"(*) > 1);


ALTER VIEW "public"."v_supplier_duplicates" OWNER TO "postgres";

--
-- Name: v_supplier_invoice_totals; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_supplier_invoice_totals" WITH ("security_invoker"='true') AS
 SELECT "supplier_id",
    "count"(*) AS "beleg_anzahl",
    COALESCE("sum"("amount_gross"), (0)::numeric) AS "beleg_summe",
        CASE
            WHEN ("count"(*) FILTER (WHERE ("document_date" IS NOT NULL)) >= 2) THEN ("round"(((("max"("document_date") - "min"("document_date")))::numeric / (("count"(*) FILTER (WHERE ("document_date" IS NOT NULL)) - 1))::numeric)))::integer
            ELSE NULL::integer
        END AS "avg_tage"
   FROM "public"."documents" "i"
  WHERE (("supplier_id" IS NOT NULL) AND ("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("not_relevant_at" IS NULL) AND ("status" <> 'aufgeteilt'::"text"))
  GROUP BY "supplier_id";


ALTER VIEW "public"."v_supplier_invoice_totals" OWNER TO "postgres";

--
-- Name: v_trash_base; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_trash_base" WITH ("security_invoker"='true') AS
 SELECT "table_name",
    "id",
        CASE
            WHEN "identifiziert" THEN "label"
            ELSE (("label" || ' · Ref. '::"text") || "left"(("id")::"text", 8))
        END AS "label",
    "deleted_at",
    "deleted_by",
    "delete_reason"
   FROM ( SELECT 'documents'::"text" AS "table_name",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."issuer"), ''::"text"), 'Aussteller unbekannt'::"text"), NULLIF("btrim"("t"."invoice_number"), ''::"text"), "to_char"(("t"."document_date")::timestamp with time zone, 'DD.MM.YYYY'::"text"),
                CASE
                    WHEN ("t"."amount_gross" IS NOT NULL) THEN (("btrim"("to_char"("t"."amount_gross", 'FM999G999G990D00'::"text")) || ' '::"text") || COALESCE(NULLIF("t"."currency", ''::"text"), 'EUR'::"text"))
                    ELSE NULL::"text"
                END) AS "label",
            ((COALESCE(NULLIF("btrim"("t"."issuer"), ''::"text"), NULLIF("btrim"("t"."invoice_number"), ''::"text")) IS NOT NULL) OR ("t"."document_date" IS NOT NULL) OR ("t"."amount_gross" IS NOT NULL)) AS "identifiziert",
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."documents" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'suppliers'::"text" AS "text",
            "t"."id",
            COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), 'Lieferant ohne Namen'::"text") AS "coalesce",
            (NULLIF("btrim"("t"."name"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."suppliers" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'customers'::"text" AS "text",
            "t"."id",
            COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), 'Kunde ohne Namen'::"text") AS "coalesce",
            (NULLIF("btrim"("t"."name"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."customers" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'outgoing_invoices'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."voucher_number"), ''::"text"), 'Ausgangsrechnung ohne Nummer'::"text"), ( SELECT NULLIF("btrim"("c"."name"), ''::"text") AS "nullif"
                   FROM "public"."customers" "c"
                  WHERE ("c"."id" = "t"."customer_id")), "to_char"(("t"."voucher_date")::timestamp with time zone, 'DD.MM.YYYY'::"text"),
                CASE
                    WHEN ("t"."amount_gross" IS NOT NULL) THEN (("btrim"("to_char"("t"."amount_gross", 'FM999G999G990D00'::"text")) || ' '::"text") || COALESCE(NULLIF("t"."currency", ''::"text"), 'EUR'::"text"))
                    ELSE NULL::"text"
                END) AS "concat_ws",
            ((NULLIF("btrim"("t"."voucher_number"), ''::"text") IS NOT NULL) OR ("t"."customer_id" IS NOT NULL) OR ("t"."voucher_date" IS NOT NULL) OR ("t"."amount_gross" IS NOT NULL)),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."outgoing_invoices" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'manual_bookings'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."note"), ''::"text"), 'Manuelle Buchung'::"text"), ( SELECT NULLIF("btrim"("co"."name"), ''::"text") AS "nullif"
                   FROM "public"."companies" "co"
                  WHERE ("co"."id" = "t"."company_id")), "to_char"(("t"."period")::timestamp with time zone, 'MM/YYYY'::"text"),
                CASE
                    WHEN ("t"."amount" IS NOT NULL) THEN ("btrim"("to_char"("t"."amount", 'FM999G999G990D00'::"text")) || ' EUR'::"text")
                    ELSE NULL::"text"
                END) AS "concat_ws",
            ((NULLIF("btrim"("t"."note"), ''::"text") IS NOT NULL) OR ("t"."company_id" IS NOT NULL) OR ("t"."period" IS NOT NULL) OR ("t"."amount" IS NOT NULL)),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."manual_bookings" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'approval_rules'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."note"), ''::"text"), 'Freigabe-Regel'::"text"), ( SELECT NULLIF("btrim"("s"."name"), ''::"text") AS "nullif"
                   FROM "public"."suppliers" "s"
                  WHERE ("s"."id" = "t"."supplier_id")), ( SELECT COALESCE(NULLIF("btrim"("p"."name"), ''::"text"), NULLIF("btrim"("p"."code"), ''::"text")) AS "coalesce"
                   FROM "public"."properties" "p"
                  WHERE ("p"."id" = "t"."property_id")), ( SELECT NULLIF("btrim"("co"."name"), ''::"text") AS "nullif"
                   FROM "public"."companies" "co"
                  WHERE ("co"."id" = "t"."company_id")),
                CASE
                    WHEN ("t"."min_amount" IS NOT NULL) THEN (('ab '::"text" || "btrim"("to_char"("t"."min_amount", 'FM999G999G990D00'::"text"))) || ' EUR'::"text")
                    ELSE NULL::"text"
                END, NULLIF("btrim"("t"."step_1_approver"), ''::"text")) AS "concat_ws",
            ((NULLIF("btrim"("t"."note"), ''::"text") IS NOT NULL) OR ("t"."supplier_id" IS NOT NULL) OR ("t"."property_id" IS NOT NULL) OR ("t"."company_id" IS NOT NULL) OR ("t"."min_amount" IS NOT NULL) OR (NULLIF("btrim"("t"."step_1_approver"), ''::"text") IS NOT NULL)),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."approval_rules" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'assignment_rules'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."note"), ''::"text"), NULLIF("btrim"("t"."reference_pattern"), ''::"text"), NULLIF("btrim"("t"."cost_category"), ''::"text"), 'Zuordnungsregel'::"text"), ( SELECT NULLIF("btrim"("s"."name"), ''::"text") AS "nullif"
                   FROM "public"."suppliers" "s"
                  WHERE ("s"."id" = "t"."supplier_id")), ( SELECT COALESCE(NULLIF("btrim"("p"."name"), ''::"text"), NULLIF("btrim"("p"."code"), ''::"text")) AS "coalesce"
                   FROM "public"."properties" "p"
                  WHERE ("p"."id" = "t"."property_id"))) AS "concat_ws",
            ((COALESCE(NULLIF("btrim"("t"."note"), ''::"text"), NULLIF("btrim"("t"."reference_pattern"), ''::"text"), NULLIF("btrim"("t"."cost_category"), ''::"text")) IS NOT NULL) OR ("t"."supplier_id" IS NOT NULL) OR ("t"."property_id" IS NOT NULL)),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."assignment_rules" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'ingest_exclusions'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."term"), ''::"text"), 'Ausschlussregel ohne Begriff'::"text"), NULLIF("btrim"("t"."scope"), ''::"text")) AS "concat_ws",
            (NULLIF("btrim"("t"."term"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."ingest_exclusions" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'opos_whitelist_rules'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."term"), ''::"text"), 'OPOS-Regel ohne Begriff'::"text"), NULLIF("btrim"("t"."scope"), ''::"text")) AS "concat_ws",
            (NULLIF("btrim"("t"."term"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."opos_whitelist_rules" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'categories'::"text" AS "text",
            "t"."id",
            "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("t"."code"), ''::"text"), 'Kategorie ohne Code'::"text"), NULLIF("btrim"("t"."name"), ''::"text")) AS "concat_ws",
            (COALESCE(NULLIF("btrim"("t"."code"), ''::"text"), NULLIF("btrim"("t"."name"), ''::"text")) IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."categories" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'properties'::"text" AS "text",
            "t"."id",
            COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), NULLIF("btrim"("t"."code"), ''::"text"), 'Objekt ohne Namen'::"text") AS "coalesce",
            (COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), NULLIF("btrim"("t"."code"), ''::"text")) IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."properties" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'companies'::"text" AS "text",
            "t"."id",
            COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), 'Gesellschaft ohne Namen'::"text") AS "coalesce",
            (NULLIF("btrim"("t"."name"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."companies" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)
        UNION ALL
         SELECT 'approvers'::"text" AS "text",
            "t"."id",
            COALESCE(NULLIF("btrim"("t"."name"), ''::"text"), 'Genehmiger ohne Namen'::"text") AS "coalesce",
            (NULLIF("btrim"("t"."name"), ''::"text") IS NOT NULL),
            "t"."deleted_at",
            "t"."deleted_by",
            "t"."delete_reason"
           FROM "public"."approvers" "t"
          WHERE ("t"."deleted_at" IS NOT NULL)) "trash"
  WHERE "public"."is_admin"();


ALTER VIEW "public"."v_trash_base" OWNER TO "postgres";

--
-- Name: v_trash; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."v_trash" WITH ("security_invoker"='true') AS
 SELECT "v_trash_base"."table_name",
    "v_trash_base"."id",
    "v_trash_base"."label",
    "v_trash_base"."deleted_at",
    "v_trash_base"."deleted_by",
    "v_trash_base"."delete_reason"
   FROM "public"."v_trash_base"
UNION ALL
 SELECT 'supplier_bank_accounts'::"text" AS "table_name",
    "a"."id",
    "concat_ws"(' · '::"text", COALESCE(NULLIF("btrim"("s"."name"), ''::"text"), 'Lieferant unbekannt'::"text"), "btrim"("regexp_replace"("a"."iban", '(.{4})'::"text", '\1 '::"text", 'g'::"text")), NULLIF("btrim"(COALESCE("a"."bank_name", ''::"text")), ''::"text")) AS "label",
    "a"."deleted_at",
    "a"."deleted_by",
    "a"."delete_reason"
   FROM ("public"."supplier_bank_accounts" "a"
     JOIN "public"."suppliers" "s" ON (("s"."id" = "a"."supplier_id")))
  WHERE (("a"."deleted_at" IS NOT NULL) AND ("s"."deleted_at" IS NULL));


ALTER VIEW "public"."v_trash" OWNER TO "postgres";

--
-- Name: vat_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vat_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "country" "text",
    "rate" numeric(5,2) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "text",
    "delete_reason" "text"
);


ALTER TABLE "public"."vat_rates" OWNER TO "postgres";

--
-- Name: ai_search_usage ai_search_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_search_usage"
    ADD CONSTRAINT "ai_search_usage_pkey" PRIMARY KEY ("id");


--
-- Name: app_users app_users_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_auth_user_id_key" UNIQUE ("auth_user_id");


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");


--
-- Name: approval_rules approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id");


--
-- Name: approvers approvers_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approvers"
    ADD CONSTRAINT "approvers_name_key" UNIQUE ("name");


--
-- Name: approvers approvers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approvers"
    ADD CONSTRAINT "approvers_pkey" PRIMARY KEY ("id");


--
-- Name: assignment_rules assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assignment_rules"
    ADD CONSTRAINT "assignment_rules_pkey" PRIMARY KEY ("id");


--
-- Name: bank_accounts bank_accounts_connection_id_banksapi_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_connection_id_banksapi_product_id_key" UNIQUE ("connection_id", "banksapi_product_id");


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: bank_connections bank_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_connections"
    ADD CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id");


--
-- Name: bank_providers bank_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_providers"
    ADD CONSTRAINT "bank_providers_pkey" PRIMARY KEY ("id");


--
-- Name: bank_sync_logs bank_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_sync_logs"
    ADD CONSTRAINT "bank_sync_logs_pkey" PRIMARY KEY ("id");


--
-- Name: bank_transactions bank_transactions_account_id_banksapi_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_account_id_banksapi_hash_key" UNIQUE ("account_id", "banksapi_hash");


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: bwa_account_mapping bwa_account_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bwa_account_mapping"
    ADD CONSTRAINT "bwa_account_mapping_pkey" PRIMARY KEY ("id");


--
-- Name: categories bwa_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "bwa_categories_pkey" PRIMARY KEY ("id");


--
-- Name: category_aliases bwa_category_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."category_aliases"
    ADD CONSTRAINT "bwa_category_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: change_history change_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."change_history"
    ADD CONSTRAINT "change_history_pkey" PRIMARY KEY ("id");


--
-- Name: companies companies_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_code_key" UNIQUE ("code");


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");


--
-- Name: datev_handover_batches datev_handover_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."datev_handover_batches"
    ADD CONSTRAINT "datev_handover_batches_pkey" PRIMARY KEY ("id");


--
-- Name: datev_routes datev_routes_company_id_direction_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."datev_routes"
    ADD CONSTRAINT "datev_routes_company_id_direction_key" UNIQUE ("company_id", "direction");


--
-- Name: datev_routes datev_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."datev_routes"
    ADD CONSTRAINT "datev_routes_pkey" PRIMARY KEY ("id");


--
-- Name: entity_aliases entity_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: filename_settings filename_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."filename_settings"
    ADD CONSTRAINT "filename_settings_pkey" PRIMARY KEY ("id");


--
-- Name: filing_placements filing_placements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."filing_placements"
    ADD CONSTRAINT "filing_placements_pkey" PRIMARY KEY ("id");


--
-- Name: imported_items imported_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."imported_items"
    ADD CONSTRAINT "imported_messages_pkey" PRIMARY KEY ("source_item_id", "attachment_id");


--
-- Name: ingest_exclusions ingest_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingest_exclusions"
    ADD CONSTRAINT "ingest_exclusions_pkey" PRIMARY KEY ("id");


--
-- Name: document_bank_accounts invoice_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_bank_accounts"
    ADD CONSTRAINT "invoice_bank_accounts_pkey" PRIMARY KEY ("document_id", "supplier_bank_account_id");


--
-- Name: document_files invoice_files_id_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "invoice_files_id_pkey" PRIMARY KEY ("id");


--
-- Name: document_files invoice_files_invoice_role_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "invoice_files_invoice_role_uniq" UNIQUE ("document_id", "role");


--
-- Name: document_history invoice_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_history"
    ADD CONSTRAINT "invoice_history_pkey" PRIMARY KEY ("id");


--
-- Name: document_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_line_items"
    ADD CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id");


--
-- Name: document_taxes invoice_tax_invoice_id_rate_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_taxes"
    ADD CONSTRAINT "invoice_tax_invoice_id_rate_key" UNIQUE ("document_id", "rate");


--
-- Name: document_taxes invoice_tax_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_taxes"
    ADD CONSTRAINT "invoice_tax_pkey" PRIMARY KEY ("id");


--
-- Name: invoice_transaction_matches invoice_transaction_matches_invoice_id_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_transaction_matches"
    ADD CONSTRAINT "invoice_transaction_matches_invoice_id_transaction_id_key" UNIQUE ("document_id", "transaction_id");


--
-- Name: invoice_transaction_matches invoice_transaction_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_transaction_matches"
    ADD CONSTRAINT "invoice_transaction_matches_pkey" PRIMARY KEY ("id");


--
-- Name: documents invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");


--
-- Name: mail_settings mail_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mail_settings"
    ADD CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("provider");


--
-- Name: manual_bookings manual_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."manual_bookings"
    ADD CONSTRAINT "manual_bookings_pkey" PRIMARY KEY ("id");


--
-- Name: matching_settings matching_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matching_settings"
    ADD CONSTRAINT "matching_settings_pkey" PRIMARY KEY ("id");


--
-- Name: notification_channels notification_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_channels"
    ADD CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("key");


--
-- Name: notification_dispatch_log notification_dispatch_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_dispatch_log"
    ADD CONSTRAINT "notification_dispatch_log_pkey" PRIMARY KEY ("id");


--
-- Name: notification_events notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id");


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id");


--
-- Name: notification_target_kinds notification_target_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_target_kinds"
    ADD CONSTRAINT "notification_target_kinds_pkey" PRIMARY KEY ("kind");


--
-- Name: opos_whitelist_rules opos_whitelist_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opos_whitelist_rules"
    ADD CONSTRAINT "opos_whitelist_rules_pkey" PRIMARY KEY ("id");


--
-- Name: outgoing_invoice_files outgoing_invoice_files_outgoing_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_files"
    ADD CONSTRAINT "outgoing_invoice_files_outgoing_invoice_id_key" UNIQUE ("outgoing_invoice_id");


--
-- Name: outgoing_invoice_files outgoing_invoice_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_files"
    ADD CONSTRAINT "outgoing_invoice_files_pkey" PRIMARY KEY ("id");


--
-- Name: outgoing_invoice_transaction_matches outgoing_invoice_transaction__outgoing_invoice_id_transacti_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_transaction_matches"
    ADD CONSTRAINT "outgoing_invoice_transaction__outgoing_invoice_id_transacti_key" UNIQUE ("outgoing_invoice_id", "transaction_id");


--
-- Name: outgoing_invoice_transaction_matches outgoing_invoice_transaction_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_transaction_matches"
    ADD CONSTRAINT "outgoing_invoice_transaction_matches_pkey" PRIMARY KEY ("id");


--
-- Name: outgoing_invoices outgoing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoices"
    ADD CONSTRAINT "outgoing_invoices_pkey" PRIMARY KEY ("id");


--
-- Name: read_cursors package_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."read_cursors"
    ADD CONSTRAINT "package_bookmarks_pkey" PRIMARY KEY ("channel_key", "identity", "folder_id");


--
-- Name: package_migrations package_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."package_migrations"
    ADD CONSTRAINT "package_migrations_pkey" PRIMARY KEY ("version");


--
-- Name: payment_orders payment_orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_idempotency_key_key" UNIQUE ("idempotency_key");


--
-- Name: payment_orders payment_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id");


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("key");


--
-- Name: pipeline_run_requests pipeline_run_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_run_requests"
    ADD CONSTRAINT "pipeline_run_requests_pkey" PRIMARY KEY ("id");


--
-- Name: pipeline_runs pipeline_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_runs"
    ADD CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id");


--
-- Name: pipeline_settings pipeline_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_settings"
    ADD CONSTRAINT "pipeline_settings_pkey" PRIMARY KEY ("only_row");


--
-- Name: pleo_accounts pleo_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pleo_accounts"
    ADD CONSTRAINT "pleo_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: pleo_tags pleo_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pleo_tags"
    ADD CONSTRAINT "pleo_tags_pkey" PRIMARY KEY ("id");


--
-- Name: processing_log processing_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processing_log"
    ADD CONSTRAINT "processing_log_pkey" PRIMARY KEY ("id");


--
-- Name: properties properties_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_code_key" UNIQUE ("code");


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "properties_pkey" PRIMARY KEY ("id");


--
-- Name: property_companies property_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."property_companies"
    ADD CONSTRAINT "property_companies_pkey" PRIMARY KEY ("id");


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_key");


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("id");


--
-- Name: supplier_bank_accounts supplier_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplier_bank_accounts"
    ADD CONSTRAINT "supplier_bank_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: supplier_iban_history supplier_iban_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplier_iban_history"
    ADD CONSTRAINT "supplier_iban_history_pkey" PRIMARY KEY ("id");


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");


--
-- Name: tour_progress tour_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tour_progress"
    ADD CONSTRAINT "tour_progress_pkey" PRIMARY KEY ("user_id", "tour_id");


--
-- Name: user_company_access user_company_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_company_access"
    ADD CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("id");


--
-- Name: user_company_access user_company_access_user_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_company_access"
    ADD CONSTRAINT "user_company_access_user_id_company_id_key" UNIQUE ("user_id", "company_id");


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id", "permission_key");


--
-- Name: vat_rates vat_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vat_rates"
    ADD CONSTRAINT "vat_rates_pkey" PRIMARY KEY ("id");


--
-- Name: ai_search_usage_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_search_usage_created_at" ON "public"."ai_search_usage" USING "btree" ("created_at" DESC);


--
-- Name: ai_search_usage_search_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ai_search_usage_search_id" ON "public"."ai_search_usage" USING "btree" ("search_id");


--
-- Name: app_users_email_lower_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "app_users_email_lower_idx" ON "public"."app_users" USING "btree" ("lower"("email"));


--
-- Name: app_users_one_active_per_area; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "app_users_one_active_per_area" ON "public"."app_users" USING "btree" ("area") WHERE (("area" IS NOT NULL) AND "is_active");


--
-- Name: app_users_role_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "app_users_role_id_idx" ON "public"."app_users" USING "btree" ("role_id");


--
-- Name: approval_rules_scope_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "approval_rules_scope_unique" ON "public"."approval_rules" USING "btree" ("supplier_id", "property_id", "company_id", "min_amount") NULLS NOT DISTINCT WHERE ("deleted_at" IS NULL);


--
-- Name: approvers_app_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "approvers_app_user_id_key" ON "public"."approvers" USING "btree" ("app_user_id") WHERE ("app_user_id" IS NOT NULL);


--
-- Name: approvers_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "approvers_deleted_at_idx" ON "public"."approvers" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);


--
-- Name: approvers_one_active_per_area; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "approvers_one_active_per_area" ON "public"."approvers" USING "btree" ("area") WHERE ("is_active" AND ("area" IS NOT NULL));


--
-- Name: assignment_rules_scope_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "assignment_rules_scope_unique" ON "public"."assignment_rules" USING "btree" ("target", "supplier_id", "property_id", "company_id", "lower"("btrim"("reference_pattern"))) NULLS NOT DISTINCT WHERE ("deleted_at" IS NULL);


--
-- Name: bank_accounts_connection_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_accounts_connection_idx" ON "public"."bank_accounts" USING "btree" ("connection_id");


--
-- Name: bank_accounts_excluded_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_accounts_excluded_idx" ON "public"."bank_accounts" USING "btree" ("excluded_at") WHERE ("excluded_at" IS NOT NULL);


--
-- Name: bank_accounts_iban_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bank_accounts_iban_uniq" ON "public"."bank_accounts" USING "btree" ("regexp_replace"("lower"("iban"), '[^a-z0-9]'::"text", ''::"text", 'g'::"text")) WHERE (("deleted_at" IS NULL) AND ("iban" IS NOT NULL) AND (COALESCE("is_sandbox", false) = false));


--
-- Name: bank_accounts_inactive_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_accounts_inactive_idx" ON "public"."bank_accounts" USING "btree" ("id") WHERE (NOT "is_active");


--
-- Name: bank_accounts_provider_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_accounts_provider_idx" ON "public"."bank_accounts" USING "btree" ("provider_id");


--
-- Name: bank_connections_bank_provider_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_connections_bank_provider_idx" ON "public"."bank_connections" USING "btree" ("bank_provider_id");


--
-- Name: bank_providers_bank_name_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bank_providers_bank_name_uniq" ON "public"."bank_providers" USING "btree" ("bank_name");


--
-- Name: bank_providers_banksapi_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_providers_banksapi_idx" ON "public"."bank_providers" USING "btree" ("banksapi_provider_id");


--
-- Name: bank_sync_logs_run_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_sync_logs_run_idx" ON "public"."bank_sync_logs" USING "btree" ("run_id");


--
-- Name: bank_transactions_account_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_account_idx" ON "public"."bank_transactions" USING "btree" ("account_id");


--
-- Name: bank_transactions_betrag_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_betrag_idx" ON "public"."bank_transactions" USING "btree" ("amount");


--
-- Name: bank_transactions_buchungsdatum_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_buchungsdatum_idx" ON "public"."bank_transactions" USING "btree" ("booking_date");


--
-- Name: bank_transactions_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_company_idx" ON "public"."bank_transactions" USING "btree" ("company_id");


--
-- Name: bank_transactions_fts_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_fts_idx" ON "public"."bank_transactions" USING "gin" ("fts");


--
-- Name: bank_transactions_matching_status_booking_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_matching_status_booking_date_idx" ON "public"."bank_transactions" USING "btree" ("matching_status", "booking_date" DESC);


--
-- Name: bank_transactions_matching_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_matching_status_idx" ON "public"."bank_transactions" USING "btree" ("matching_status");


--
-- Name: bank_transactions_pleo_tag_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_pleo_tag_idx" ON "public"."bank_transactions" USING "btree" ("pleo_tag_id") WHERE ("pleo_tag_id" IS NOT NULL);


--
-- Name: bank_transactions_rohdaten_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_rohdaten_idx" ON "public"."bank_transactions" USING "gin" ("raw_data");


--
-- Name: bank_transactions_source_external_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bank_transactions_source_external_idx" ON "public"."bank_transactions" USING "btree" ("source", "external_id");


--
-- Name: INDEX "bank_transactions_source_external_idx"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."bank_transactions_source_external_idx" IS 'Dedup key for pleo/manual rows and the ON CONFLICT target for their sync. NOT partial: a partial index cannot be inferred by PostgREST upserts. NULL external_id (BANKSapi rows) stays unconstrained because Postgres treats NULLs as distinct.';


--
-- Name: bank_transactions_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_source_idx" ON "public"."bank_transactions" USING "btree" ("source");


--
-- Name: bank_transactions_spender_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_spender_email_idx" ON "public"."bank_transactions" USING "btree" ("spender_email") WHERE ("spender_email" IS NOT NULL);


--
-- Name: bank_transactions_transaction_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_transaction_type_idx" ON "public"."bank_transactions" USING "btree" ("transaction_type");


--
-- Name: bank_transactions_transaction_type_null_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_transaction_type_null_idx" ON "public"."bank_transactions" USING "btree" ("id") WHERE ("transaction_type" IS NULL);


--
-- Name: bank_transactions_whitelist_rule_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bank_transactions_whitelist_rule_idx" ON "public"."bank_transactions" USING "btree" ("whitelist_rule_id");


--
-- Name: bwa_account_mapping_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_account_mapping_category" ON "public"."bwa_account_mapping" USING "btree" ("category_id");


--
-- Name: bwa_account_mapping_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_account_mapping_company" ON "public"."bwa_account_mapping" USING "btree" ("company_id");


--
-- Name: bwa_account_mapping_year_account_company_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bwa_account_mapping_year_account_company_uniq" ON "public"."bwa_account_mapping" USING "btree" ("fiscal_year", "account", "company_id");


--
-- Name: bwa_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_categories_active" ON "public"."categories" USING "btree" ("parent_id") WHERE ("is_active" AND ("deleted_at" IS NULL));


--
-- Name: bwa_categories_code_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bwa_categories_code_uniq" ON "public"."categories" USING "btree" ("code");


--
-- Name: bwa_categories_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_categories_parent" ON "public"."categories" USING "btree" ("parent_id");


--
-- Name: bwa_categories_tab_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_categories_tab_order" ON "public"."categories" USING "btree" ("direction", "parent_id", "sort_order") WHERE ("deleted_at" IS NULL);


--
-- Name: bwa_category_aliases_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "bwa_category_aliases_lookup" ON "public"."category_aliases" USING "btree" ("category_id") WHERE "is_active";


--
-- Name: bwa_category_aliases_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "bwa_category_aliases_uniq" ON "public"."category_aliases" USING "btree" ("lower"("btrim"("alias")));


--
-- Name: change_history_record_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "change_history_record_idx" ON "public"."change_history" USING "btree" ("table_name", "record_id");


--
-- Name: companies_drive_folder_id_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "companies_drive_folder_id_uniq" ON "public"."companies" USING "btree" ("lower"("drive_folder_id")) WHERE (("drive_folder_id" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: datev_handover_batches_open_bounce_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "datev_handover_batches_open_bounce_idx" ON "public"."datev_handover_batches" USING "btree" ("created_at" DESC) WHERE (("status" = 'bounced'::"text") AND ("acknowledged_at" IS NULL));


--
-- Name: entity_aliases_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "entity_aliases_lookup_idx" ON "public"."entity_aliases" USING "btree" ("entity_type") WHERE "is_active";


--
-- Name: entity_aliases_one_owner_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "entity_aliases_one_owner_uniq" ON "public"."entity_aliases" USING "btree" ("entity_type", "regexp_replace"("lower"("btrim"("alias")), '\s+'::"text", ' '::"text", 'g'::"text")) WHERE ("is_active" AND ("btrim"(COALESCE("alias", ''::"text")) <> ''::"text") AND ("deleted_at" IS NULL));


--
-- Name: INDEX "entity_aliases_one_owner_uniq"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."entity_aliases_one_owner_uniq" IS 'One alias names one entity. Without it the Hub accepts a second claim and the pipeline then resolves that alias to nothing, silencing the entity that had it first.';


--
-- Name: entity_aliases_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "entity_aliases_uniq" ON "public"."entity_aliases" USING "btree" ("entity_type", "entity_code", "alias") WHERE "is_active";


--
-- Name: filing_placements_channel_status_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "filing_placements_channel_status_uniq" ON "public"."filing_placements" USING "btree" ("channel", "workflow_status") WHERE "is_active";


--
-- Name: idx_approval_rules_resolve; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_approval_rules_resolve" ON "public"."approval_rules" USING "btree" ("specificity" DESC) WHERE ("is_active" AND ("deleted_at" IS NULL));


--
-- Name: idx_assignment_rules_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assignment_rules_category" ON "public"."assignment_rules" USING "btree" ("category_id");


--
-- Name: idx_assignment_rules_resolve; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assignment_rules_resolve" ON "public"."assignment_rules" USING "btree" ("target", "specificity" DESC) WHERE ("is_active" AND ("deleted_at" IS NULL));


--
-- Name: idx_assignment_rules_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_assignment_rules_supplier" ON "public"."assignment_rules" USING "btree" ("supplier_id") WHERE ("supplier_id" IS NOT NULL);


--
-- Name: idx_bank_transactions_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bank_transactions_category" ON "public"."bank_transactions" USING "btree" ("category_id");


--
-- Name: idx_belege_beleg_datum; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_beleg_datum" ON "public"."documents" USING "btree" ("document_date");


--
-- Name: idx_belege_belegart; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_belegart" ON "public"."documents" USING "btree" ("document_type");


--
-- Name: idx_belege_bezahlt_am; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_bezahlt_am" ON "public"."documents" USING "btree" ("paid_at");


--
-- Name: idx_belege_gesellschaft_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_gesellschaft_code" ON "public"."documents" USING "btree" ("company_code");


--
-- Name: idx_belege_live_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_live_created" ON "public"."documents" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);


--
-- Name: idx_belege_objekt_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_objekt_code" ON "public"."documents" USING "btree" ("property_code");


--
-- Name: idx_belege_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_belege_status" ON "public"."documents" USING "btree" ("status");


--
-- Name: idx_customers_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_customers_company_id" ON "public"."customers" USING "btree" ("company_id");


--
-- Name: idx_customers_live; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_customers_live" ON "public"."customers" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_invoices_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_active" ON "public"."documents" USING "btree" ("created_at" DESC) WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL));


--
-- Name: idx_invoices_approved_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_approved_by" ON "public"."documents" USING "btree" ("approved_by") WHERE ("approved_by" IS NOT NULL);


--
-- Name: idx_invoices_archived; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_archived" ON "public"."documents" USING "btree" ("archived_at" DESC) WHERE ("archived_at" IS NOT NULL);


--
-- Name: idx_invoices_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_category" ON "public"."documents" USING "btree" ("category_id");


--
-- Name: idx_invoices_company_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_company_code" ON "public"."documents" USING "btree" ("company_code");


--
-- Name: idx_invoices_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_company_id" ON "public"."documents" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_invoices_document_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_document_date" ON "public"."documents" USING "btree" ("document_date");


--
-- Name: idx_invoices_document_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_document_type" ON "public"."documents" USING "btree" ("document_type");


--
-- Name: idx_invoices_due_date_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_due_date_open" ON "public"."documents" USING "btree" ("due_date") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("due_date" IS NOT NULL));


--
-- Name: idx_invoices_early_payment_deadline; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_early_payment_deadline" ON "public"."documents" USING "btree" ("early_payment_deadline") WHERE (("deleted_at" IS NULL) AND ("paid_at" IS NULL) AND ("early_payment_deadline" IS NOT NULL));


--
-- Name: idx_invoices_live_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_live_created" ON "public"."documents" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);


--
-- Name: idx_invoices_mailbox_return_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_mailbox_return_pending" ON "public"."documents" USING "btree" ("not_relevant_at") WHERE (("not_relevant_at" IS NOT NULL) AND ("mailbox_reset_at" IS NULL));


--
-- Name: idx_invoices_not_relevant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_not_relevant" ON "public"."documents" USING "btree" ("not_relevant_at" DESC) WHERE ("not_relevant_at" IS NOT NULL);


--
-- Name: idx_invoices_paid_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_paid_at" ON "public"."documents" USING "btree" ("paid_at");


--
-- Name: idx_invoices_pay_now; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_pay_now" ON "public"."documents" USING "btree" ("due_date") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("paid_at" IS NULL) AND (NOT "public"."is_direct_debit"("payment_method")));


--
-- Name: idx_invoices_property_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_property_code" ON "public"."documents" USING "btree" ("property_code");


--
-- Name: idx_invoices_property_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_property_id" ON "public"."documents" USING "btree" ("property_id") WHERE ("deleted_at" IS NULL);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_status" ON "public"."documents" USING "btree" ("status");


--
-- Name: idx_invoices_vat_conflict; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_invoices_vat_conflict" ON "public"."documents" USING "btree" ("vat_conflict_at") WHERE ("vat_conflict_at" IS NOT NULL);


--
-- Name: idx_itm_invoice_confirmed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_itm_invoice_confirmed" ON "public"."invoice_transaction_matches" USING "btree" ("document_id") WHERE ("status" = 'bestaetigt'::"text");


--
-- Name: idx_outgoing_invoice_files_invoice_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outgoing_invoice_files_invoice_id" ON "public"."outgoing_invoice_files" USING "btree" ("outgoing_invoice_id");


--
-- Name: idx_outgoing_invoices_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outgoing_invoices_company_id" ON "public"."outgoing_invoices" USING "btree" ("company_id");


--
-- Name: idx_outgoing_invoices_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outgoing_invoices_customer_id" ON "public"."outgoing_invoices" USING "btree" ("customer_id");


--
-- Name: idx_outgoing_invoices_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_outgoing_invoices_status" ON "public"."outgoing_invoices" USING "btree" ("voucher_status");


--
-- Name: idx_payment_orders_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payment_orders_company" ON "public"."payment_orders" USING "btree" ("company_id");


--
-- Name: idx_payment_orders_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payment_orders_invoice" ON "public"."payment_orders" USING "btree" ("document_id");


--
-- Name: idx_payment_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_payment_orders_status" ON "public"."payment_orders" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending_sca'::"text", 'authorized'::"text"]));


--
-- Name: idx_supplier_iban_history_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_supplier_iban_history_supplier" ON "public"."supplier_iban_history" USING "btree" ("supplier_id", "changed_at" DESC);


--
-- Name: idx_user_company_access_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_company_access_company" ON "public"."user_company_access" USING "btree" ("company_id");


--
-- Name: imported_messages_content_anchor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "imported_messages_content_anchor_idx" ON "public"."imported_items" USING "btree" ("content_anchor") WHERE ("content_anchor" IS NOT NULL);


--
-- Name: imported_messages_content_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "imported_messages_content_hash_idx" ON "public"."imported_items" USING "btree" ("content_hash") WHERE ("content_hash" IS NOT NULL);


--
-- Name: ingest_exclusions_term_scope_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ingest_exclusions_term_scope_uniq" ON "public"."ingest_exclusions" USING "btree" ("lower"("term"), "scope");


--
-- Name: invoice_bank_accounts_account_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_bank_accounts_account_idx" ON "public"."document_bank_accounts" USING "btree" ("supplier_bank_account_id");


--
-- Name: invoice_files_invoice_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_files_invoice_idx" ON "public"."document_files" USING "btree" ("document_id");


--
-- Name: invoice_files_source_external_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "invoice_files_source_external_idx" ON "public"."document_files" USING "btree" ("source", "external_id") WHERE ("external_id" IS NOT NULL);


--
-- Name: invoice_files_transaction_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_files_transaction_id_idx" ON "public"."document_files" USING "btree" ("transaction_id") WHERE ("transaction_id" IS NOT NULL);


--
-- Name: invoice_history_invoice_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_history_invoice_idx" ON "public"."document_history" USING "btree" ("document_id");


--
-- Name: invoice_line_items_invoice_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_line_items_invoice_idx" ON "public"."document_line_items" USING "btree" ("document_id");


--
-- Name: invoice_tax_invoice_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoice_tax_invoice_idx" ON "public"."document_taxes" USING "btree" ("document_id");


--
-- Name: invoices_active_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_active_created_at_idx" ON "public"."documents" USING "btree" ("created_at") WHERE (("deleted_at" IS NULL) AND ("archived_at" IS NULL) AND ("not_relevant_at" IS NULL));


--
-- Name: invoices_assigned_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_assigned_user_idx" ON "public"."documents" USING "btree" ("assigned_user_id") WHERE (("assigned_user_id" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: invoices_document_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_document_date_idx" ON "public"."documents" USING "btree" ("document_date");


--
-- Name: invoices_due_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_due_date_idx" ON "public"."documents" USING "btree" ("due_date") WHERE ("due_date" IS NOT NULL);


--
-- Name: invoices_fts_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_fts_idx" ON "public"."documents" USING "gin" ("fts");


--
-- Name: invoices_source_document_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_source_document_idx" ON "public"."documents" USING "btree" ("source_document_id");


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_status_idx" ON "public"."documents" USING "btree" ("status");


--
-- Name: invoices_supplier_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_supplier_idx" ON "public"."documents" USING "btree" ("supplier_id");


--
-- Name: invoices_traffic_light_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_traffic_light_idx" ON "public"."documents" USING "btree" ("traffic_light");


--
-- Name: invoices_uploaded_for_transaction_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_uploaded_for_transaction_idx" ON "public"."documents" USING "btree" ("uploaded_for_transaction_id") WHERE ("uploaded_for_transaction_id" IS NOT NULL);


--
-- Name: lieferanten_iban_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lieferanten_iban_idx" ON "public"."suppliers" USING "btree" ("iban");


--
-- Name: lieferanten_normalized_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lieferanten_normalized_name_idx" ON "public"."suppliers" USING "btree" ("normalized_name");


--
-- Name: lieferanten_ust_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lieferanten_ust_id_idx" ON "public"."suppliers" USING "btree" ("vat_id");


--
-- Name: manual_bookings_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "manual_bookings_category" ON "public"."manual_bookings" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);


--
-- Name: manual_bookings_company_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "manual_bookings_company_period" ON "public"."manual_bookings" USING "btree" ("company_id", "period") WHERE ("deleted_at" IS NULL);


--
-- Name: matches_beleg_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_beleg_idx" ON "public"."invoice_transaction_matches" USING "btree" ("document_id");


--
-- Name: matches_invoice_confirmed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_invoice_confirmed_idx" ON "public"."invoice_transaction_matches" USING "btree" ("document_id") WHERE ("status" = 'bestaetigt'::"text");


--
-- Name: matches_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_status_idx" ON "public"."invoice_transaction_matches" USING "btree" ("status");


--
-- Name: matches_transaction_confirmed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_transaction_confirmed_idx" ON "public"."invoice_transaction_matches" USING "btree" ("transaction_id") WHERE ("status" = 'bestaetigt'::"text");


--
-- Name: matches_transaction_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_transaction_idx" ON "public"."invoice_transaction_matches" USING "btree" ("transaction_id");


--
-- Name: matches_transaction_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_transaction_status_idx" ON "public"."invoice_transaction_matches" USING "btree" ("transaction_id", "status");


--
-- Name: matches_transaction_suggested_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "matches_transaction_suggested_idx" ON "public"."invoice_transaction_matches" USING "btree" ("transaction_id") WHERE ("status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text"]));


--
-- Name: notification_dispatch_log_started_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "notification_dispatch_log_started_idx" ON "public"."notification_dispatch_log" USING "btree" ("started_at" DESC);


--
-- Name: notification_events_recipient_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "notification_events_recipient_idx" ON "public"."notification_events" USING "btree" ("recipient_user_id", "created_at" DESC);


--
-- Name: notification_events_unacknowledged_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "notification_events_unacknowledged_idx" ON "public"."notification_events" USING "btree" ("recipient_user_id", "created_at" DESC) WHERE ("acknowledged_at" IS NULL);


--
-- Name: notification_events_undelivered_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "notification_events_undelivered_idx" ON "public"."notification_events" USING "btree" ("created_at") WHERE ("delivered" = '{}'::"jsonb");


--
-- Name: opos_whitelist_rules_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "opos_whitelist_rules_active_idx" ON "public"."opos_whitelist_rules" USING "btree" ("is_active") WHERE ("deleted_at" IS NULL);


--
-- Name: opos_whitelist_rules_term_scope_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "opos_whitelist_rules_term_scope_uniq" ON "public"."opos_whitelist_rules" USING "btree" ("lower"("term"), "scope");


--
-- Name: outgoing_matches_invoice_confirmed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_invoice_confirmed_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("outgoing_invoice_id") WHERE ("status" = 'bestaetigt'::"text");


--
-- Name: outgoing_matches_invoice_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_invoice_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("outgoing_invoice_id");


--
-- Name: outgoing_matches_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_status_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("status");


--
-- Name: outgoing_matches_transaction_confirmed_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_transaction_confirmed_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("transaction_id") WHERE ("status" = 'bestaetigt'::"text");


--
-- Name: outgoing_matches_transaction_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_transaction_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("transaction_id");


--
-- Name: outgoing_matches_transaction_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_transaction_status_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("transaction_id", "status");


--
-- Name: outgoing_matches_transaction_suggested_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "outgoing_matches_transaction_suggested_idx" ON "public"."outgoing_invoice_transaction_matches" USING "btree" ("transaction_id") WHERE ("status" = ANY (ARRAY['kandidat'::"text", 'auto'::"text"]));


--
-- Name: pipeline_run_requests_one_waiting_per_question; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "pipeline_run_requests_one_waiting_per_question" ON "public"."pipeline_run_requests" USING "btree" ("channel", COALESCE("folders", '{}'::"text"[])) WHERE ("status" = 'pending'::"text");


--
-- Name: pipeline_run_requests_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pipeline_run_requests_recent" ON "public"."pipeline_run_requests" USING "btree" ("channel", "requested_at" DESC);


--
-- Name: pipeline_run_requests_waiting; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pipeline_run_requests_waiting" ON "public"."pipeline_run_requests" USING "btree" ("requested_at") WHERE ("status" = 'pending'::"text");


--
-- Name: pipeline_runs_source_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pipeline_runs_source_started" ON "public"."pipeline_runs" USING "btree" ("source", "started_at" DESC);


--
-- Name: pipeline_runs_source_started_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pipeline_runs_source_started_idx" ON "public"."pipeline_runs" USING "btree" ("source", "started_at" DESC);


--
-- Name: pipeline_runs_started_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pipeline_runs_started_idx" ON "public"."pipeline_runs" USING "btree" ("started_at" DESC);


--
-- Name: pleo_accounts_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pleo_accounts_category_idx" ON "public"."pleo_accounts" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);


--
-- Name: pleo_tags_group_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pleo_tags_group_idx" ON "public"."pleo_tags" USING "btree" ("group_id");


--
-- Name: pleo_tags_property_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pleo_tags_property_idx" ON "public"."pleo_tags" USING "btree" ("property_id") WHERE ("property_id" IS NOT NULL);


--
-- Name: properties_drive_folder_id_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "properties_drive_folder_id_uniq" ON "public"."properties" USING "btree" ("lower"("drive_folder_id")) WHERE (("drive_folder_id" IS NOT NULL) AND ("deleted_at" IS NULL));


--
-- Name: property_companies_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "property_companies_active_unique" ON "public"."property_companies" USING "btree" ("property_id", "company_id") WHERE ("deleted_at" IS NULL);


--
-- Name: INDEX "property_companies_active_unique"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."property_companies_active_unique" IS 'A property may only link to the same company once among ACTIVE rows. Partial (deleted_at is null) so re-adding a previously soft-deleted company link does not collide with the old row (migration 0084 -- 0083''s original constraint was not partial).';


--
-- Name: property_companies_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "property_companies_company_idx" ON "public"."property_companies" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);


--
-- Name: property_companies_property_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "property_companies_property_idx" ON "public"."property_companies" USING "btree" ("property_id") WHERE ("deleted_at" IS NULL);


--
-- Name: supplier_bank_accounts_live_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "supplier_bank_accounts_live_idx" ON "public"."supplier_bank_accounts" USING "btree" ("supplier_id") WHERE ("deleted_at" IS NULL);


--
-- Name: supplier_bank_accounts_one_default_per_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "supplier_bank_accounts_one_default_per_supplier" ON "public"."supplier_bank_accounts" USING "btree" ("supplier_id") WHERE "is_default";


--
-- Name: supplier_bank_accounts_one_per_iban; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "supplier_bank_accounts_one_per_iban" ON "public"."supplier_bank_accounts" USING "btree" ("supplier_id", "iban");


--
-- Name: supplier_bank_accounts_supplier_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "supplier_bank_accounts_supplier_idx" ON "public"."supplier_bank_accounts" USING "btree" ("supplier_id") WHERE "is_active";


--
-- Name: suppliers_iban_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "suppliers_iban_idx" ON "public"."suppliers" USING "btree" ("iban");


--
-- Name: suppliers_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "suppliers_name_idx" ON "public"."suppliers" USING "btree" ("lower"("name"));


--
-- Name: suppliers_normalized_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "suppliers_normalized_name_idx" ON "public"."suppliers" USING "btree" ("normalized_name");


--
-- Name: suppliers_normalized_vat_ids_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "suppliers_normalized_vat_ids_idx" ON "public"."suppliers" USING "gin" ("normalized_vat_ids");


--
-- Name: suppliers_vat_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "suppliers_vat_id_idx" ON "public"."suppliers" USING "btree" ("vat_id");


--
-- Name: vat_rates_country_rate_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "vat_rates_country_rate_idx" ON "public"."vat_rates" USING "btree" ("country", "rate");


--
-- Name: app_users app_users_super_admin_no_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "app_users_super_admin_no_delete" BEFORE DELETE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_super_admin_row"();


--
-- Name: app_users app_users_super_admin_no_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "app_users_super_admin_no_insert" BEFORE INSERT ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_super_admin_insert"();


--
-- Name: app_users app_users_super_admin_stays_active; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "app_users_super_admin_stays_active" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_super_admin_row"();


--
-- Name: companies companies_code_rename_cascade; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "companies_code_rename_cascade" AFTER UPDATE OF "code" ON "public"."companies" FOR EACH ROW WHEN (("old"."code" IS DISTINCT FROM "new"."code")) EXECUTE FUNCTION "public"."cascade_company_code_rename"();


--
-- Name: documents invoices_link_uploaded_for_transaction; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "invoices_link_uploaded_for_transaction" AFTER UPDATE OF "amount_gross" ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."link_uploaded_invoice_when_extracted"();


--
-- Name: notification_events notification_events_dispatch_now; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "notification_events_dispatch_now" AFTER INSERT ON "public"."notification_events" FOR EACH ROW EXECUTE FUNCTION "public"."notify_dispatch_now"();


--
-- Name: pipeline_run_requests pipeline_run_requests_ring; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "pipeline_run_requests_ring" AFTER INSERT ON "public"."pipeline_run_requests" FOR EACH ROW EXECUTE FUNCTION "public"."tell_the_pipeline"();


--
-- Name: properties properties_code_rename_cascade; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "properties_code_rename_cascade" AFTER UPDATE OF "code" ON "public"."properties" FOR EACH ROW WHEN (("old"."code" IS DISTINCT FROM "new"."code")) EXECUTE FUNCTION "public"."cascade_property_code_rename"();


--
-- Name: approval_rules trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."approval_rules" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: approvers trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."approvers" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: assignment_rules trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."assignment_rules" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: categories trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."categories" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: companies trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."companies" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: customers trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."customers" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: documents trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."documents" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: ingest_exclusions trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."ingest_exclusions" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: manual_bookings trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."manual_bookings" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: opos_whitelist_rules trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."opos_whitelist_rules" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: outgoing_invoices trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."outgoing_invoices" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: properties trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."properties" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: suppliers trash_require_delete_reason; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trash_require_delete_reason" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW WHEN ((("new"."deleted_at" IS NOT NULL) AND (("old"."deleted_at" IS NULL) OR ("new"."delete_reason" IS DISTINCT FROM "old"."delete_reason")))) EXECUTE FUNCTION "public"."trash_require_delete_reason"();


--
-- Name: documents trg_advance_workflow_on_datev_handover; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_advance_workflow_on_datev_handover" AFTER UPDATE OF "datev_handed_over_at" ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."advance_workflow_on_datev_handover"();


--
-- Name: documents trg_advance_workflow_on_payment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_advance_workflow_on_payment" AFTER UPDATE OF "paid_at" ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."advance_workflow_on_payment"();


--
-- Name: bank_transactions trg_apply_opos_whitelist; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_apply_opos_whitelist" BEFORE INSERT OR UPDATE OF "payment_reference", "counterparty_holder", "counterparty_iban", "booking_text", "amount" ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."apply_opos_whitelist"();


--
-- Name: bank_accounts trg_bank_account_connect_route; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_bank_account_connect_route" BEFORE INSERT OR UPDATE OF "provider_id" ON "public"."bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_bank_account_connect_route"();


--
-- Name: bank_transactions trg_bank_transactions_categorize_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_bank_transactions_categorize_insert" AFTER INSERT ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_bank_transactions_categorize"();


--
-- Name: TRIGGER "trg_bank_transactions_categorize_insert" ON "bank_transactions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TRIGGER "trg_bank_transactions_categorize_insert" ON "public"."bank_transactions" IS 'Auto-categorizes a newly imported transaction the moment it lands, same "resolved before a human opens it" stance as trg_invoices_apply_rules_on_insert (migration 0031).';


--
-- Name: bank_transactions trg_bank_transactions_categorize_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_bank_transactions_categorize_update" AFTER UPDATE OF "counterparty_iban", "payment_reference" ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_bank_transactions_categorize"();


--
-- Name: TRIGGER "trg_bank_transactions_categorize_update" ON "bank_transactions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TRIGGER "trg_bank_transactions_categorize_update" ON "public"."bank_transactions" IS 'Re-resolves the category when the counterparty IBAN or payment reference changes (e.g. a corrected import), same guard against overwriting a human-set value.';


--
-- Name: invoice_transaction_matches trg_check_match_allocation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_check_match_allocation" BEFORE INSERT OR UPDATE ON "public"."invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."check_match_allocation"();


--
-- Name: outgoing_invoice_transaction_matches trg_check_outgoing_match_allocation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_check_outgoing_match_allocation" BEFORE INSERT OR UPDATE ON "public"."outgoing_invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."check_outgoing_match_allocation"();


--
-- Name: supplier_bank_accounts trg_compact_supplier_iban; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_compact_supplier_iban" BEFORE INSERT OR UPDATE OF "iban" ON "public"."supplier_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."compact_supplier_iban"();


--
-- Name: documents trg_enforce_invoice_write_permissions; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_enforce_invoice_write_permissions" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_invoice_write_permissions"();


--
-- Name: invoice_transaction_matches trg_enforce_match_payment_permission; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_enforce_match_payment_permission" BEFORE INSERT OR DELETE OR UPDATE ON "public"."invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_match_payment_permission"();


--
-- Name: outgoing_invoice_transaction_matches trg_enforce_match_payment_permission; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_enforce_match_payment_permission" BEFORE INSERT OR DELETE OR UPDATE ON "public"."outgoing_invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_match_payment_permission"();


--
-- Name: user_permissions trg_guard_permission_grants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_guard_permission_grants" BEFORE INSERT OR DELETE OR UPDATE ON "public"."user_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_permission_grants"();


--
-- Name: role_permissions trg_guard_role_permission_grants; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_guard_role_permission_grants" BEFORE INSERT OR DELETE OR UPDATE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_role_permission_grants"();


--
-- Name: documents trg_invoices_apply_rules_on_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_invoices_apply_rules_on_insert" AFTER INSERT ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"();


--
-- Name: TRIGGER "trg_invoices_apply_rules_on_insert" ON "documents"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TRIGGER "trg_invoices_apply_rules_on_insert" ON "public"."documents" IS 'Runs apply_assignment_rules automatically right after a new invoice is inserted, so any matching rule (and the business-line deductibility default) is already applied before a human opens the receipt. Fires once, on INSERT only -- existing invoices still rely on the manual per-receipt button or bulk apply. See migration 0031.';


--
-- Name: documents trg_invoices_vat_deductible_default; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_invoices_vat_deductible_default" BEFORE INSERT OR UPDATE OF "property_id" ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_invoices_vat_deductible_default"();


--
-- Name: TRIGGER "trg_invoices_vat_deductible_default" ON "documents"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TRIGGER "trg_invoices_vat_deductible_default" ON "public"."documents" IS 'Re-defaults vat_deductible_pct from the (new) property''s vat_status whenever property_id is set or changes, but only when the current source is NULL/ai -- a rule or human decision is never touched. Re-keyed from business_line_id by migration 0083.';


--
-- Name: supplier_bank_accounts trg_log_supplier_bank_account_event; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_log_supplier_bank_account_event" AFTER INSERT OR UPDATE OF "is_default" ON "public"."supplier_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."log_supplier_bank_account_event"();


--
-- Name: document_history trg_notify_event_from_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_notify_event_from_history" AFTER INSERT ON "public"."document_history" FOR EACH ROW EXECUTE FUNCTION "public"."notify_event_from_history"();


--
-- Name: supplier_bank_accounts trg_promote_first_bank_account_to_default; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_promote_first_bank_account_to_default" BEFORE INSERT OR UPDATE OF "is_active", "deleted_at", "is_default" ON "public"."supplier_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."promote_first_bank_account_to_default"();


--
-- Name: bank_accounts trg_propagate_account_company; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_propagate_account_company" AFTER UPDATE OF "company_id" ON "public"."bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."propagate_account_company"();


--
-- Name: supplier_bank_accounts trg_refuse_deleting_default_bank_account; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_refuse_deleting_default_bank_account" BEFORE DELETE ON "public"."supplier_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."refuse_deleting_default_bank_account"();


--
-- Name: bank_transactions trg_set_bank_transaction_company; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_set_bank_transaction_company" BEFORE INSERT OR UPDATE OF "account_id" ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_bank_transaction_company"();


--
-- Name: bank_transactions trg_set_transaction_spender; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_set_transaction_spender" BEFORE INSERT OR UPDATE OF "spender_email", "spender_name" ON "public"."bank_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_transaction_spender"();


--
-- Name: supplier_bank_accounts trg_supplier_bank_accounts_single_default; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_supplier_bank_accounts_single_default" BEFORE INSERT OR UPDATE OF "is_default", "supplier_id" ON "public"."supplier_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."supplier_bank_accounts_single_default"();


--
-- Name: supplier_bank_accounts trg_supplier_default_account_sync; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_supplier_default_account_sync" AFTER INSERT OR UPDATE OF "is_default", "iban", "bic", "bank_name" ON "public"."supplier_bank_accounts" FOR EACH ROW WHEN ("new"."is_default") EXECUTE FUNCTION "public"."supplier_default_account_sync"();


--
-- Name: suppliers trg_supplier_default_iban_sync; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_supplier_default_iban_sync" AFTER UPDATE OF "iban" ON "public"."suppliers" FOR EACH ROW WHEN (("new"."iban" IS DISTINCT FROM "old"."iban")) EXECUTE FUNCTION "public"."supplier_default_iban_sync"();


--
-- Name: invoice_transaction_matches trg_sync_invoice_paid_from_matches; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sync_invoice_paid_from_matches" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_invoice_paid_from_matches"();


--
-- Name: outgoing_invoice_transaction_matches trg_sync_outgoing_transaction_matching_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sync_outgoing_transaction_matching_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."outgoing_invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_transaction_matching_status"();


--
-- Name: invoice_transaction_matches trg_sync_transaction_matching_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sync_transaction_matching_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_transaction_matching_status"();


--
-- Name: outgoing_invoice_transaction_matches trg_sync_uploaded_outgoing_invoice_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sync_uploaded_outgoing_invoice_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."outgoing_invoice_transaction_matches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"();


--
-- Name: tour_progress trg_tour_progress_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_tour_progress_touch" BEFORE UPDATE ON "public"."tour_progress" FOR EACH ROW EXECUTE FUNCTION "public"."touch_tour_progress"();


--
-- Name: user_permissions user_permissions_super_admin; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "user_permissions_super_admin" BEFORE INSERT OR DELETE OR UPDATE ON "public"."user_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_super_admin_permissions"();


--
-- Name: app_users app_users_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: app_users app_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: app_users app_users_deputy_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_deputy_user_id_fkey" FOREIGN KEY ("deputy_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: app_users app_users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");


--
-- Name: approval_rules approval_rules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_step_1_approver_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_step_1_approver_fkey" FOREIGN KEY ("step_1_approver") REFERENCES "public"."approvers"("name");


--
-- Name: approval_rules approval_rules_step_1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_step_1_user_id_fkey" FOREIGN KEY ("step_1_user_id") REFERENCES "public"."app_users"("id");


--
-- Name: approval_rules approval_rules_step_2_approver_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_step_2_approver_fkey" FOREIGN KEY ("step_2_approver") REFERENCES "public"."approvers"("name");


--
-- Name: approval_rules approval_rules_step_2_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_step_2_user_id_fkey" FOREIGN KEY ("step_2_user_id") REFERENCES "public"."app_users"("id");


--
-- Name: approval_rules approval_rules_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;


--
-- Name: approvers approvers_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approvers"
    ADD CONSTRAINT "approvers_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: approvers approvers_deputy_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."approvers"
    ADD CONSTRAINT "approvers_deputy_name_fkey" FOREIGN KEY ("deputy_name") REFERENCES "public"."approvers"("name") ON DELETE SET NULL;


--
-- Name: assignment_rules assignment_rules_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assignment_rules"
    ADD CONSTRAINT "assignment_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");


--
-- Name: assignment_rules assignment_rules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assignment_rules"
    ADD CONSTRAINT "assignment_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: assignment_rules assignment_rules_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assignment_rules"
    ADD CONSTRAINT "assignment_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;


--
-- Name: assignment_rules assignment_rules_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."assignment_rules"
    ADD CONSTRAINT "assignment_rules_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: bank_accounts bank_accounts_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."bank_providers"("id");


--
-- Name: bank_connections bank_connections_bank_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_connections"
    ADD CONSTRAINT "bank_connections_bank_provider_id_fkey" FOREIGN KEY ("bank_provider_id") REFERENCES "public"."bank_providers"("id");


--
-- Name: bank_connections bank_connections_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_connections"
    ADD CONSTRAINT "bank_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: bank_sync_logs bank_sync_logs_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_sync_logs"
    ADD CONSTRAINT "bank_sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id");


--
-- Name: bank_transactions bank_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");


--
-- Name: bank_transactions bank_transactions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: bank_transactions bank_transactions_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id");


--
-- Name: bank_transactions bank_transactions_whitelist_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_whitelist_rule_id_fkey" FOREIGN KEY ("whitelist_rule_id") REFERENCES "public"."opos_whitelist_rules"("id");


--
-- Name: bwa_account_mapping bwa_account_mapping_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bwa_account_mapping"
    ADD CONSTRAINT "bwa_account_mapping_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");


--
-- Name: bwa_account_mapping bwa_account_mapping_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."bwa_account_mapping"
    ADD CONSTRAINT "bwa_account_mapping_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: categories bwa_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "bwa_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;


--
-- Name: category_aliases bwa_category_aliases_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."category_aliases"
    ADD CONSTRAINT "bwa_category_aliases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: datev_handover_batches datev_handover_batches_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."datev_handover_batches"
    ADD CONSTRAINT "datev_handover_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: datev_routes datev_routes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."datev_routes"
    ADD CONSTRAINT "datev_routes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: imported_items imported_messages_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."imported_items"
    ADD CONSTRAINT "imported_messages_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");


--
-- Name: document_bank_accounts invoice_bank_accounts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_bank_accounts"
    ADD CONSTRAINT "invoice_bank_accounts_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;


--
-- Name: document_bank_accounts invoice_bank_accounts_supplier_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_bank_accounts"
    ADD CONSTRAINT "invoice_bank_accounts_supplier_bank_account_id_fkey" FOREIGN KEY ("supplier_bank_account_id") REFERENCES "public"."supplier_bank_accounts"("id") ON DELETE CASCADE;


--
-- Name: document_files invoice_files_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "invoice_files_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;


--
-- Name: document_files invoice_files_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_files"
    ADD CONSTRAINT "invoice_files_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE CASCADE;


--
-- Name: document_history invoice_history_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_history"
    ADD CONSTRAINT "invoice_history_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;


--
-- Name: document_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_line_items"
    ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;


--
-- Name: document_taxes invoice_tax_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."document_taxes"
    ADD CONSTRAINT "invoice_tax_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;


--
-- Name: invoice_transaction_matches invoice_transaction_matches_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_transaction_matches"
    ADD CONSTRAINT "invoice_transaction_matches_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");


--
-- Name: invoice_transaction_matches invoice_transaction_matches_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoice_transaction_matches"
    ADD CONSTRAINT "invoice_transaction_matches_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE CASCADE;


--
-- Name: documents invoices_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: documents invoices_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: documents invoices_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");


--
-- Name: documents invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: documents invoices_datev_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_datev_batch_id_fkey" FOREIGN KEY ("datev_batch_id") REFERENCES "public"."datev_handover_batches"("id");


--
-- Name: documents invoices_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id");


--
-- Name: documents invoices_source_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id");


--
-- Name: documents invoices_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");


--
-- Name: documents invoices_uploaded_for_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "invoices_uploaded_for_transaction_id_fkey" FOREIGN KEY ("uploaded_for_transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE SET NULL;


--
-- Name: manual_bookings manual_bookings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."manual_bookings"
    ADD CONSTRAINT "manual_bookings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;


--
-- Name: manual_bookings manual_bookings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."manual_bookings"
    ADD CONSTRAINT "manual_bookings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: manual_bookings manual_bookings_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."manual_bookings"
    ADD CONSTRAINT "manual_bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;


--
-- Name: notification_events notification_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE SET NULL;


--
-- Name: notification_events notification_events_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;


--
-- Name: outgoing_invoice_files outgoing_invoice_files_outgoing_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_files"
    ADD CONSTRAINT "outgoing_invoice_files_outgoing_invoice_id_fkey" FOREIGN KEY ("outgoing_invoice_id") REFERENCES "public"."outgoing_invoices"("id");


--
-- Name: outgoing_invoice_transaction_matches outgoing_invoice_transaction_matches_outgoing_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_transaction_matches"
    ADD CONSTRAINT "outgoing_invoice_transaction_matches_outgoing_invoice_id_fkey" FOREIGN KEY ("outgoing_invoice_id") REFERENCES "public"."outgoing_invoices"("id");


--
-- Name: outgoing_invoice_transaction_matches outgoing_invoice_transaction_matches_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoice_transaction_matches"
    ADD CONSTRAINT "outgoing_invoice_transaction_matches_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE CASCADE;


--
-- Name: outgoing_invoices outgoing_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoices"
    ADD CONSTRAINT "outgoing_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: outgoing_invoices outgoing_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoices"
    ADD CONSTRAINT "outgoing_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");


--
-- Name: outgoing_invoices outgoing_invoices_datev_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."outgoing_invoices"
    ADD CONSTRAINT "outgoing_invoices_datev_batch_id_fkey" FOREIGN KEY ("datev_batch_id") REFERENCES "public"."datev_handover_batches"("id");


--
-- Name: payment_orders payment_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: payment_orders payment_orders_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");


--
-- Name: pleo_accounts pleo_accounts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pleo_accounts"
    ADD CONSTRAINT "pleo_accounts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");


--
-- Name: pleo_tags pleo_tags_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pleo_tags"
    ADD CONSTRAINT "pleo_tags_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id");


--
-- Name: processing_log processing_log_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processing_log"
    ADD CONSTRAINT "processing_log_invoice_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id");


--
-- Name: property_companies property_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."property_companies"
    ADD CONSTRAINT "property_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: property_companies property_companies_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."property_companies"
    ADD CONSTRAINT "property_companies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;


--
-- Name: supplier_bank_accounts supplier_bank_accounts_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplier_bank_accounts"
    ADD CONSTRAINT "supplier_bank_accounts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;


--
-- Name: supplier_iban_history supplier_iban_history_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."supplier_iban_history"
    ADD CONSTRAINT "supplier_iban_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;


--
-- Name: tour_progress tour_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tour_progress"
    ADD CONSTRAINT "tour_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_company_access user_company_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_company_access"
    ADD CONSTRAINT "user_company_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE CASCADE;


--
-- Name: ai_search_usage; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_search_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_users app_users_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "app_users_admin_insert" ON "public"."app_users" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());


--
-- Name: app_users app_users_admin_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "app_users_admin_read" ON "public"."app_users" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."has_permission"('page.team'::"text")));


--
-- Name: app_users app_users_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "app_users_admin_update" ON "public"."app_users" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: app_users app_users_self_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "app_users_self_read" ON "public"."app_users" FOR SELECT TO "authenticated" USING (("lower"("email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text"))));


--
-- Name: approval_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."approval_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_rules approval_rules_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approval_rules_insert" ON "public"."approval_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('page.freigabe_regeln'::"text"));


--
-- Name: approval_rules approval_rules_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approval_rules_select" ON "public"."approval_rules" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: approval_rules approval_rules_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approval_rules_update" ON "public"."approval_rules" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('page.freigabe_regeln'::"text")) WITH CHECK ("public"."has_permission"('page.freigabe_regeln'::"text"));


--
-- Name: approvers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."approvers" ENABLE ROW LEVEL SECURITY;

--
-- Name: approvers approvers_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approvers_insert" ON "public"."approvers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('page.freigabe_regeln'::"text"));


--
-- Name: approvers approvers_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approvers_read" ON "public"."approvers" FOR SELECT TO "authenticated" USING (true);


--
-- Name: approvers approvers_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "approvers_update" ON "public"."approvers" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('page.freigabe_regeln'::"text")) WITH CHECK ("public"."has_permission"('page.freigabe_regeln'::"text"));


--
-- Name: assignment_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."assignment_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: assignment_rules assignment_rules_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "assignment_rules_insert" ON "public"."assignment_rules" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: assignment_rules assignment_rules_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "assignment_rules_select" ON "public"."assignment_rules" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: assignment_rules assignment_rules_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "assignment_rules_update" ON "public"."assignment_rules" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: document_files auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_read" ON "public"."document_files" FOR SELECT TO "authenticated" USING (true);


--
-- Name: document_history auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_read" ON "public"."document_history" FOR SELECT TO "authenticated" USING (true);


--
-- Name: imported_items auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_read" ON "public"."imported_items" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pipeline_runs auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_read" ON "public"."pipeline_runs" FOR SELECT TO "authenticated" USING (true);


--
-- Name: suppliers auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_read" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);


--
-- Name: document_history auth_write_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auth_write_insert" ON "public"."document_history" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: ai_search_usage authenticated can insert usage rows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert usage rows" ON "public"."ai_search_usage" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts bank_accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bank_accounts_select" ON "public"."bank_accounts" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: bank_connections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_connections" ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_connections bank_connections_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bank_connections_read" ON "public"."bank_connections" FOR SELECT TO "authenticated" USING ("public"."has_permission"('page.bankverbindungen'::"text"));


--
-- Name: bank_providers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_providers" ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_sync_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_sync_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_sync_logs bank_sync_logs_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bank_sync_logs_read" ON "public"."bank_sync_logs" FOR SELECT TO "authenticated" USING ("public"."has_permission"('page.bankverbindungen'::"text"));


--
-- Name: bank_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_transactions bank_transactions_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bank_transactions_select" ON "public"."bank_transactions" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: bwa_account_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."bwa_account_mapping" ENABLE ROW LEVEL SECURITY;

--
-- Name: bwa_account_mapping bwa_account_mapping_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_account_mapping_insert" ON "public"."bwa_account_mapping" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: bwa_account_mapping bwa_account_mapping_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_account_mapping_read" ON "public"."bwa_account_mapping" FOR SELECT TO "authenticated" USING (true);


--
-- Name: bwa_account_mapping bwa_account_mapping_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_account_mapping_update" ON "public"."bwa_account_mapping" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: categories bwa_categories_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_categories_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: categories bwa_categories_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_categories_read" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);


--
-- Name: categories bwa_categories_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_categories_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: category_aliases bwa_category_aliases_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_category_aliases_insert" ON "public"."category_aliases" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: category_aliases bwa_category_aliases_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_category_aliases_read" ON "public"."category_aliases" FOR SELECT TO "authenticated" USING (true);


--
-- Name: category_aliases bwa_category_aliases_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "bwa_category_aliases_update" ON "public"."category_aliases" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: category_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."category_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: change_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."change_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "companies_admin_insert" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());


--
-- Name: companies companies_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "companies_admin_update" ON "public"."companies" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: companies companies_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "companies_select" ON "public"."companies" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("id"));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "customers_insert" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: customers customers_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: customers customers_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "customers_update" ON "public"."customers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: datev_handover_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."datev_handover_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: datev_handover_batches datev_handover_batches_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "datev_handover_batches_select" ON "public"."datev_handover_batches" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: datev_routes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."datev_routes" ENABLE ROW LEVEL SECURITY;

--
-- Name: datev_routes datev_routes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "datev_routes_select" ON "public"."datev_routes" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: document_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."document_bank_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_files; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."document_files" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."document_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_line_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."document_line_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_taxes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."document_taxes" ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_aliases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."entity_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_aliases entity_aliases_insert_lieferant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "entity_aliases_insert_lieferant" ON "public"."entity_aliases" FOR INSERT TO "authenticated" WITH CHECK (("entity_type" = 'lieferant'::"text"));


--
-- Name: entity_aliases entity_aliases_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "entity_aliases_select" ON "public"."entity_aliases" FOR SELECT TO "authenticated" USING (true);


--
-- Name: entity_aliases entity_aliases_update_lieferant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "entity_aliases_update_lieferant" ON "public"."entity_aliases" FOR UPDATE TO "authenticated" USING (("entity_type" = 'lieferant'::"text")) WITH CHECK (("entity_type" = 'lieferant'::"text"));


--
-- Name: filename_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."filename_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: filename_settings filename_settings_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filename_settings_admin_update" ON "public"."filename_settings" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('page.dateibenennung'::"text")) WITH CHECK ("public"."has_permission"('page.dateibenennung'::"text"));


--
-- Name: filename_settings filename_settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filename_settings_select" ON "public"."filename_settings" FOR SELECT TO "authenticated" USING (true);


--
-- Name: filing_placements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."filing_placements" ENABLE ROW LEVEL SECURITY;

--
-- Name: filing_placements filing_placements_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filing_placements_read" ON "public"."filing_placements" FOR SELECT TO "authenticated" USING (true);


--
-- Name: filing_placements filing_placements_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filing_placements_write" ON "public"."filing_placements" TO "authenticated" USING ("public"."has_permission"('postfach.settings'::"text")) WITH CHECK ("public"."has_permission"('postfach.settings'::"text"));


--
-- Name: imported_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."imported_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_exclusions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ingest_exclusions" ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_exclusions ingest_exclusions_auth_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ingest_exclusions_auth_insert" ON "public"."ingest_exclusions" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: ingest_exclusions ingest_exclusions_auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ingest_exclusions_auth_read" ON "public"."ingest_exclusions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: ingest_exclusions ingest_exclusions_auth_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ingest_exclusions_auth_update" ON "public"."ingest_exclusions" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: change_history insert_as_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert_as_self" ON "public"."change_history" FOR INSERT TO "authenticated" WITH CHECK ((("actor" IS NULL) OR ("lower"("actor") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))));


--
-- Name: document_bank_accounts invoice_bank_accounts_link; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invoice_bank_accounts_link" ON "public"."document_bank_accounts" FOR INSERT TO "authenticated" WITH CHECK ((("origin" = 'supplier_default'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."documents" "i"
     JOIN "public"."supplier_bank_accounts" "a" ON (("a"."id" = "document_bank_accounts"."supplier_bank_account_id")))
  WHERE (("i"."id" = "document_bank_accounts"."document_id") AND ("a"."supplier_id" = "i"."supplier_id") AND ("a"."deleted_at" IS NULL) AND "a"."is_active"))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."document_bank_accounts" "existing"
  WHERE ("existing"."document_id" = "document_bank_accounts"."document_id"))))));


--
-- Name: document_bank_accounts invoice_bank_accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invoice_bank_accounts_select" ON "public"."document_bank_accounts" FOR SELECT TO "authenticated" USING (true);


--
-- Name: document_bank_accounts invoice_bank_accounts_unlink; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invoice_bank_accounts_unlink" ON "public"."document_bank_accounts" FOR DELETE TO "authenticated" USING (("origin" = 'supplier_default'::"text"));


--
-- Name: invoice_transaction_matches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invoice_transaction_matches" ENABLE ROW LEVEL SECURITY;

--
-- Name: documents invoices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invoices_select" ON "public"."documents" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: documents invoices_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invoices_update" ON "public"."documents" FOR UPDATE TO "authenticated" USING ("public"."has_company_access"("company_id")) WITH CHECK ("public"."has_company_access"("company_id"));


--
-- Name: suppliers lieferanten_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lieferanten_insert" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: suppliers lieferanten_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lieferanten_read" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (true);


--
-- Name: suppliers lieferanten_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lieferanten_update" ON "public"."suppliers" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: mail_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mail_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_settings mail_settings_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mail_settings_read" ON "public"."mail_settings" FOR SELECT TO "authenticated" USING (true);


--
-- Name: mail_settings mail_settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mail_settings_update" ON "public"."mail_settings" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('postfach.settings'::"text")) WITH CHECK ("public"."has_permission"('postfach.settings'::"text"));


--
-- Name: manual_bookings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."manual_bookings" ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_bookings manual_bookings_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "manual_bookings_insert" ON "public"."manual_bookings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_company_access"("company_id"));


--
-- Name: manual_bookings manual_bookings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "manual_bookings_select" ON "public"."manual_bookings" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: manual_bookings manual_bookings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "manual_bookings_update" ON "public"."manual_bookings" FOR UPDATE TO "authenticated" USING ("public"."has_company_access"("company_id")) WITH CHECK ("public"."has_company_access"("company_id"));


--
-- Name: invoice_transaction_matches matches_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_insert" ON "public"."invoice_transaction_matches" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."documents" "i"
  WHERE (("i"."id" = "invoice_transaction_matches"."document_id") AND "public"."has_company_access"("i"."company_id"))))));


--
-- Name: invoice_transaction_matches matches_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_read" ON "public"."invoice_transaction_matches" FOR SELECT TO "authenticated" USING (true);


--
-- Name: invoice_transaction_matches matches_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_update" ON "public"."invoice_transaction_matches" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id")))));


--
-- Name: matching_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."matching_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: matching_settings matching_settings_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matching_settings_select" ON "public"."matching_settings" FOR SELECT USING (true);


--
-- Name: matching_settings matching_settings_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matching_settings_update" ON "public"."matching_settings" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: notification_channels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_channels" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_channels notification_channels_admin_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_channels_admin_read" ON "public"."notification_channels" FOR SELECT TO "authenticated" USING ("public"."has_permission"('notifications.settings'::"text"));


--
-- Name: notification_channels notification_channels_admin_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_channels_admin_write" ON "public"."notification_channels" TO "authenticated" USING ("public"."has_permission"('notifications.settings'::"text")) WITH CHECK ("public"."has_permission"('notifications.settings'::"text"));


--
-- Name: notification_dispatch_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_dispatch_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_dispatch_log notification_dispatch_log_admin_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_dispatch_log_admin_read" ON "public"."notification_dispatch_log" FOR SELECT TO "authenticated" USING ("public"."has_permission"('notifications.settings'::"text"));


--
-- Name: notification_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_events notification_events_recipient_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_events_recipient_read" ON "public"."notification_events" FOR SELECT TO "authenticated" USING ((("recipient_user_id" = "public"."current_app_user_id"()) OR ("created_by" = "public"."current_app_user_id"()) OR "public"."is_admin"()));


--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings notification_settings_own_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_settings_own_insert" ON "public"."notification_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "public"."current_app_user_id"()));


--
-- Name: notification_settings notification_settings_own_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_settings_own_read" ON "public"."notification_settings" FOR SELECT TO "authenticated" USING ((("user_id" = "public"."current_app_user_id"()) OR "public"."is_admin"()));


--
-- Name: notification_settings notification_settings_own_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_settings_own_update" ON "public"."notification_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "public"."current_app_user_id"())) WITH CHECK (("user_id" = "public"."current_app_user_id"()));


--
-- Name: notification_target_kinds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_target_kinds" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_target_kinds notification_target_kinds_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_target_kinds_read" ON "public"."notification_target_kinds" FOR SELECT TO "authenticated" USING (true);


--
-- Name: properties objekte_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "objekte_insert" ON "public"."properties" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: properties objekte_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "objekte_read" ON "public"."properties" FOR SELECT TO "authenticated" USING (true);


--
-- Name: properties objekte_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "objekte_update" ON "public"."properties" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: opos_whitelist_rules opos_whitelist_auth_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "opos_whitelist_auth_read" ON "public"."opos_whitelist_rules" FOR SELECT TO "authenticated" USING (true);


--
-- Name: opos_whitelist_rules opos_whitelist_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "opos_whitelist_insert" ON "public"."opos_whitelist_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"('opos_whitelist.write'::"text"));


--
-- Name: opos_whitelist_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."opos_whitelist_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: opos_whitelist_rules opos_whitelist_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "opos_whitelist_update" ON "public"."opos_whitelist_rules" FOR UPDATE TO "authenticated" USING ("public"."has_permission"('opos_whitelist.write'::"text")) WITH CHECK ("public"."has_permission"('opos_whitelist.write'::"text"));


--
-- Name: outgoing_invoice_files; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."outgoing_invoice_files" ENABLE ROW LEVEL SECURITY;

--
-- Name: outgoing_invoice_files outgoing_invoice_files_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_invoice_files_select" ON "public"."outgoing_invoice_files" FOR SELECT TO "authenticated" USING (true);


--
-- Name: outgoing_invoice_transaction_matches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."outgoing_invoice_transaction_matches" ENABLE ROW LEVEL SECURITY;

--
-- Name: outgoing_invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."outgoing_invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: outgoing_invoices outgoing_invoices_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_invoices_select" ON "public"."outgoing_invoices" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: outgoing_invoices outgoing_invoices_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_invoices_update" ON "public"."outgoing_invoices" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: outgoing_invoice_transaction_matches outgoing_matches_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_matches_insert" ON "public"."outgoing_invoice_transaction_matches" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "outgoing_invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."outgoing_invoices" "o"
  WHERE (("o"."id" = "outgoing_invoice_transaction_matches"."outgoing_invoice_id") AND "public"."has_company_access"("o"."company_id"))))));


--
-- Name: outgoing_invoice_transaction_matches outgoing_matches_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_matches_read" ON "public"."outgoing_invoice_transaction_matches" FOR SELECT TO "authenticated" USING (true);


--
-- Name: outgoing_invoice_transaction_matches outgoing_matches_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "outgoing_matches_update" ON "public"."outgoing_invoice_transaction_matches" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "outgoing_invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."bank_transactions" "t"
  WHERE (("t"."id" = "outgoing_invoice_transaction_matches"."transaction_id") AND "public"."has_company_access"("t"."company_id")))));


--
-- Name: package_migrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."package_migrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payment_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_orders payment_orders_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_orders_insert" ON "public"."payment_orders" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_company_access"("company_id") AND "public"."has_permission"('invoices.pay'::"text") AND (NOT (EXISTS ( SELECT 1
   FROM ("public"."documents" "i"
     JOIN "public"."app_users" "u" ON (("u"."id" = "i"."approved_by")))
  WHERE (("i"."id" = "payment_orders"."document_id") AND ("lower"("u"."email") = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))))))));


--
-- Name: payment_orders payment_orders_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_orders_select" ON "public"."payment_orders" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "permissions_read" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pipeline_run_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_run_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: pleo_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pleo_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: pleo_accounts pleo_accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pleo_accounts_select" ON "public"."pleo_accounts" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pleo_accounts pleo_accounts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pleo_accounts_update" ON "public"."pleo_accounts" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: pleo_tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pleo_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: pleo_tags pleo_tags_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pleo_tags_select" ON "public"."pleo_tags" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pleo_tags pleo_tags_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pleo_tags_update" ON "public"."pleo_tags" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: processing_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."processing_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."property_companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: property_companies property_companies_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "property_companies_insert" ON "public"."property_companies" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: property_companies property_companies_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "property_companies_select" ON "public"."property_companies" FOR SELECT TO "authenticated" USING ("public"."has_company_access"("company_id"));


--
-- Name: property_companies property_companies_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "property_companies_update" ON "public"."property_companies" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: read_cursors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."read_cursors" ENABLE ROW LEVEL SECURITY;

--
-- Name: change_history read_non_assistant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "read_non_assistant" ON "public"."change_history" FOR SELECT TO "authenticated" USING ("public"."has_permission"('page.protokoll'::"text"));


--
-- Name: processing_log read_non_assistant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "read_non_assistant" ON "public"."processing_log" FOR SELECT TO "authenticated" USING ("public"."has_permission"('page.protokoll'::"text"));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "role_permissions_read" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: role_permissions role_permissions_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "role_permissions_write" ON "public"."role_permissions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_authenticated_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "roles_authenticated_read" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);


--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."schema_migrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_run_requests signed in users may ask for a run; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "signed in users may ask for a run" ON "public"."pipeline_run_requests" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: pipeline_settings signed in users may read the pipeline settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "signed in users may read the pipeline settings" ON "public"."pipeline_settings" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pipeline_run_requests signed in users may watch what they asked for; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "signed in users may watch what they asked for" ON "public"."pipeline_run_requests" FOR SELECT TO "authenticated" USING (true);


--
-- Name: supplier_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."supplier_bank_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_bank_accounts supplier_bank_accounts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplier_bank_accounts_insert" ON "public"."supplier_bank_accounts" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: supplier_bank_accounts supplier_bank_accounts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplier_bank_accounts_select" ON "public"."supplier_bank_accounts" FOR SELECT TO "authenticated" USING (true);


--
-- Name: supplier_bank_accounts supplier_bank_accounts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplier_bank_accounts_update" ON "public"."supplier_bank_accounts" FOR UPDATE TO "authenticated" USING (true);


--
-- Name: supplier_iban_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."supplier_iban_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_iban_history supplier_iban_history_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "supplier_iban_history_select" ON "public"."supplier_iban_history" FOR SELECT TO "authenticated" USING (true);


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tour_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: tour_progress tour_progress_own_rows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tour_progress_own_rows" ON "public"."tour_progress" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_company_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_company_access" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_company_access user_company_access_admin_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_company_access_admin_insert" ON "public"."user_company_access" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());


--
-- Name: user_company_access user_company_access_admin_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_company_access_admin_read" ON "public"."user_company_access" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."has_permission"('page.team'::"text")));


--
-- Name: user_company_access user_company_access_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_company_access_admin_update" ON "public"."user_company_access" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: user_permissions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_permissions user_permissions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_permissions_read" ON "public"."user_permissions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("user_id" = "public"."current_app_user_id"())));


--
-- Name: user_permissions user_permissions_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_permissions_write" ON "public"."user_permissions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: vat_rates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vat_rates" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_datev_batch"("p_batch_id" "uuid", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "acknowledge_notification"("p_event_id" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."acknowledge_notification"("p_event_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acknowledge_notification"("p_event_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_notification"("p_event_id" bigint) TO "service_role";


--
-- Name: FUNCTION "advance_workflow_on_datev_handover"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."advance_workflow_on_datev_handover"() TO "anon";
GRANT ALL ON FUNCTION "public"."advance_workflow_on_datev_handover"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_workflow_on_datev_handover"() TO "service_role";


--
-- Name: FUNCTION "advance_workflow_on_payment"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."advance_workflow_on_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."advance_workflow_on_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_workflow_on_payment"() TO "service_role";


--
-- Name: FUNCTION "apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_assignment_rule_bulk"("p_rule" "uuid", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_assignment_rules"("p_invoice" "uuid", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "apply_opos_whitelist"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."apply_opos_whitelist"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_opos_whitelist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_opos_whitelist"() TO "service_role";


--
-- Name: FUNCTION "approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approval_rule_specificity"("p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "service_role";


--
-- Name: TABLE "pipeline_run_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_run_requests" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_run_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_run_requests" TO "service_role";


--
-- Name: FUNCTION "ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[], "wanted_folder_names" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[], "wanted_folder_names" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[], "wanted_folder_names" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ask_for_a_run"("wanted_channel" "text", "wanted_folders" "text"[], "wanted_folder_names" "text"[]) TO "service_role";


--
-- Name: FUNCTION "assignment_rule_preview"("p_rule" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assignment_rule_preview"("p_rule" "uuid") TO "service_role";


--
-- Name: FUNCTION "assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assignment_rule_preview_scope"("p_target" "text", "p_cost_category" "text", "p_vat_rate" numeric, "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid", "p_reference_pattern" "text", "p_exclude_rule" "uuid", "p_vat_treatment" "text", "p_category_id" "uuid", "p_vat_deductible_pct" numeric, "p_vat_special_case" "text") TO "service_role";


--
-- Name: FUNCTION "assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assignment_rule_specificity"("p_reference_pattern" "text", "p_supplier_id" "uuid", "p_property_id" "uuid", "p_company_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "bank_sync_log_facets"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."bank_sync_log_facets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bank_sync_log_facets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bank_sync_log_facets"() TO "service_role";


--
-- Name: FUNCTION "capture_supplier_iban_history"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."capture_supplier_iban_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_supplier_iban_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_supplier_iban_history"() TO "service_role";


--
-- Name: FUNCTION "cascade_company_code_rename"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cascade_company_code_rename"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_company_code_rename"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_company_code_rename"() TO "service_role";


--
-- Name: FUNCTION "cascade_property_code_rename"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."cascade_property_code_rename"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_property_code_rename"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_property_code_rename"() TO "service_role";


--
-- Name: FUNCTION "chain_people"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."chain_people"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chain_people"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chain_people"() TO "service_role";


--
-- Name: FUNCTION "channel_secret_name"("p_channel" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."channel_secret_name"("p_channel" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."channel_secret_name"("p_channel" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."channel_secret_name"("p_channel" "text") TO "service_role";


--
-- Name: FUNCTION "channel_secret_present"("p_channel" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."channel_secret_present"("p_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."channel_secret_present"("p_channel" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."channel_secret_present"("p_channel" "text") TO "service_role";


--
-- Name: FUNCTION "check_match_allocation"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_match_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_match_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_match_allocation"() TO "service_role";


--
-- Name: FUNCTION "check_outgoing_match_allocation"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_outgoing_match_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_outgoing_match_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_outgoing_match_allocation"() TO "service_role";


--
-- Name: FUNCTION "clear_must_change_password"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."clear_must_change_password"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_must_change_password"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_must_change_password"() TO "service_role";


--
-- Name: FUNCTION "clear_transaction_fully_used"("p_transaction_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."clear_transaction_fully_used"("p_transaction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_transaction_fully_used"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_transaction_fully_used"("p_transaction_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compact_supplier_iban"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."compact_supplier_iban"() TO "anon";
GRANT ALL ON FUNCTION "public"."compact_supplier_iban"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compact_supplier_iban"() TO "service_role";


--
-- Name: FUNCTION "current_app_user_id"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_app_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_user_id"() TO "service_role";


--
-- Name: FUNCTION "current_permissions"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_permissions"() TO "service_role";


--
-- Name: FUNCTION "current_role_name"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."current_role_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_role_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role_name"() TO "service_role";


--
-- Name: FUNCTION "enforce_invoice_write_permissions"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_invoice_write_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invoice_write_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invoice_write_permissions"() TO "service_role";


--
-- Name: FUNCTION "enforce_match_payment_permission"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_match_payment_permission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_match_payment_permission"() TO "service_role";


--
-- Name: FUNCTION "escape_ilike_pattern"("p_text" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."escape_ilike_pattern"("p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."escape_ilike_pattern"("p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escape_ilike_pattern"("p_text" "text") TO "service_role";


--
-- Name: FUNCTION "get_channel_secret"("p_channel" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_channel_secret"("p_channel" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_channel_secret"("p_channel" "text") TO "service_role";


--
-- Name: FUNCTION "guard_permission_grants"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."guard_permission_grants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_permission_grants"() TO "service_role";


--
-- Name: FUNCTION "guard_role_permission_grants"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."guard_role_permission_grants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_role_permission_grants"() TO "service_role";


--
-- Name: FUNCTION "guard_super_admin_insert"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."guard_super_admin_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_super_admin_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_super_admin_insert"() TO "service_role";


--
-- Name: FUNCTION "guard_super_admin_permissions"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."guard_super_admin_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_super_admin_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_super_admin_permissions"() TO "service_role";


--
-- Name: FUNCTION "guard_super_admin_row"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."guard_super_admin_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_super_admin_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_super_admin_row"() TO "service_role";


--
-- Name: FUNCTION "has_company_access"("p_company" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_company_access"("p_company" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_company_access"("p_company" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_company_access"("p_company" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_permission"("p_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_permission"("p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_key" "text") TO "service_role";


--
-- Name: FUNCTION "invoice_iban_checksum_ok"("candidate" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invoice_iban_checksum_ok"("candidate" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoice_iban_checksum_ok"("candidate" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_iban_checksum_ok"("candidate" "text") TO "service_role";


--
-- Name: FUNCTION "invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_is_fully_covered"("p_gross" numeric, "p_matched" numeric) TO "service_role";


--
-- Name: FUNCTION "invoice_matched_sum"("p_invoice" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."invoice_matched_sum"("p_invoice" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_matched_sum"("p_invoice" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_matched_sum"("p_invoice" "uuid") TO "service_role";


--
-- Name: FUNCTION "invoice_queue_kpis"("p_today" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."invoice_queue_kpis"("p_today" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_queue_kpis"("p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_queue_kpis"("p_today" "date") TO "service_role";


--
-- Name: FUNCTION "invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_review_state"("p_validation_detail" "jsonb", "p_extracted" "jsonb", "p_validation" "jsonb", "p_issuer" "text", "p_invoice_number" "text", "p_document_date" "date", "p_amount_gross" numeric, "p_amount_net" numeric, "p_vat_amount" numeric, "p_vat_rate" numeric, "p_recipient_name" "text", "p_company_code" "text", "p_supplier_iban" "text") TO "service_role";


--
-- Name: FUNCTION "invoices_facets"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."invoices_facets"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_facets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_facets"() TO "service_role";


--
-- Name: FUNCTION "invoices_filtered_aggregate"("p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invoices_filtered_aggregate"("p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoices_filtered_aggregate"("p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_filtered_aggregate"("p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) TO "service_role";


--
-- Name: FUNCTION "invoices_filtered_search"("p_query_embedding" "public"."vector", "p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_limit" integer, "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invoices_filtered_search"("p_query_embedding" "public"."vector", "p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_limit" integer, "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoices_filtered_search"("p_query_embedding" "public"."vector", "p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_limit" integer, "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_filtered_search"("p_query_embedding" "public"."vector", "p_company_code" "text", "p_property_code" "text", "p_cost_category" "text", "p_issuer_like" "text", "p_date_from" "date", "p_date_to" "date", "p_status" "text", "p_limit" integer, "p_payment_state" "text", "p_amount_min" numeric, "p_amount_max" numeric) TO "service_role";


--
-- Name: FUNCTION "invoices_kpis"("p_q" "text", "p_gesellschaft" "text", "p_objekt" "text", "p_belegart" "text", "p_zahlung" "text", "p_von" "date", "p_bis" "date", "p_datev" "text", "p_workflow" "text", "p_bank_match" "text", "p_ampel" "text", "p_archiv" "text", "p_ids" "uuid"[], "p_faellig_von" "date", "p_faellig_bis" "date", "p_faellig_unbekannt" boolean, "p_direct_debit" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."invoices_kpis"("p_q" "text", "p_gesellschaft" "text", "p_objekt" "text", "p_belegart" "text", "p_zahlung" "text", "p_von" "date", "p_bis" "date", "p_datev" "text", "p_workflow" "text", "p_bank_match" "text", "p_ampel" "text", "p_archiv" "text", "p_ids" "uuid"[], "p_faellig_von" "date", "p_faellig_bis" "date", "p_faellig_unbekannt" boolean, "p_direct_debit" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_kpis"("p_q" "text", "p_gesellschaft" "text", "p_objekt" "text", "p_belegart" "text", "p_zahlung" "text", "p_von" "date", "p_bis" "date", "p_datev" "text", "p_workflow" "text", "p_bank_match" "text", "p_ampel" "text", "p_archiv" "text", "p_ids" "uuid"[], "p_faellig_von" "date", "p_faellig_bis" "date", "p_faellig_unbekannt" boolean, "p_direct_debit" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_kpis"("p_q" "text", "p_gesellschaft" "text", "p_objekt" "text", "p_belegart" "text", "p_zahlung" "text", "p_von" "date", "p_bis" "date", "p_datev" "text", "p_workflow" "text", "p_bank_match" "text", "p_ampel" "text", "p_archiv" "text", "p_ids" "uuid"[], "p_faellig_von" "date", "p_faellig_bis" "date", "p_faellig_unbekannt" boolean, "p_direct_debit" boolean) TO "service_role";


--
-- Name: FUNCTION "invoices_search_ids"("p_where" "text", "p_archived" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."invoices_search_ids"("p_where" "text", "p_archived" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoices_search_ids"("p_where" "text", "p_archived" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_search_ids"("p_where" "text", "p_archived" boolean) TO "service_role";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "is_direct_debit"("p_payment_method" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_direct_debit"("p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_direct_debit"("p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_direct_debit"("p_payment_method" "text") TO "service_role";


--
-- Name: TABLE "documents"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";


--
-- Name: TABLE "invoice_transaction_matches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invoice_transaction_matches" TO "anon";
GRANT ALL ON TABLE "public"."invoice_transaction_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_transaction_matches" TO "service_role";


--
-- Name: TABLE "suppliers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";


--
-- Name: TABLE "v_invoices_list"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_invoices_list" TO "anon";
GRANT ALL ON TABLE "public"."v_invoices_list" TO "authenticated";
GRANT ALL ON TABLE "public"."v_invoices_list" TO "service_role";


--
-- Name: TABLE "v_invoices_review"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_invoices_review" TO "anon";
GRANT ALL ON TABLE "public"."v_invoices_review" TO "authenticated";
GRANT ALL ON TABLE "public"."v_invoices_review" TO "service_role";


--
-- Name: FUNCTION "is_direct_debit"("public"."v_invoices_review"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_direct_debit"("public"."v_invoices_review") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_direct_debit"("public"."v_invoices_review") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_direct_debit"("public"."v_invoices_review") TO "anon";


--
-- Name: FUNCTION "is_invoice_reconciled"("p_invoice_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_invoice_reconciled"("p_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_invoice_reconciled"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_invoice_reconciled"("p_invoice_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."learn_assignment_rule_from_match"("p_match" "uuid", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric, "p_difference_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric, "p_difference_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric, "p_difference_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_invoice_transaction"("p_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric, "p_difference_reason" "text") TO "service_role";


--
-- Name: FUNCTION "link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_outgoing_invoice_transaction"("p_outgoing_invoice_id" "uuid", "p_transaction_id" "uuid", "p_score" numeric, "p_reasons" "jsonb", "p_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "link_uploaded_invoice_when_extracted"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."link_uploaded_invoice_when_extracted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_uploaded_invoice_when_extracted"() TO "service_role";


--
-- Name: FUNCTION "log_supplier_bank_account_event"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."log_supplier_bank_account_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_supplier_bank_account_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_supplier_bank_account_event"() TO "service_role";


--
-- Name: FUNCTION "manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manual_bookings_expanded"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "service_role";


--
-- Name: FUNCTION "mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_datev_batch_bounced"("p_batch_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "mark_notifications_seen"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_notifications_seen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notifications_seen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notifications_seen"() TO "service_role";


--
-- Name: FUNCTION "match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_opos_whitelist"("p_reference" "text", "p_counterparty" "text", "p_iban" "text", "p_booking_text" "text") TO "service_role";


--
-- Name: FUNCTION "merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_suppliers"("p_keep_id" "uuid", "p_merge_id" "uuid", "p_merged_by" "text", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "my_profile"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."my_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_profile"() TO "service_role";


--
-- Name: FUNCTION "notify_dispatch_now"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."notify_dispatch_now"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_dispatch_now"() TO "service_role";


--
-- Name: FUNCTION "notify_event_from_history"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."notify_event_from_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_event_from_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_event_from_history"() TO "service_role";


--
-- Name: FUNCTION "opos_clear_no_receipt"("p_transaction_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."opos_clear_no_receipt"("p_transaction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."opos_clear_no_receipt"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opos_clear_no_receipt"("p_transaction_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "opos_norm"("p_text" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."opos_norm"("p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."opos_norm"("p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opos_norm"("p_text" "text") TO "service_role";


--
-- Name: FUNCTION "opos_reapply_whitelist"("p_rule_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."opos_reapply_whitelist"("p_rule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."opos_reapply_whitelist"("p_rule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opos_reapply_whitelist"("p_rule_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opos_set_category"("p_transaction_id" "uuid", "p_category_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."opos_set_no_receipt"("p_transaction_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."outgoing_invoice_matched_sum"("p_outgoing_invoice" "uuid") TO "service_role";


--
-- Name: FUNCTION "outgoing_transaction_allocated_sum"("p_transaction" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."outgoing_transaction_allocated_sum"("p_transaction" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."outgoing_transaction_allocated_sum"("p_transaction" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."outgoing_transaction_allocated_sum"("p_transaction" "uuid") TO "service_role";


--
-- Name: FUNCTION "payment_tolerance"("p_gross" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."payment_tolerance"("p_gross" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."payment_tolerance"("p_gross" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."payment_tolerance"("p_gross" numeric) TO "service_role";


--
-- Name: FUNCTION "pending_receipt_count"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."pending_receipt_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pending_receipt_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pending_receipt_count"() TO "service_role";


--
-- Name: FUNCTION "pending_receipt_downloads"("p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."pending_receipt_downloads"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pending_receipt_downloads"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pending_receipt_downloads"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "promote_first_bank_account_to_default"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."promote_first_bank_account_to_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."promote_first_bank_account_to_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_first_bank_account_to_default"() TO "service_role";


--
-- Name: FUNCTION "propagate_account_company"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."propagate_account_company"() TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_account_company"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_account_company"() TO "service_role";


--
-- Name: FUNCTION "purge_record"("p_table" "text", "p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."purge_record"("p_table" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_record"("p_table" "text", "p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_record"("p_table" "text", "p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "refuse_deleting_default_bank_account"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refuse_deleting_default_bank_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."refuse_deleting_default_bank_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refuse_deleting_default_bank_account"() TO "service_role";


--
-- Name: FUNCTION "request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid", "p_note" "text", "p_transaction_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid", "p_note" "text", "p_transaction_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid", "p_note" "text", "p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_approval_ping"("p_recipient" "uuid", "p_invoice_id" "uuid", "p_note" "text", "p_transaction_id" "uuid") TO "service_role";


--
-- Name: TABLE "approval_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."approval_rules" TO "anon";
GRANT ALL ON TABLE "public"."approval_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_rules" TO "service_role";


--
-- Name: FUNCTION "resolve_approval_rule"("p_invoice_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_approval_rule"("p_invoice_id" "uuid") TO "service_role";


--
-- Name: TABLE "app_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";


--
-- Name: FUNCTION "resolve_area_user"("p_area" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resolve_area_user"("p_area" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_area_user"("p_area" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_area_user"("p_area" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_assignment_rule"("p_invoice" "uuid", "p_target" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_assignment_rule_candidates"("p_invoice" "uuid", "p_target" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_default_vat_deductible_pct"("p_property" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_default_vat_deductible_pct"("p_property" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_transaction_category"("p_transaction" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_transaction_category"("p_transaction" "uuid") TO "service_role";


--
-- Name: FUNCTION "restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_record"("p_table" "text", "p_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "rls_auto_enable"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


--
-- Name: FUNCTION "run_bank_sync"("p_mode" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."run_bank_sync"("p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_bank_sync"("p_mode" "text") TO "service_role";


--
-- Name: FUNCTION "send_notification"("p_recipient" "uuid", "p_note" "text", "p_target_kind" "text", "p_target_id" "text", "p_target_path" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."send_notification"("p_recipient" "uuid", "p_note" "text", "p_target_kind" "text", "p_target_id" "text", "p_target_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_notification"("p_recipient" "uuid", "p_note" "text", "p_target_kind" "text", "p_target_id" "text", "p_target_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_notification"("p_recipient" "uuid", "p_note" "text", "p_target_kind" "text", "p_target_id" "text", "p_target_path" "text") TO "service_role";


--
-- Name: FUNCTION "set_bank_account_connect_route"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_bank_account_connect_route"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_bank_account_connect_route"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_bank_account_connect_route"() TO "service_role";


--
-- Name: FUNCTION "set_bank_transaction_company"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_bank_transaction_company"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_bank_transaction_company"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_bank_transaction_company"() TO "service_role";


--
-- Name: FUNCTION "set_channel_secret"("p_channel" "text", "p_secret" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_channel_secret"("p_channel" "text", "p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_channel_secret"("p_channel" "text", "p_secret" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_channel_secret"("p_channel" "text", "p_secret" "text") TO "service_role";


--
-- Name: FUNCTION "set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_datev_route"("p_company_id" "uuid", "p_direction" "text", "p_address" "text", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") TO "service_role";


--
-- Name: FUNCTION "set_my_name"("p_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_my_name"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_name"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_name"("p_name" "text") TO "service_role";


--
-- Name: FUNCTION "set_my_picture_url"("p_url" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_my_picture_url"("p_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_my_picture_url"("p_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_my_picture_url"("p_url" "text") TO "service_role";


--
-- Name: FUNCTION "set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_transaction_fully_used"("p_transaction_id" "uuid", "p_note" "text") TO "service_role";


--
-- Name: FUNCTION "set_transaction_spender"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_transaction_spender"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_transaction_spender"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_transaction_spender"() TO "service_role";


--
-- Name: FUNCTION "set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_uploaded_outgoing_invoice_status"("p_id" "uuid", "p_status" "text", "p_actor" "text") TO "service_role";


--
-- Name: FUNCTION "set_user_slack_id"("p_user" "uuid", "p_slack_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_slack_id"("p_user" "uuid", "p_slack_id" "text") TO "service_role";


--
-- Name: FUNCTION "suggest_assignment_rules"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."suggest_assignment_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."suggest_assignment_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."suggest_assignment_rules"() TO "service_role";


--
-- Name: FUNCTION "supplier_bank_accounts_single_default"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."supplier_bank_accounts_single_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_bank_accounts_single_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_bank_accounts_single_default"() TO "service_role";


--
-- Name: FUNCTION "supplier_default_account_sync"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."supplier_default_account_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_default_account_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_default_account_sync"() TO "service_role";


--
-- Name: FUNCTION "supplier_default_iban_sync"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."supplier_default_iban_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_default_iban_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_default_iban_sync"() TO "service_role";


--
-- Name: FUNCTION "sync_invoice_paid_from_matches"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_invoice_paid_from_matches"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_invoice_paid_from_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_invoice_paid_from_matches"() TO "service_role";


--
-- Name: FUNCTION "sync_transaction_matching_status"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_transaction_matching_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_transaction_matching_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_transaction_matching_status"() TO "service_role";


--
-- Name: FUNCTION "sync_uploaded_outgoing_invoice_status_from_matches"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_uploaded_outgoing_invoice_status_from_matches"() TO "service_role";


--
-- Name: FUNCTION "tell_the_pipeline"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tell_the_pipeline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tell_the_pipeline"() TO "service_role";


--
-- Name: FUNCTION "touch_tour_progress"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_tour_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_tour_progress"() TO "service_role";


--
-- Name: FUNCTION "transaction_allocated_sum"("p_transaction" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."transaction_allocated_sum"("p_transaction" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transaction_allocated_sum"("p_transaction" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transaction_allocated_sum"("p_transaction" "uuid") TO "service_role";


--
-- Name: FUNCTION "trash_eligible_tables"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trash_eligible_tables"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trash_eligible_tables"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trash_eligible_tables"() TO "service_role";


--
-- Name: FUNCTION "trash_purge_eligible_tables"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trash_purge_eligible_tables"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trash_purge_eligible_tables"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trash_purge_eligible_tables"() TO "service_role";


--
-- Name: FUNCTION "trash_require_delete_reason"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trash_require_delete_reason"() TO "anon";
GRANT ALL ON FUNCTION "public"."trash_require_delete_reason"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trash_require_delete_reason"() TO "service_role";


--
-- Name: FUNCTION "trg_fn_bank_transactions_categorize"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_fn_bank_transactions_categorize"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_bank_transactions_categorize"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_bank_transactions_categorize"() TO "service_role";


--
-- Name: FUNCTION "trg_fn_invoices_apply_rules_on_insert"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_invoices_apply_rules_on_insert"() TO "service_role";


--
-- Name: FUNCTION "trg_fn_invoices_vat_deductible_default"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_fn_invoices_vat_deductible_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_invoices_vat_deductible_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_invoices_vat_deductible_default"() TO "service_role";


--
-- Name: FUNCTION "update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_datev_route_status"("p_id" "uuid", "p_is_enabled" boolean, "p_note" "text", "p_updated_by" "text") TO "service_role";


--
-- Name: FUNCTION "upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_external_transactions"("p_rows" "jsonb", "p_account_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vat_reserve"("p_company" "uuid", "p_von" "date", "p_bis" "date") TO "service_role";


--
-- Name: TABLE "ai_search_usage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_search_usage" TO "service_role";
GRANT INSERT ON TABLE "public"."ai_search_usage" TO "authenticated";


--
-- Name: TABLE "approvers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."approvers" TO "anon";
GRANT ALL ON TABLE "public"."approvers" TO "authenticated";
GRANT ALL ON TABLE "public"."approvers" TO "service_role";


--
-- Name: TABLE "assignment_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."assignment_rules" TO "anon";
GRANT ALL ON TABLE "public"."assignment_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_rules" TO "service_role";


--
-- Name: TABLE "bank_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";


--
-- Name: TABLE "bank_connections"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bank_connections" TO "anon";
GRANT ALL ON TABLE "public"."bank_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_connections" TO "service_role";


--
-- Name: TABLE "bank_providers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bank_providers" TO "anon";
GRANT ALL ON TABLE "public"."bank_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_providers" TO "service_role";


--
-- Name: TABLE "bank_sync_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bank_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."bank_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_sync_logs" TO "service_role";


--
-- Name: SEQUENCE "bank_sync_logs_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."bank_sync_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bank_sync_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bank_sync_logs_id_seq" TO "service_role";


--
-- Name: TABLE "bank_transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bank_transactions" TO "anon";
GRANT ALL ON TABLE "public"."bank_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_transactions" TO "service_role";


--
-- Name: TABLE "bwa_account_mapping"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."bwa_account_mapping" TO "anon";
GRANT ALL ON TABLE "public"."bwa_account_mapping" TO "authenticated";
GRANT ALL ON TABLE "public"."bwa_account_mapping" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "category_aliases"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."category_aliases" TO "anon";
GRANT ALL ON TABLE "public"."category_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."category_aliases" TO "service_role";


--
-- Name: TABLE "change_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."change_history" TO "anon";
GRANT ALL ON TABLE "public"."change_history" TO "authenticated";
GRANT ALL ON TABLE "public"."change_history" TO "service_role";


--
-- Name: TABLE "companies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";


--
-- Name: TABLE "customers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";


--
-- Name: TABLE "datev_handover_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."datev_handover_batches" TO "anon";
GRANT ALL ON TABLE "public"."datev_handover_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."datev_handover_batches" TO "service_role";


--
-- Name: TABLE "datev_routes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."datev_routes" TO "anon";
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."datev_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."datev_routes" TO "service_role";


--
-- Name: COLUMN "datev_routes"."id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("id") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."company_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("company_id") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."direction"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("direction") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."is_enabled"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("is_enabled") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."note"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("note") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."updated_by"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_by") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."created_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("created_at") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: COLUMN "datev_routes"."updated_at"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT("updated_at") ON TABLE "public"."datev_routes" TO "authenticated";


--
-- Name: TABLE "document_bank_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."document_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."document_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."document_bank_accounts" TO "service_role";


--
-- Name: TABLE "document_files"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."document_files" TO "anon";
GRANT ALL ON TABLE "public"."document_files" TO "authenticated";
GRANT ALL ON TABLE "public"."document_files" TO "service_role";


--
-- Name: TABLE "document_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."document_history" TO "anon";
GRANT ALL ON TABLE "public"."document_history" TO "authenticated";
GRANT ALL ON TABLE "public"."document_history" TO "service_role";


--
-- Name: TABLE "document_line_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."document_line_items" TO "anon";
GRANT ALL ON TABLE "public"."document_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."document_line_items" TO "service_role";


--
-- Name: TABLE "document_taxes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."document_taxes" TO "anon";
GRANT ALL ON TABLE "public"."document_taxes" TO "authenticated";
GRANT ALL ON TABLE "public"."document_taxes" TO "service_role";


--
-- Name: TABLE "entity_aliases"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."entity_aliases" TO "anon";
GRANT ALL ON TABLE "public"."entity_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_aliases" TO "service_role";


--
-- Name: TABLE "filename_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."filename_settings" TO "anon";
GRANT ALL ON TABLE "public"."filename_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."filename_settings" TO "service_role";


--
-- Name: TABLE "filing_placements"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."filing_placements" TO "anon";
GRANT ALL ON TABLE "public"."filing_placements" TO "authenticated";
GRANT ALL ON TABLE "public"."filing_placements" TO "service_role";


--
-- Name: TABLE "imported_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."imported_items" TO "anon";
GRANT ALL ON TABLE "public"."imported_items" TO "authenticated";
GRANT ALL ON TABLE "public"."imported_items" TO "service_role";


--
-- Name: TABLE "ingest_exclusions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ingest_exclusions" TO "anon";
GRANT ALL ON TABLE "public"."ingest_exclusions" TO "authenticated";
GRANT ALL ON TABLE "public"."ingest_exclusions" TO "service_role";


--
-- Name: TABLE "mail_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mail_settings" TO "anon";
GRANT ALL ON TABLE "public"."mail_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."mail_settings" TO "service_role";


--
-- Name: TABLE "manual_bookings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."manual_bookings" TO "anon";
GRANT ALL ON TABLE "public"."manual_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."manual_bookings" TO "service_role";


--
-- Name: TABLE "matching_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."matching_settings" TO "anon";
GRANT ALL ON TABLE "public"."matching_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."matching_settings" TO "service_role";


--
-- Name: TABLE "notification_channels"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_channels" TO "anon";
GRANT ALL ON TABLE "public"."notification_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_channels" TO "service_role";


--
-- Name: TABLE "notification_dispatch_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_dispatch_log" TO "anon";
GRANT ALL ON TABLE "public"."notification_dispatch_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_dispatch_log" TO "service_role";


--
-- Name: SEQUENCE "notification_dispatch_log_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."notification_dispatch_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notification_dispatch_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notification_dispatch_log_id_seq" TO "service_role";


--
-- Name: TABLE "notification_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_events" TO "anon";
GRANT ALL ON TABLE "public"."notification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_events" TO "service_role";


--
-- Name: SEQUENCE "notification_events_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."notification_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notification_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notification_events_id_seq" TO "service_role";


--
-- Name: TABLE "notification_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";


--
-- Name: TABLE "notification_target_kinds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_target_kinds" TO "anon";
GRANT ALL ON TABLE "public"."notification_target_kinds" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_target_kinds" TO "service_role";


--
-- Name: TABLE "opos_whitelist_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."opos_whitelist_rules" TO "anon";
GRANT ALL ON TABLE "public"."opos_whitelist_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."opos_whitelist_rules" TO "service_role";


--
-- Name: TABLE "outgoing_invoice_files"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."outgoing_invoice_files" TO "anon";
GRANT ALL ON TABLE "public"."outgoing_invoice_files" TO "authenticated";
GRANT ALL ON TABLE "public"."outgoing_invoice_files" TO "service_role";


--
-- Name: TABLE "outgoing_invoice_transaction_matches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."outgoing_invoice_transaction_matches" TO "anon";
GRANT ALL ON TABLE "public"."outgoing_invoice_transaction_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."outgoing_invoice_transaction_matches" TO "service_role";


--
-- Name: TABLE "outgoing_invoices"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."outgoing_invoices" TO "anon";
GRANT ALL ON TABLE "public"."outgoing_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."outgoing_invoices" TO "service_role";


--
-- Name: TABLE "package_migrations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."package_migrations" TO "anon";
GRANT ALL ON TABLE "public"."package_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."package_migrations" TO "service_role";


--
-- Name: TABLE "payment_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."payment_orders" TO "anon";
GRANT ALL ON TABLE "public"."payment_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_orders" TO "service_role";


--
-- Name: TABLE "permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";


--
-- Name: TABLE "pipeline_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_runs" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_runs" TO "service_role";


--
-- Name: TABLE "pipeline_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_settings" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_settings" TO "service_role";


--
-- Name: TABLE "pleo_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pleo_accounts" TO "anon";
GRANT ALL ON TABLE "public"."pleo_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."pleo_accounts" TO "service_role";


--
-- Name: TABLE "pleo_tags"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pleo_tags" TO "anon";
GRANT ALL ON TABLE "public"."pleo_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."pleo_tags" TO "service_role";


--
-- Name: TABLE "processing_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."processing_log" TO "anon";
GRANT ALL ON TABLE "public"."processing_log" TO "authenticated";
GRANT ALL ON TABLE "public"."processing_log" TO "service_role";


--
-- Name: SEQUENCE "processing_log_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."processing_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."processing_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."processing_log_id_seq" TO "service_role";


--
-- Name: TABLE "properties"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."properties" TO "anon";
GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";


--
-- Name: TABLE "property_companies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."property_companies" TO "anon";
GRANT ALL ON TABLE "public"."property_companies" TO "authenticated";
GRANT ALL ON TABLE "public"."property_companies" TO "service_role";


--
-- Name: TABLE "read_cursors"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."read_cursors" TO "anon";
GRANT ALL ON TABLE "public"."read_cursors" TO "authenticated";
GRANT ALL ON TABLE "public"."read_cursors" TO "service_role";


--
-- Name: TABLE "role_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";


--
-- Name: TABLE "roles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";


--
-- Name: TABLE "schema_migrations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."schema_migrations" TO "anon";
GRANT ALL ON TABLE "public"."schema_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_migrations" TO "service_role";


--
-- Name: TABLE "supplier_bank_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."supplier_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."supplier_bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_bank_accounts" TO "service_role";


--
-- Name: TABLE "supplier_iban_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."supplier_iban_history" TO "anon";
GRANT ALL ON TABLE "public"."supplier_iban_history" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_iban_history" TO "service_role";


--
-- Name: TABLE "tour_progress"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tour_progress" TO "anon";
GRANT ALL ON TABLE "public"."tour_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."tour_progress" TO "service_role";


--
-- Name: TABLE "user_company_access"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_company_access" TO "anon";
GRANT ALL ON TABLE "public"."user_company_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_company_access" TO "service_role";


--
-- Name: TABLE "user_permissions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";


--
-- Name: TABLE "v_bank_transactions_list"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_bank_transactions_list" TO "anon";
GRANT ALL ON TABLE "public"."v_bank_transactions_list" TO "authenticated";
GRANT ALL ON TABLE "public"."v_bank_transactions_list" TO "service_role";


--
-- Name: TABLE "v_company_invoice_totals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_company_invoice_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_company_invoice_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_company_invoice_totals" TO "service_role";


--
-- Name: TABLE "v_customer_invoice_totals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_customer_invoice_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_customer_invoice_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_customer_invoice_totals" TO "service_role";


--
-- Name: TABLE "v_invoices_search"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_invoices_search" TO "anon";
GRANT ALL ON TABLE "public"."v_invoices_search" TO "authenticated";
GRANT ALL ON TABLE "public"."v_invoices_search" TO "service_role";


--
-- Name: TABLE "v_open_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_open_items" TO "anon";
GRANT ALL ON TABLE "public"."v_open_items" TO "authenticated";
GRANT ALL ON TABLE "public"."v_open_items" TO "service_role";


--
-- Name: TABLE "v_property_invoice_totals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_property_invoice_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_property_invoice_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_property_invoice_totals" TO "service_role";


--
-- Name: TABLE "v_supplier_duplicates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_supplier_duplicates" TO "anon";
GRANT ALL ON TABLE "public"."v_supplier_duplicates" TO "authenticated";
GRANT ALL ON TABLE "public"."v_supplier_duplicates" TO "service_role";


--
-- Name: TABLE "v_supplier_invoice_totals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_supplier_invoice_totals" TO "anon";
GRANT ALL ON TABLE "public"."v_supplier_invoice_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."v_supplier_invoice_totals" TO "service_role";


--
-- Name: TABLE "v_trash_base"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_trash_base" TO "anon";
GRANT ALL ON TABLE "public"."v_trash_base" TO "authenticated";
GRANT ALL ON TABLE "public"."v_trash_base" TO "service_role";


--
-- Name: TABLE "v_trash"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_trash" TO "anon";
GRANT ALL ON TABLE "public"."v_trash" TO "authenticated";
GRANT ALL ON TABLE "public"."v_trash" TO "service_role";


--
-- Name: TABLE "vat_rates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vat_rates" TO "anon";
GRANT ALL ON TABLE "public"."vat_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."vat_rates" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict 2Mo41Nk9kxcQiwKO3GHfQC129GrraHnQTQ0FH3cFkbNAz03iHwKggu9rKuWWfKJ

