-- Remove the `outgoing_invoice` notification target.
--
-- It was seeded in 20260911100000 alongside the other record types, but no Hub has an outgoing
-- invoice DETAIL page: /ausgangsrechnungen has index, hochladen and (on two hubs) neu, and nothing
-- addressable by id. So a notification of that kind would validate, send, and then drop the
-- recipient somewhere that cannot show them the record.
--
-- A kind that links nowhere is worse than an absent one: the sender believes they pointed at
-- something. Putting it back is one insert once the page exists.
--
-- Existing rows are left alone. Nothing has sent one (the kind shipped this morning and the UI
-- never offered it), and if one did exist its stored path would still be honoured.

begin;

delete from public.notification_target_kinds where kind = 'outgoing_invoice';

commit;
