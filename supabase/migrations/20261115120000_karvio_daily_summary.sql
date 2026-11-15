-- Daily summary SMS for the owner (Settings → SMS → Daily summary).
-- Every 15 minutes between 17:00 and 23:59 Dhaka time, pg_cron asks the Edge function to check whether the
-- summary is due. Each call carries a one-time code (5 minutes, stored only as a hash) that the Edge function
-- must redeem first, so nobody else can trigger SMS. The Edge function records its own address on start-up;
-- until then the job does nothing. Older Edge builds answer "Unknown action" and nothing is sent.
create extension if not exists pg_net;

create table karvio_private.config (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table karvio_private.config enable row level security;
revoke all on karvio_private.config from public, anon, authenticated;
grant select, insert, update on karvio_private.config to service_role;

create table karvio_private.cron_nonces (nonce_hash text primary key, expires_at timestamptz not null);
alter table karvio_private.cron_nonces enable row level security;
revoke all on karvio_private.cron_nonces from public, anon, authenticated;
grant select, delete on karvio_private.cron_nonces to service_role;

-- Edge function: remember where to reach it (only https URLs ending in /functions/v1/karvio-api).
create function public.karvio_register_endpoint(endpoint_url text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if endpoint_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/functions/v1/karvio-api$' then return false; end if;
 insert into karvio_private.config(key,value,updated_at) values('edge_endpoint',endpoint_url,now())
 on conflict(key) do update set value=excluded.value,updated_at=now() where karvio_private.config.value is distinct from excluded.value;
 return true;
end $$;
revoke all on function public.karvio_register_endpoint(text) from public, anon, authenticated;
grant execute on function public.karvio_register_endpoint(text) to service_role;

-- Edge function: redeem a one-time code (true once, then never again).
create function public.karvio_cron_claim(nonce text) returns boolean language plpgsql security invoker set search_path='' as $$
declare found boolean;
begin
 if nonce is null or length(nonce) < 32 or length(nonce) > 128 then return false; end if;
 delete from karvio_private.cron_nonces where expires_at < now();
 delete from karvio_private.cron_nonces where nonce_hash = encode(sha256(convert_to(nonce,'UTF8')),'hex') returning true into found;
 return coalesce(found,false);
end $$;
revoke all on function public.karvio_cron_claim(text) from public, anon, authenticated;
grant execute on function public.karvio_cron_claim(text) to service_role;

-- pg_cron (database owner): mint a code and post it to the Edge function.
create function karvio_private.summary_tick() returns void language plpgsql security invoker set search_path='' as $$
declare url text; enabled text; nonce text;
begin
 select value into enabled from public."Settings" where key='daily_summary_enabled';
 if coalesce(enabled,'false') <> 'true' then return; end if;
 select value into url from karvio_private.config where key='edge_endpoint';
 if url is null then return; end if;
 nonce := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into karvio_private.cron_nonces(nonce_hash,expires_at) values(encode(sha256(convert_to(nonce,'UTF8')),'hex'),now()+interval '5 minutes');
 perform net.http_post(url := url, body := jsonb_build_object('action','summary.tick','payload',jsonb_build_object('nonce',nonce)),
   headers := jsonb_build_object('Content-Type','application/json'), timeout_milliseconds := 20000);
end $$;
revoke all on function karvio_private.summary_tick() from public, anon, authenticated;
-- 11:00–17:45 UTC = 17:00–23:45 Asia/Dhaka.
select cron.schedule('karvio-daily-summary','*/15 11-17 * * *','select karvio_private.summary_tick();');
