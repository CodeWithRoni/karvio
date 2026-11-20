-- Align hosted summaries with service lifecycle and decimal currency rounding. No historical row rewrite.
create or replace function karvio_private.read_metrics(action_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare out jsonb:='{}'; balances jsonb; history jsonb; customer_history jsonb; supplier_history jsonb; usage jsonb; reserved jsonb;
begin
 if action_name in ('bootstrap','accounts.list') then
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Accounts"
   union all select account_id,_position,case direction when 'in' then amount::double precision else -amount::double precision end from public."AccountTxns" where not coalesce(voided,false)),
  totals as(select a.id,floor((sum(e.amount order by e.pos))::text::numeric*100+0.5)/100 as balance from public."Accounts" a join entries e on e.id=a.id group by a.id)
  select coalesce(jsonb_object_agg(id,balance),'{}') into balances from totals;
  select coalesce(jsonb_object_agg(id,true),'{}') into history from (select account_id id from public."AccountTxns" union select account_id from public."Expenses") x where id is not null and id<>'';
  out:=out||jsonb_build_object('accountBalances',balances,'accountHistory',history);
 end if;
 if action_name in ('bootstrap','customers.list','suppliers.list') then
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Customers"
   union all select customer_id,_position,coalesce(debit,0)::double precision-coalesce(credit,0)::double precision from public."CustomerLedger" where not coalesce(voided,false)),
  totals as(select a.id,floor((sum(e.amount order by e.pos))::text::numeric*100+0.5)/100 as balance from public."Customers" a join entries e on e.id=a.id group by a.id)
  select coalesce(jsonb_object_agg(id,balance),'{}') into balances from totals;
  out:=out||jsonb_build_object('customerBalances',balances);
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Suppliers"
   union all select supplier_id,_position,coalesce(credit,0)::double precision-coalesce(debit,0)::double precision from public."SupplierLedger" where not coalesce(voided,false)),
  totals as(select a.id,floor((sum(e.amount order by e.pos))::text::numeric*100+0.5)/100 as balance from public."Suppliers" a join entries e on e.id=a.id group by a.id)
  select coalesce(jsonb_object_agg(id,balance),'{}') into balances from totals;
  out:=out||jsonb_build_object('supplierBalances',balances);
  select coalesce(jsonb_object_agg(id,true),'{}') into customer_history from (select customer_id id from public."Sales" union select customer_id from public."SalesReturns" union select customer_id from public."CustomerLedger" union select customer_id from public."Repairs" union select customer_id from public."WarrantyClaims") x where id is not null and id<>'';
  select coalesce(jsonb_object_agg(id,true),'{}') into supplier_history from (select supplier_id id from public."Purchases" union select supplier_id from public."PurchaseReturns" union select supplier_id from public."SupplierLedger") x where id is not null and id<>'';
  select customer_history||coalesce(jsonb_object_agg(id,true),'{}') into customer_history from public."Customers" where coalesce(link_id,'')<>'' and supplier_history ? link_id;
  select supplier_history||coalesce(jsonb_object_agg(id,true),'{}') into supplier_history from public."Suppliers" where coalesce(link_id,'')<>'' and customer_history ? link_id;
  out:=out||jsonb_build_object('partyHistory',jsonb_build_object('customer',customer_history,'supplier',supplier_history));
 end if;
 if action_name in ('bootstrap','products.list') then
  select coalesce(jsonb_object_agg(id,true),'{}') into usage from (
   select product_id id from public."SaleItems" union select product_id from public."PurchaseItems" union select product_id from public."SalesReturnItems" union select product_id from public."PurchaseReturnItems"
   union select product_id from public."SerialItems" union select product_id from public."ItemEvents" union select product_id from public."WarrantyClaims"
   union select p->>'product_id' from public."Repairs" r cross join lateral jsonb_array_elements(karvio_private.backup_json_array(r.parts)) p) x where id is not null and id<>'';
  with parts as(select r._position,ord,p->>'product_id' id,case when trim(p->>'qty') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then (p->>'qty')::double precision else 0 end qty
   from public."Repairs" r cross join lateral jsonb_array_elements(karvio_private.backup_json_array(r.parts)) with ordinality as a(p,ord) where (coalesce(r.job_no,'') like 'SRV-%' and r.status in ('Pending','Work done')) or (coalesce(r.job_no,'') not like 'SRV-%' and coalesce(r.status,'') in ('Received','Ready','Completed','Failed'))),
  totals as(select id,sum(qty order by _position,ord) as qty from parts where id is not null and id<>'' group by id)
  select coalesce(jsonb_object_agg(id,qty),'{}') into reserved from totals;
  out:=out||jsonb_build_object('productUsage',usage,'reservations',reserved);
 end if;
 return out;
end $$;

revoke all on function karvio_private.read_metrics(text) from public,anon,authenticated;
grant execute on function karvio_private.read_metrics(text) to service_role;
