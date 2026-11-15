-- Request limits with separate buckets, so requests without a session cannot lock out working staff.
-- Before: every request without a valid session (sign-in, public invoice/quotation links, pings) shared
-- one 180/minute bucket, and all requests shared one 900/minute shop bucket, so a flood of anonymous
-- requests could block every signed-in counter.
--   signed in: shop bucket 900/min + 180/min per user (unchanged)
--   no session: sign-in 60/min, public invoice/quotation links 300/min, anything else 120/min;
--               these never count against the shop bucket.
-- The one-argument karvio_request_limit stays for the previous Edge build during a deploy.
create function public.karvio_request_limit(session_key text, action_name text) returns boolean language plpgsql security invoker set search_path='' as $$
declare cached jsonb; session_data jsonb; user_id text;
begin
 if length(session_key)<=516 and session_key like 'tok_%' then
  select metadata->'cache'->session_key into cached from karvio_private.runtime where id;
  if cached is not null and (cached->>'until')::numeric > extract(epoch from now())*1000 then
   session_data:=(cached->>'text')::jsonb;
   user_id:=session_data->>'id';
  end if;
 end if;
 if user_id is not null then
  if not public.karvio_rate_limit('shop-total',900,60) then return false; end if;
  return public.karvio_rate_limit('user:'||user_id,180,60);
 end if;
 if action_name in ('login','owner.initialize') then return public.karvio_rate_limit('anonymous:sign-in',60,60); end if;
 if action_name in ('invoice.public','quote.public') then return public.karvio_rate_limit('anonymous:links',300,60); end if;
 return public.karvio_rate_limit('anonymous:other',120,60);
end $$;
revoke all on function public.karvio_request_limit(text,text) from public,anon,authenticated;
grant execute on function public.karvio_request_limit(text,text) to service_role;
