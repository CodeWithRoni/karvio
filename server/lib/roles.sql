-- Cluster-wide roles, once per PostgreSQL server (run as the postgres superuser; setup.sh does this).
-- anon / authenticated / service_role are the roles Karvio's migrations grant to (as on Supabase).
-- The Karvio server logs in as "karvio", owns every shop database, and calls the API functions
-- as service_role, exactly as the Supabase Edge function does.
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
 if not exists (select 1 from pg_roles where rolname='karvio') then create role karvio login createdb; end if;
end $$;
grant service_role to karvio;
