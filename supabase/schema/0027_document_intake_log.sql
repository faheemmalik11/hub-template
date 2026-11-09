begin;

drop view if exists public.v_document_intake_log;

create view public.v_document_intake_log with (security_invoker = true) as
select
    d.id,
    d.invoice_number,
    d.created_at,
    d.issuer,
    d.service_description,
    d.document_type,
    d.company_code,
    d.intake_channel,
    d.fts,
    case
        when exists (
            select 1 from public.document_files f
             where f.document_id = d.id
               and f.source = 'sharepoint'
               and f.deleted_at is null
        ) then 'filed'
        when d.handed_over_at is not null or d.workflow_status = 'uebergeben_datev' then 'handed_over'
        when d.not_relevant_at is not null then 'not_relevant'
        when d.archived_at is not null then 'archived'
        when d.workflow_status in (
            'approved_first', 'approved_final', 'paid', 'closed',
            'freigegeben_assistenz', 'freigegeben_vorgesetzter', 'bezahlt', 'abgeschlossen'
        ) then 'approved'
        when d.workflow_status in ('in_review', 'query', 'in_pruefung', 'rueckfrage') then 'in_review'
        when d.status in ('recognised', 'erkannt') then 'recognised'
        else 'open'
    end as outcome
from public.documents d
where d.deleted_at is null;

comment on view public.v_document_intake_log is
    'Everything that arrived, with what became of it. Feeds the intake log screen, which answers '
    '"what came in" rather than "what is there to work on", so archived, not relevant and already '
    'filed documents stay visible instead of being hidden the way the document list hides them.';

grant select on public.v_document_intake_log to authenticated;

commit;

do $$
begin
    if to_regclass('public.v_document_intake_log') is null then
        raise exception 'v_document_intake_log self-check FAILED: the view is missing';
    end if;
    if not exists (
        select 1 from pg_class c
         where c.oid = 'public.v_document_intake_log'::regclass
           and c.reloptions @> array['security_invoker=true']
    ) then
        raise exception 'v_document_intake_log self-check FAILED: security_invoker is not set, a private document would leak';
    end if;
    raise notice 'v_document_intake_log ok: view in place, security_invoker set';
end $$;
