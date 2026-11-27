-- The server makes its own backup encryption key the first time one is needed, and the owner enters the
-- Google Client ID / secret for Drive backups in Settings → Database. Both live in karvio_private.config:
-- never part of a backup, never sent to a browser (the Google secret is also sealed with the backup key).

-- Edge function: this shop's backup key, created once (about 360 random bits).
create function public.karvio_backup_key() returns text language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 insert into karvio_private.config(key,value,updated_at)
 values('backup_key',replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),now())
 on conflict(key) do nothing;
 select value into k from karvio_private.config where key='backup_key';
 return k;
end $$;

-- Edge function: the owner's Google OAuth client ({client_id, secret}, secret sealed) or null.
create function public.karvio_drive_client() returns jsonb language sql security invoker set search_path='' as $$
 select value::jsonb from karvio_private.config where key='drive_client';
$$;
create function public.karvio_drive_client_save(client jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if client is null then delete from karvio_private.config where key='drive_client'; return true; end if;
 if jsonb_typeof(client)<>'object' or octet_length(client::text)>4096 then raise exception 'BACKUP: Invalid Google keys'; end if;
 insert into karvio_private.config(key,value,updated_at) values('drive_client',client::text,now())
 on conflict(key) do update set value=excluded.value,updated_at=now();
 return true;
end $$;

do $$ declare f text; begin
 foreach f in array array['karvio_backup_key()','karvio_drive_client()','karvio_drive_client_save(jsonb)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',f);
  execute format('grant execute on function public.%s to service_role',f);
 end loop;
end $$;
