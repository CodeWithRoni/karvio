-- Automatic backup to the owner's Google Drive (Settings → Database → Automatic backup).
-- Every night at 00:00 Asia/Dhaka, pg_cron asks the Edge function to make an encrypted backup and upload it.
-- As with the daily summary SMS, each call carries a one-time code (stored only as a hash) that the Edge
-- function must redeem first. The Google sign-in is kept in karvio_private.config, sealed by the Edge function
-- with KARVIO_BACKUP_KEY; it is never part of a backup and never sent to a browser.

grant insert on karvio_private.cron_nonces to service_role;
grant delete on karvio_private.config to service_role;

-- Edge function: the Drive state (connected account, folder, last result) or null.
create function public.karvio_drive_state() returns jsonb language sql security invoker set search_path='' as $$
 select value::jsonb from karvio_private.config where key='drive_backup';
$$;
create function public.karvio_drive_state_save(state jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if state is null then delete from karvio_private.config where key='drive_backup'; return true; end if;
 if jsonb_typeof(state)<>'object' or octet_length(state::text)>16384 then raise exception 'BACKUP: Invalid Drive state'; end if;
 insert into karvio_private.config(key,value,updated_at) values('drive_backup',state::text,now())
 on conflict(key) do update set value=excluded.value,updated_at=now();
 return true;
end $$;

-- Edge function: a one-time code for the Google sign-in window (15 minutes). Only its hash is stored.
create function public.karvio_oauth_state_mint() returns text language plpgsql security invoker set search_path='' as $$
declare nonce text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 delete from karvio_private.cron_nonces where expires_at<now();
 insert into karvio_private.cron_nonces(nonce_hash,expires_at) values(encode(sha256(convert_to('oauth|'||nonce,'UTF8')),'hex'),now()+interval '15 minutes');
 return nonce;
end $$;
create function public.karvio_oauth_state_claim(nonce text) returns boolean language plpgsql security invoker set search_path='' as $$
declare found boolean;
begin
 if nonce is null or length(nonce)<32 or length(nonce)>128 then return false; end if;
 delete from karvio_private.cron_nonces where expires_at<now();
 delete from karvio_private.cron_nonces where nonce_hash=encode(sha256(convert_to('oauth|'||nonce,'UTF8')),'hex') returning true into found;
 return coalesce(found,false);
end $$;

-- Edge function (after redeeming a scheduler code or checking the Administrator's session):
-- the same bounded export the Download button uses, owned by the Administrator account.
create function public.karvio_drive_export_begin(request_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public."Users"; job karvio_private.transfer_jobs; new_id text:=gen_random_uuid()::text; key text;
begin
 if request_key is null or length(request_key) not between 1 and 180 then raise exception 'BACKUP: Request ID required'; end if;
 key:='drive:'||request_key;
 select * into actor from public."Users" where username='admin' and role='admin' and active limit 1;
 if actor.id is null then raise exception 'BACKUP: The Administrator account is missing or inactive'; end if;
 delete from karvio_private.transfer_jobs where expires_at<now() and kind<>'safety';
 select * into job from karvio_private.transfer_jobs j where j.owner_id=actor.id and j.kind='export' and j.request_key=key;
 if job.id is not null then
  if job.state<>'ready' then raise exception 'BACKUP: This backup was already completed'; end if;
  return jsonb_build_object('job_id',job.id,'manifest',job.manifest);
 end if;
 perform 1 from karvio_private.runtime where id for share;
 insert into karvio_private.transfer_jobs(id,owner_id,owner_credential,kind,state,request_key,expires_at)
 values(new_id,actor.id,actor.password_hash,'export','ready',key,now()+interval '2 hours');
 perform karvio_private.transfer_copy(new_id);
 update karvio_private.transfer_jobs set manifest=karvio_private.transfer_manifest(new_id) where id=new_id returning * into job;
 return jsonb_build_object('job_id',job.id,'manifest',job.manifest);
end $$;
create function public.karvio_drive_export_page(job_id text,table_name text,after_position bigint default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; payload text; cursor bigint; n integer; finished boolean;
begin
 select * into job from karvio_private.transfer_jobs j where j.id=karvio_drive_export_page.job_id;
 if job.id is null or job.kind<>'export' or job.request_key not like 'drive:%' or job.state<>'ready' or job.expires_at<=now()
  or not(table_name=any(karvio_private.transfer_stream_names())) or after_position<0 then raise exception 'BACKUP: Invalid export page'; end if;
 with limited as (select r.position,r.record,r.size_bytes+1 as bytes from karvio_private.transfer_rows r
  where r.job_id=karvio_drive_export_page.job_id and r.table_name=karvio_drive_export_page.table_name and r.position>after_position order by r.position limit 1000),
 sized as(select *,sum(bytes) over(order by position) as through,row_number() over(order by position) as rn from limited)
 select coalesce(jsonb_agg(record order by position),'[]'::jsonb)::text,max(position),count(*)::int into payload,cursor,n from sized where through<=262144 or rn=1;
 cursor:=coalesce(cursor,after_position);
 select not exists(select 1 from karvio_private.transfer_rows r where r.job_id=karvio_drive_export_page.job_id and r.table_name=karvio_drive_export_page.table_name and r.position>cursor) into finished;
 return jsonb_build_object('payload',payload,'sha256',karvio_private.transfer_sha(payload),'next_cursor',cursor,'rows',n,'done',finished);
end $$;
-- uploaded=true: the file is safely in Drive (records "Last backup"); false: drop the staged copy.
create function public.karvio_drive_export_close(job_id text,uploaded boolean) returns boolean language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; pos bigint;
begin
 select * into job from karvio_private.transfer_jobs j where j.id=karvio_drive_export_close.job_id;
 if job.id is null or job.kind<>'export' or job.request_key not like 'drive:%' then return false; end if;
 if uploaded and job.state='ready' then
  perform 1 from karvio_private.runtime where id for update;
  select coalesce(max(_position),1)+1 into pos from public."Settings";
  insert into public."Settings"(_position,key,value) values(pos,'last_backup_at',to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS')) on conflict(key) do update set value=excluded.value;
  update karvio_private.runtime set revision=revision+1,updated_at=now() where id;
 end if;
 update karvio_private.transfer_jobs set state='done' where id=job_id;
 delete from karvio_private.transfer_rows where transfer_rows.job_id=karvio_drive_export_close.job_id;
 return true;
end $$;

-- pg_cron (database owner): when Drive is connected, mint a code and ask the Edge function to back up.
create function karvio_private.drive_tick() returns void language plpgsql security invoker set search_path='' as $$
declare url text; state jsonb; nonce text;
begin
 select value::jsonb into state from karvio_private.config where key='drive_backup';
 if state is null or coalesce(state->>'refresh','')='' or coalesce((state->>'enabled')::boolean,true)=false then return; end if;
 select value into url from karvio_private.config where key='edge_endpoint';
 if url is null then return; end if;
 nonce:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into karvio_private.cron_nonces(nonce_hash,expires_at) values(encode(sha256(convert_to(nonce,'UTF8')),'hex'),now()+interval '5 minutes');
 perform net.http_post(url := url, body := jsonb_build_object('action','backup.drive.tick','payload',jsonb_build_object('nonce',nonce)),
   headers := jsonb_build_object('Content-Type','application/json'), timeout_milliseconds := 20000);
end $$;
revoke all on function karvio_private.drive_tick() from public, anon, authenticated;
-- 18:00 UTC = 00:00 Asia/Dhaka.
select cron.schedule('karvio-drive-backup','0 18 * * *','select karvio_private.drive_tick();');

do $$ declare f text; begin
 foreach f in array array['karvio_drive_state()','karvio_drive_state_save(jsonb)','karvio_oauth_state_mint()','karvio_oauth_state_claim(text)',
  'karvio_drive_export_begin(text)','karvio_drive_export_page(text,text,bigint)','karvio_drive_export_close(text,boolean)'] loop
  execute format('revoke all on function public.%s from public,anon,authenticated',f);
  execute format('grant execute on function public.%s to service_role',f);
 end loop;
end $$;
