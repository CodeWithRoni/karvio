-- Off-site backups: a GitHub Actions job reads the shop through the Supabase Management API (as the
-- database owner) and stores the same .karvio.gz file the app downloads, encrypted, outside Supabase.
-- No Karvio sign-in is involved, so these functions are not callable by any API role.
create function karvio_private.offsite_export_begin() returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; new_id text := 'offsite-' || gen_random_uuid()::text;
begin
 delete from karvio_private.transfer_jobs where owner_id = 'offsite' or (expires_at < now() and kind <> 'safety');
 -- Saves wait while the copy is taken (same as the app's export), so every table is from one moment.
 perform 1 from karvio_private.runtime where id for share;
 insert into karvio_private.transfer_jobs(id, owner_id, owner_credential, kind, state, request_key, expires_at)
 values (new_id, 'offsite', 'offsite', 'export', 'ready', new_id, now() + interval '6 hours');
 perform karvio_private.transfer_copy(new_id);
 update karvio_private.transfer_jobs set manifest = karvio_private.transfer_manifest(new_id) where id = new_id returning * into job;
 return jsonb_build_object('job_id', job.id, 'manifest', job.manifest);
end $$;

-- Same pages as public.karvio_export_page (at most 1000 rows / 256 KiB each).
create function karvio_private.offsite_export_page(job_id text, table_name text, after_position bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload text; cursor bigint; n integer; finished boolean;
begin
 if not exists(select 1 from karvio_private.transfer_jobs j where j.id = offsite_export_page.job_id and j.owner_id = 'offsite' and j.state = 'ready' and j.expires_at > now())
  or not (table_name = any(karvio_private.transfer_names())) or after_position is null or after_position < 0 then
  raise exception 'Invalid off-site export page';
 end if;
 with limited as (select r.position, r.record, r.size_bytes + 1 as bytes from karvio_private.transfer_rows r
  where r.job_id = offsite_export_page.job_id and r.table_name = offsite_export_page.table_name and r.position > after_position order by r.position limit 1000),
 sized as (select *, sum(bytes) over (order by position) as through, row_number() over (order by position) as rn from limited)
 select coalesce(jsonb_agg(record order by position), '[]'::jsonb)::text, max(position), count(*)::int into payload, cursor, n from sized where through <= 262144 or rn = 1;
 cursor := coalesce(cursor, after_position);
 select not exists(select 1 from karvio_private.transfer_rows r where r.job_id = offsite_export_page.job_id and r.table_name = offsite_export_page.table_name and r.position > cursor) into finished;
 return jsonb_build_object('payload', payload, 'sha256', karvio_private.transfer_sha(payload), 'next_cursor', cursor, 'rows', n, 'done', finished);
end $$;

-- Drops the staged copy. The shop's own data and "last backup" time are not touched.
create function karvio_private.offsite_export_close(job_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 delete from karvio_private.transfer_jobs j where j.id = offsite_export_close.job_id and j.owner_id = 'offsite';
 return '{"ok":true}'::jsonb;
end $$;

revoke all on function karvio_private.offsite_export_begin(), karvio_private.offsite_export_page(text,text,bigint), karvio_private.offsite_export_close(text) from public, anon, authenticated, service_role;
