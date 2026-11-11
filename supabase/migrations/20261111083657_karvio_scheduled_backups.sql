-- Daily in-project safety snapshots. Exports kept off-project are still recommended.
create extension if not exists pg_cron;
create function karvio_private.daily_backup() returns void language plpgsql security invoker
set search_path='' as $$
declare keep_days integer; enabled text; stamp text; pos bigint;
begin
 perform 1 from karvio_private.runtime where id for update;
 select value into enabled from public."Settings" where key='backup_daily';
 if coalesce(enabled,'true') <> 'true' then return; end if;
 select value::integer into keep_days from public."Settings" where key='backup_keep_days' and value ~ '^[0-9]{1,3}$';
 keep_days:=least(365,greatest(1,coalesce(keep_days,30)));
 insert into karvio_private.backups(reason,snapshot) values('Scheduled daily backup',public.karvio_snapshot());
 delete from karvio_private.backups where reason='Scheduled daily backup' and created_at<now()-make_interval(days=>keep_days);
 stamp:=to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS');
 select coalesce(max(_position),1)+1 into pos from public."Settings";
 insert into public."Settings"(_position,key,value) values(pos,'last_daily_backup_at',stamp)
 on conflict(key) do update set value=excluded.value;
 update karvio_private.runtime set revision=revision+1,updated_at=now() where id;
end $$;
revoke all on function karvio_private.daily_backup() from public,anon,authenticated;
-- Cron runs as the database owner. 20:00 UTC = 02:00 Asia/Dhaka.
select cron.schedule('karvio-daily-backup','0 20 * * *','select karvio_private.daily_backup();');
