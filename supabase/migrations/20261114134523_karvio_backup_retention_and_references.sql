-- Reject orphaned invoice/return lines at transaction commit while preserving
-- existing text API/backup compatibility. Existing data is validated explicitly;
-- any orphan stops migration rather than silently deleting business records.
alter table public."SaleItems" add constraint sale_items_sale_fk foreign key(sale_id) references public."Sales"(id) deferrable initially deferred not valid;
alter table public."PurchaseItems" add constraint purchase_items_purchase_fk foreign key(purchase_id) references public."Purchases"(id) deferrable initially deferred not valid;
alter table public."SalesReturnItems" add constraint sales_return_items_return_fk foreign key(return_id) references public."SalesReturns"(id) deferrable initially deferred not valid;
alter table public."PurchaseReturnItems" add constraint purchase_return_items_return_fk foreign key(return_id) references public."PurchaseReturns"(id) deferrable initially deferred not valid;
alter table public."SaleItems" validate constraint sale_items_sale_fk;
alter table public."PurchaseItems" validate constraint purchase_items_purchase_fk;
alter table public."SalesReturnItems" validate constraint sales_return_items_return_fk;
alter table public."PurchaseReturnItems" validate constraint purchase_return_items_return_fk;

create function karvio_private.prune_backups() returns bigint language plpgsql security invoker set search_path='' as $$
declare days integer; removed bigint;
begin
 select value::integer into days from public."Settings" where key='backup_keep_days' and value ~ '^[0-9]{1,3}$';
 days:=least(365,greatest(1,coalesce(days,30)));
 -- Retain the most recent ten recovery points even if every point is old.
 -- Apply age retention to all reasons, not just scheduled snapshots.
 delete from karvio_private.backups where created_at<now()-make_interval(days=>days)
  and id not in (select id from karvio_private.backups order by created_at desc,id desc limit 10);
 get diagnostics removed=row_count;
 return removed;
end $$;
revoke all on function karvio_private.prune_backups() from public,anon,authenticated;
grant execute on function karvio_private.prune_backups() to service_role;

create or replace function karvio_private.daily_backup() returns void language plpgsql security invoker
set search_path='' as $$
declare keep_days integer; enabled text; stamp text; pos bigint;
begin
 perform 1 from karvio_private.runtime where id for update;
 select value into enabled from public."Settings" where key='backup_daily';
 if coalesce(enabled,'true') <> 'true' then perform karvio_private.prune_backups(); return; end if;
 select value::integer into keep_days from public."Settings" where key='backup_keep_days' and value ~ '^[0-9]{1,3}$';
 keep_days:=least(365,greatest(1,coalesce(keep_days,30)));
 insert into karvio_private.backups(reason,snapshot) values('Scheduled daily backup',public.karvio_snapshot());
 perform karvio_private.prune_backups();
 stamp:=to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS');
 select coalesce(max(_position),1)+1 into pos from public."Settings";
 insert into public."Settings"(_position,key,value) values(pos,'last_daily_backup_at',stamp)
 on conflict(key) do update set value=excluded.value;
 update karvio_private.runtime set revision=revision+1,updated_at=now() where id;
end $$;
