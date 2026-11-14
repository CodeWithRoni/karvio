-- The engine's private sheets (transaction journal, request receipts, quotation links) move out of the
-- single runtime JSON into rows. Before: every request read, and every save rewrote, all of them
-- (request receipts alone are ~135 KB on a live shop). After: a request reads only the sheets it uses
-- and a save writes only the rows that changed.
--
-- Either rollout order is safe. The deploy workflow applies migrations first, so the previous Edge
-- build keeps serving for about a minute against this layout: its reads (karvio_snapshot,
-- karvio_snapshot_for, karvio_snapshot_request) still return the private sheets inside metadata,
-- and anything that still writes "privateSheets" into runtime.metadata (that build, or the restore
-- worker resetting the shop) is moved into the rows by a trigger. The new build reads through
-- karvio_read, which skips that legacy copy.

create table karvio_private.private_sheets (
 name text primary key check (name ~ '^__Karvio[A-Za-z]{1,60}$'),
 columns integer not null default 1 check (columns between 1 and 1000)
);
create table karvio_private.private_rows (
 sheet text not null references karvio_private.private_sheets(name) on delete cascade,
 position integer not null check (position between 1 and 2000000),
 cells jsonb not null check (jsonb_typeof(cells) = 'array'),
 primary key (sheet, position)
);
alter table karvio_private.private_sheets enable row level security;
alter table karvio_private.private_rows enable row level security;
revoke all on karvio_private.private_sheets, karvio_private.private_rows from public, anon, authenticated;

-- A row whose cells are all empty is the same as no row (the engine reads blanks for both).
create function karvio_private.blank_cells(cells jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(cells) <> 'array' or not exists(
  select 1 from jsonb_array_elements(cells) v where v <> '""'::jsonb and v <> 'null'::jsonb)
$$;

-- Replace all private sheets with the content of a legacy {"name":{"rows":[...],"columns":n}} object.
create function karvio_private.replace_private_sheets(sheets jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(sheets) is distinct from 'object' then raise exception 'Invalid private sheets'; end if;
 delete from karvio_private.private_sheets;
 insert into karvio_private.private_sheets(name, columns)
 select key, greatest(1, least(1000, coalesce(case when jsonb_typeof(value->'columns') = 'number' then (value->>'columns')::numeric::integer end, 1)))
 from jsonb_each(sheets);
 insert into karvio_private.private_rows(sheet, position, cells)
 select s.key, r.ord, r.cells
 from jsonb_each(sheets) s, jsonb_array_elements(case when jsonb_typeof(s.value->'rows') = 'array' then s.value->'rows' else '[]' end) with ordinality r(cells, ord)
 where not karvio_private.blank_cells(r.cells);
end $$;

-- Legacy writers: move "privateSheets" out of the runtime JSON before it is stored.
create function karvio_private.runtime_private_rows() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.metadata ? 'privateSheets' then
  perform karvio_private.replace_private_sheets(new.metadata->'privateSheets');
  new.metadata := new.metadata - 'privateSheets';
 end if;
 return new;
end $$;
create trigger runtime_private_rows before insert or update of metadata on karvio_private.runtime
 for each row execute function karvio_private.runtime_private_rows();

-- Move today's content (the trigger does it) and make every in-flight request start again.
update karvio_private.runtime set metadata = metadata, revision = revision + 1, updated_at = now() where id;

-- {"privateSheets":{name:{columns,rows:[[position,cells],...]}}, "privateNames":[all existing], "privateRows":true}
create function karvio_private.private_payload(names text[]) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'privateRows', true,
  'privateNames', coalesce((select jsonb_agg(name order by name) from karvio_private.private_sheets), '[]'),
  'privateSheets', coalesce((select jsonb_object_agg(s.name, jsonb_build_object('columns', s.columns,
     'rows', coalesce((select jsonb_agg(jsonb_build_array(r.position, r.cells) order by r.position)
       from karvio_private.private_rows r where r.sheet = s.name), '[]')))
   from karvio_private.private_sheets s where s.name = any(coalesce(names, '{}'))), '{}'))
$$;

-- The legacy layout of every private sheet: {name:{columns, rows:[cells of row 1, row 2, ...]}}.
create function karvio_private.legacy_private_sheets() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(s.name, jsonb_build_object('columns', s.columns, 'rows', coalesce((
   select jsonb_agg(coalesce(r.cells, (select jsonb_agg('""'::jsonb) from generate_series(1, s.columns))) order by g.p)
   from generate_series(1, (select max(x.position) from karvio_private.private_rows x where x.sheet = s.name)) g(p)
   left join karvio_private.private_rows r on r.sheet = s.name and r.position = g.p), '[]'))), '{}')
 from karvio_private.private_sheets s
$$;
-- Reads made through karvio_read set karvio.private_rows for their transaction and get no legacy copy.
create function karvio_private.legacy_snapshot(snap jsonb) returns jsonb language sql stable security invoker set search_path='' as $$
 select case when snap is null or snap->'metadata' is null or coalesce(current_setting('karvio.private_rows', true), '') = 'on' then snap
  else jsonb_set(snap, '{metadata,privateSheets}', karvio_private.legacy_private_sheets()) end
$$;
revoke all on function karvio_private.legacy_private_sheets(), karvio_private.legacy_snapshot(jsonb) from public, anon, authenticated;
grant execute on function karvio_private.legacy_private_sheets(), karvio_private.legacy_snapshot(jsonb) to service_role;
-- The three reads an older Edge build calls keep their names; their bodies move to karvio_private.
alter function public.karvio_snapshot() set schema karvio_private;
alter function karvio_private.karvio_snapshot() rename to snapshot_all;
alter function public.karvio_snapshot_for(text) set schema karvio_private;
alter function karvio_private.karvio_snapshot_for(text) rename to snapshot_for;
alter function public.karvio_snapshot_request(text,jsonb) set schema karvio_private;
alter function karvio_private.karvio_snapshot_request(text,jsonb) rename to snapshot_request;
revoke all on function karvio_private.snapshot_all(), karvio_private.snapshot_for(text), karvio_private.snapshot_request(text,jsonb) from public, anon, authenticated;
grant execute on function karvio_private.snapshot_all(), karvio_private.snapshot_for(text), karvio_private.snapshot_request(text,jsonb) to service_role;
create function public.karvio_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
begin return karvio_private.legacy_snapshot(karvio_private.snapshot_all()); end $$;
create function public.karvio_snapshot_for(action_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin return karvio_private.legacy_snapshot(karvio_private.snapshot_for(action_name)); end $$;
create function public.karvio_snapshot_request(action_name text, payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
begin return karvio_private.legacy_snapshot(karvio_private.snapshot_request(action_name, payload)); end $$;
revoke all on function public.karvio_snapshot(), public.karvio_snapshot_for(text), public.karvio_snapshot_request(text,jsonb) from public, anon, authenticated;
grant execute on function public.karvio_snapshot(), public.karvio_snapshot_for(text), public.karvio_snapshot_request(text,jsonb) to service_role;

-- One read entry point: the existing scoped/table/whole-shop reads plus the private sheets asked for.
-- Each underlying read holds the runtime row FOR SHARE until this call's transaction ends, so the
-- private rows come from the same moment as the business rows.
create function public.karvio_read(kind text, action_name text default '', payload jsonb default '{}',
 table_names text[] default null, private_names text[] default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare snap jsonb;
begin
 perform set_config('karvio.private_rows', 'on', true);
 snap := case kind
  when 'rows' then public.karvio_snapshot_request(action_name, coalesce(payload, '{}'))
  when 'scoped' then public.karvio_snapshot_scoped(action_name, coalesce(payload, '{}'))
  when 'tables' then public.karvio_snapshot_tables(table_names)
  when 'unscoped' then public.karvio_snapshot_for(action_name)
  when 'full' then public.karvio_snapshot()
  else null end;
 if kind not in ('rows','scoped','tables','unscoped','full') then raise exception 'Invalid read kind'; end if;
 if snap is null then return null; end if;
 return snap || karvio_private.private_payload(private_names);
end $$;
revoke all on function public.karvio_read(text,text,jsonb,text[],text[]) from public, anon, authenticated;
grant execute on function public.karvio_read(text,text,jsonb,text[],text[]) to service_role;

-- Commit = the existing business-row commit, then only the private rows that changed, in one transaction.
-- private_changes: {name: {"columns":n, "upsert":[[position,cells],...], "remove":[position,...]}}
create function public.karvio_commit_rows(expected_revision bigint, changes jsonb, next_metadata jsonb,
 private_changes jsonb default '{}', setup_token_hash text default null, initialize_owner boolean default false,
 backup_reason text default null, sms_jobs jsonb default '[]') returns jsonb language plpgsql security invoker set search_path='' as $$
declare res jsonb; s text; d jsonb;
begin
 if jsonb_typeof(next_metadata) is distinct from 'object' or next_metadata ? 'privateSheets' then raise exception 'Invalid runtime metadata'; end if;
 if jsonb_typeof(private_changes) is distinct from 'object' then raise exception 'Invalid private delta'; end if;
 res := public.karvio_commit_delta(expected_revision, changes, next_metadata, setup_token_hash, initialize_owner, backup_reason, sms_jobs);
 if not coalesce((res->>'committed')::boolean, false) then return res; end if;
 for s, d in select * from jsonb_each(private_changes) loop
  if s !~ '^__Karvio[A-Za-z]{1,60}$' or jsonb_typeof(d) is distinct from 'object'
   or jsonb_typeof(coalesce(d->'upsert','[]')) <> 'array' or jsonb_typeof(coalesce(d->'remove','[]')) <> 'array' then
   raise exception 'Invalid private delta';
  end if;
  insert into karvio_private.private_sheets(name, columns)
  values (s, greatest(1, least(1000, coalesce(case when jsonb_typeof(d->'columns') = 'number' then (d->>'columns')::numeric::integer end, 1))))
  on conflict (name) do update set columns = excluded.columns;
  delete from karvio_private.private_rows where sheet = s and position in (
   select (v #>> '{}')::integer from jsonb_array_elements(coalesce(d->'remove','[]')) v
   union select (u->>0)::integer from jsonb_array_elements(coalesce(d->'upsert','[]')) u);
  insert into karvio_private.private_rows(sheet, position, cells)
  select s, (u->>0)::integer, u->1 from jsonb_array_elements(coalesce(d->'upsert','[]')) u
  where not karvio_private.blank_cells(u->1);
 end loop;
 return res;
end $$;
revoke all on function public.karvio_commit_rows(bigint,jsonb,jsonb,jsonb,text,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.karvio_commit_rows(bigint,jsonb,jsonb,jsonb,text,boolean,text,jsonb) to service_role;
