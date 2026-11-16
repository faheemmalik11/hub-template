-- §6.1.1 of the 11 Nov briefing: Robin gets the management role instead of broker. His property
-- assignment is untouched by this — properties_own_broker_read matches on broker_external_id, not
-- role, and is additive to whatever a role already grants.

begin;

update public.app_users
   set role_id = (select id from public.roles where name = 'admin')
 where email = 'robin.vanoepen@immobilien-vanoepen.de';

commit;
