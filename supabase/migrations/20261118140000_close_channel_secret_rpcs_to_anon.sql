-- get_channel_secret returns a decrypted vault secret and checks nothing itself. It was reachable
-- with the anon key, which ships in the browser bundle, so anyone who opened the Hub could ask for
-- the Microsoft Graph client secret or the Lexware API key by name. Only notify-dispatch calls it,
-- as the service role, so authenticated loses it too.
--
-- set_channel_secret and channel_secret_present already refuse a non-admin in their own bodies, so
-- nothing could be written or probed through them. They keep authenticated because the admin
-- notification-channel screen calls both from the browser; they lose anon as defence in depth,
-- so the grant stops depending on the body alone.

begin;

revoke execute on function public.get_channel_secret(text) from public;
revoke execute on function public.get_channel_secret(text) from anon;
revoke execute on function public.get_channel_secret(text) from authenticated;

revoke execute on function public.set_channel_secret(text, text) from public;
revoke execute on function public.set_channel_secret(text, text) from anon;
grant execute on function public.set_channel_secret(text, text) to authenticated;

revoke execute on function public.channel_secret_present(text) from public;
revoke execute on function public.channel_secret_present(text) from anon;
grant execute on function public.channel_secret_present(text) to authenticated;

commit;
