-- Answers of heavy read-only screens (dashboard, reports, profit) are kept until the shop changes.
-- The dashboard refreshes every 30 seconds; when nothing was saved since the last answer, the same
-- answer is returned without reading the shop again. An answer is only reused when ALL of these hold:
--  * the shop's revision is unchanged (any save, sign-in, sign-out or password change moves it);
--  * it is for the same signed-in user, whose session is valid and was renewed in the last 15 minutes
--    (older sessions take the normal path, which renews them);
--  * it is the same calendar day in Dhaka (answers use "today");
--  * the user is active and has no working-hours limit (those are checked on every request).

create table karvio_private.read_cache (
 cache_key text primary key,
 revision bigint not null,
 user_id text not null,
 day text not null,
 response jsonb not null,
 created_at timestamptz not null default now()
);
alter table karvio_private.read_cache enable row level security;
revoke all on karvio_private.read_cache from public, anon, authenticated;

-- The signed-in user of a token, under the same rules as the engine's session check; null if not usable.
create function karvio_private.cache_session_user(token text, metadata jsonb) returns text language plpgsql stable security invoker set search_path='' as $$
declare entry jsonb; session_data jsonb; now_ms numeric := extract(epoch from now()) * 1000; refreshed numeric;
begin
 if token is null or length(token) < 32 or length(token) > 512 then return null; end if;
 entry := metadata->'cache'->('tok_' || token);
 if entry is null or jsonb_typeof(entry->'until') <> 'number' or (entry->>'until')::numeric <= now_ms then return null; end if;
 begin session_data := (entry->>'text')::jsonb; exception when others then return null; end;
 if jsonb_typeof(session_data) <> 'object' or jsonb_typeof(session_data->'id') <> 'string' or jsonb_typeof(session_data->'refreshed') <> 'number' then return null; end if;
 refreshed := (session_data->>'refreshed')::numeric;
 if refreshed > now_ms or now_ms - refreshed > 15 * 60 * 1000 then return null; end if;
 if not exists(select 1 from public."Users" u where u.id = session_data->>'id' and u.active and not coalesce(u.access_limit, false)) then return null; end if;
 return session_data->>'id';
end $$;

create function public.karvio_cached_read(token text, cache_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; uid text; c record;
begin
 select revision, metadata into r from karvio_private.runtime where id;
 uid := karvio_private.cache_session_user(token, r.metadata);
 if uid is null then return null; end if;
 select * into c from karvio_private.read_cache x where x.cache_key = karvio_cached_read.cache_key || '|' || uid;
 if not found or c.revision <> r.revision or c.user_id <> uid or c.day <> to_char(now() at time zone 'Asia/Dhaka', 'YYYY-MM-DD') then return null; end if;
 return c.response;
end $$;
revoke all on function public.karvio_cached_read(text,text) from public, anon, authenticated;
grant execute on function public.karvio_cached_read(text,text) to service_role;

create function public.karvio_cache_store(token text, cache_key text, revision bigint, response jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r record; uid text;
begin
 if length(cache_key) > 300 or pg_column_size(response) > 4 * 1024 * 1024 then return false; end if;
 select x.revision, x.metadata into r from karvio_private.runtime x where id;
 -- Only an answer computed from the current shop state, for a session that may use the cache.
 if r.revision <> karvio_cache_store.revision then return false; end if;
 uid := karvio_private.cache_session_user(token, r.metadata);
 if uid is null then return false; end if;
 insert into karvio_private.read_cache(cache_key, revision, user_id, day, response)
 values (karvio_cache_store.cache_key || '|' || uid, r.revision, uid, to_char(now() at time zone 'Asia/Dhaka', 'YYYY-MM-DD'), response)
 on conflict on constraint read_cache_pkey do update set revision = excluded.revision, user_id = excluded.user_id, day = excluded.day,
  response = excluded.response, created_at = now();
 -- Answers for older revisions can never be used again.
 delete from karvio_private.read_cache x where x.revision < r.revision;
 return true;
end $$;
revoke all on function public.karvio_cache_store(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.karvio_cache_store(text,text,bigint,jsonb) to service_role;
