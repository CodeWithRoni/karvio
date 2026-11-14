-- Compact snapshots retain global row positions separately. A normal checkout
-- loads its parties/products/history, not every shop table or sparse row gap.
create function public.karvio_snapshot_request(action_name text,payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare runtime_row record; names text[]; t text; rows jsonb; tables jsonb:='{}'; positions jsonb:='{}'; last_pos bigint;
 product_ids text[]:='{}'; serial_codes text[]:='{}'; cid text; sid text; sale_key text; purchase_key text; where_sql text; metrics jsonb; fallback jsonb; read_summary boolean:=action_name in ('bootstrap','products.list','customers.list','suppliers.list','accounts.list');
begin
 select * into runtime_row from karvio_private.runtime where id for share;
 if action_name in ('sale.create','purchase.create') then
  if jsonb_typeof(coalesce(payload->'items','[]'))<>'array' or jsonb_array_length(coalesce(payload->'items','[]'))>1000 then raise exception 'Invalid cart'; end if;
  select coalesce(array_agg(distinct x->>'product_id'),'{}') into product_ids from jsonb_array_elements(coalesce(payload->'items','[]')) x;
  -- Match all supplied serials globally, including case variants and historical
  -- supplier returns; never allow a narrow query to bypass uniqueness checks.
  select coalesce(array_agg(distinct lower(trim(code))),'{}') into serial_codes from jsonb_array_elements(coalesce(payload->'items','[]')) x
   cross join lateral regexp_split_to_table(case when jsonb_typeof(x->'serials')='array' then (select string_agg(value,',') from jsonb_array_elements_text(x->'serials')) else coalesce(x->>'serials','') end,E'[,\\n]+') code where trim(code)<>'';
 end if;
 cid:=nullif(payload->>'customer_id','');sid:=nullif(payload->>'supplier_id','');
 if action_name='sale.detail' then
  select id,customer_id into sale_key,cid from public."Sales" where id=payload->>'id' or invoice_no=payload->>'id' limit 1;
 end if;
 if action_name='purchase.detail' then
  select id,supplier_id into purchase_key,sid from public."Purchases" where id=payload->>'id' or invoice_no=payload->>'id' limit 1;
  select coalesce(array_agg(distinct product_id),'{}') into product_ids from public."PurchaseItems" where purchase_id=purchase_key;
 end if;
 names:=case
  when action_name='bootstrap' then array['Users','Settings','Accounts','Categories','Brands','WarrantyPeriods','Units','Products','Customers','Suppliers','SerialItems']
  when action_name='products.list' then array['Users','Settings','Products','SerialItems']
  when action_name in ('customers.list','suppliers.list') then array['Users','Settings','Customers','Suppliers']
  when action_name='accounts.list' then array['Users','Settings','Accounts']
  when action_name='sale.create' then array['Users','Settings','Accounts','Units','Products','SerialItems','Customers','CustomerLedger','Sales','SaleItems','SalesReturns','SalesReturnItems','Repairs','AccountTxns','ItemEvents','AuditLog','InvoiceLinks','SmsLog']
  when action_name='purchase.create' then array['Users','Settings','Accounts','Units','Products','SerialItems','Suppliers','SupplierLedger','Purchases','PurchaseItems','PurchaseReturns','PurchaseReturnItems','Repairs','AccountTxns','ItemEvents','AuditLog','InvoiceLinks','SmsLog']
  when action_name='sale.detail' then array['Users','Settings','Customers','CustomerLedger','Sales','SaleItems','SalesReturns','SalesReturnItems']
  when action_name='purchase.detail' then array['Users','Settings','Suppliers','SupplierLedger','Products','Purchases','PurchaseItems','PurchaseReturns','PurchaseReturnItems']
  when action_name='customer.payment' then array['Users','Settings','Customers','CustomerLedger','Accounts','AccountTxns','AuditLog','InvoiceLinks']
  when action_name='supplier.payment' then array['Users','Settings','Suppliers','SupplierLedger','Accounts','AccountTxns','AuditLog','InvoiceLinks']
  when action_name='account.entry' then array['Users','Settings','Accounts','AccountTxns','AuditLog','InvoiceLinks']
  when action_name in ('expense.create','expense.update') then array['Users','Settings','Accounts','AccountTxns','Expenses','AuditLog','InvoiceLinks']
  when action_name='expenses.list' then array['Users','Settings','Accounts','Expenses']
  when action_name='account.ledger' then array['Users','Settings','Accounts','AccountTxns']
  else null end;
 if names is null then
  fallback:=public.karvio_snapshot_for(action_name);
  for t in select jsonb_object_keys(fallback->'tables') loop
   execute format('select coalesce(max(_position),1) from public.%I',t) into last_pos;
   positions:=positions||jsonb_build_object(t,last_pos);
  end loop;
  return fallback||jsonb_build_object('compactRows',true,'tablePositions',positions);
 end if;
 -- All selected relations and max positions share this transaction snapshot;
 -- commits retain the global CAS guard, so calculated money cannot be lost.
 if read_summary then metrics:=karvio_private.read_metrics(action_name);end if;
 foreach t in array names loop
  where_sql:='true';
  if t='Products' then where_sql:='x.id=any($2) or x.id in (select product_id from public."SerialItems" where lower(trim(serial))=any($3))'; end if;
  if t='SerialItems' then where_sql:='(x.product_id=any($2) and x.status=''in_stock'') or lower(trim(x.serial))=any($3)'; end if;
  if t='Customers' then where_sql:='x.id=$4'; end if;
  if t='Suppliers' then where_sql:='x.id=$5'; end if;
  if t='CustomerLedger' then where_sql:='x.customer_id=$4'; end if;
  if t='SupplierLedger' then where_sql:='x.supplier_id=$5'; end if;
  if t='Sales' then where_sql:='(nullif(x.customer_id,'''')=$4) or x.id=$6'; end if;
  if t='Purchases' then where_sql:='(nullif(x.supplier_id,'''')=$5) or x.id=$7 or (x.supplier_id='''' and coalesce($1->>''supplier_invoice'','''')<>'''' and lower(x.supplier_invoice)=lower($1->>''supplier_invoice''))'; end if;
  if t='SaleItems' then where_sql:='x.sale_id=$6'; end if;
  if t='PurchaseItems' then where_sql:='x.purchase_id=$7'; end if;
  if t='SalesReturns' then where_sql:='x.sale_id in (select id from public."Sales" where nullif(customer_id,'''')=$4 or id=$6)'; end if;
  if t='PurchaseReturns' then where_sql:='x.purchase_id in (select id from public."Purchases" where nullif(supplier_id,'''')=$5 or id=$7)'; end if;
  if t='SalesReturnItems' then where_sql:='x.return_id in (select id from public."SalesReturns" where sale_id=$6)'; end if;
  if t='PurchaseReturnItems' then where_sql:='x.return_id in (select id from public."PurchaseReturns" where purchase_id=$7)'; end if;
  if t='Repairs' then where_sql:='coalesce(x.status,'''') not in (''Delivered'',''Cancelled'')'; end if;
  if t in ('AuditLog','ItemEvents','SmsLog') then where_sql:='false'; end if;
  if t='InvoiceLinks' then where_sql:='x.expires_at<=to_char(now() at time zone ''Asia/Dhaka'',''YYYY-MM-DD"T"HH24:MI:SS'')'; end if;
  if t='AccountTxns' then
   where_sql:=case when action_name='account.ledger' then 'x.account_id=$1->>''account_id'''
    when action_name='expense.update' then 'x.ref_type=''expense'' and x.ref_id=$1->>''id''' else 'false' end;
  end if;
  if t='Expenses' then
   where_sql:=case when action_name='expense.update' then 'x.id=$1->>''id''' when action_name='expense.create' then 'false'
    else '(coalesce($1->>''from'','''')='''' or x.date>=$1->>''from'') and (coalesce($1->>''to'','''')='''' or x.date<=$1->>''to'') and (coalesce($1->>''category'','''')='''' or x.category=$1->>''category'') and (coalesce($1->>''status'','''')='''' or x.status=$1->>''status'')' end;
  end if;
  if t='Accounts' and action_name='account.ledger' then where_sql:='x.id=$1->>''account_id'''; end if;
  if read_summary then where_sql:=case when t='SerialItems' then 'x.status=''in_stock''' else 'true' end;end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by _position),''[]''::jsonb) from public.%I x where %s',t,where_sql)
   into rows using payload,product_ids,serial_codes,cid,sid,sale_key,purchase_key;
  execute format('select coalesce(max(_position),1) from public.%I',t) into last_pos;
  tables:=tables||jsonb_build_object(t,rows);positions:=positions||jsonb_build_object(t,last_pos);
 end loop;
 return jsonb_build_object('revision',runtime_row.revision,'metadata',runtime_row.metadata,'tables',tables,'loadedTables',names,'compactRows',true,'tablePositions',positions,'readMetrics',metrics,
  'requiresSetup',runtime_row.setup_hash is not null or not exists(select 1 from public."Users"));
end $$;
revoke all on function public.karvio_snapshot_request(text,jsonb) from public,anon,authenticated;
grant execute on function public.karvio_snapshot_request(text,jsonb) to service_role;
-- Indexed predicates used by the scoped transaction paths.
create index sales_customer_entry on public."Sales"(customer_id,_position);
create index purchases_supplier_entry on public."Purchases"(supplier_id,_position);
create index supplier_invoice_lookup on public."Purchases"(supplier_id,lower(supplier_invoice)) where status='active';
create index serial_case_lookup on public."SerialItems"(lower(trim(serial)));
create index account_transactions_account_date on public."AccountTxns"(account_id,date,_position) where not coalesce(voided,false);
create index account_transactions_reference on public."AccountTxns"(ref_type,ref_id);
create index expenses_date on public."Expenses"(date);
create function karvio_private.backup_json_array(value text) returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb;begin v:=value::jsonb;if jsonb_typeof(v)='array' then return v;end if;return '[]';exception when others then return '[]';end $$;
create function karvio_private.read_metrics(action_name text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare out jsonb:='{}'; balances jsonb; history jsonb; customer_history jsonb; supplier_history jsonb; usage jsonb; reserved jsonb;
begin
 if action_name in ('bootstrap','accounts.list') then
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Accounts"
   union all select account_id,_position,case direction when 'in' then amount::double precision else -amount::double precision end from public."AccountTxns" where not coalesce(voided,false)),
  totals as(select a.id,floor(sum(e.amount order by e.pos)*100+0.5)/100 as balance from public."Accounts" a join entries e on e.id=a.id group by a.id)
  select coalesce(jsonb_object_agg(id,balance),'{}') into balances from totals;
  select coalesce(jsonb_object_agg(id,true),'{}') into history from (select account_id id from public."AccountTxns" union select account_id from public."Expenses") x where id is not null and id<>'';
  out:=out||jsonb_build_object('accountBalances',balances,'accountHistory',history);
 end if;
 if action_name in ('bootstrap','customers.list','suppliers.list') then
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Customers"
   union all select customer_id,_position,coalesce(debit,0)::double precision-coalesce(credit,0)::double precision from public."CustomerLedger" where not coalesce(voided,false)),
  totals as(select a.id,floor(sum(e.amount order by e.pos)*100+0.5)/100 as balance from public."Customers" a join entries e on e.id=a.id group by a.id)
  select coalesce(jsonb_object_agg(id,balance),'{}') into balances from totals;
  out:=out||jsonb_build_object('customerBalances',balances);
  with entries as(select id,0::bigint as pos,coalesce(opening_balance,0)::double precision as amount from public."Suppliers"
   union all select supplier_id,_position,coalesce(credit,0)::double precision-coalesce(debit,0)::double precision from public."SupplierLedger" where not coalesce(voided,false)),
  totals as(select a.id,floor(sum(e.amount order by e.pos)*100+0.5)/100 as balance from public."Suppliers" a join entries e on e.id=a.id group by a.id)
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
   from public."Repairs" r cross join lateral jsonb_array_elements(karvio_private.backup_json_array(r.parts)) with ordinality as a(p,ord) where coalesce(r.status,'') in ('Received','Ready','Completed','Failed')),
  totals as(select id,sum(qty order by _position,ord) as qty from parts where id is not null and id<>'' group by id)
  select coalesce(jsonb_object_agg(id,qty),'{}') into reserved from totals;
  out:=out||jsonb_build_object('productUsage',usage,'reservations',reserved);
 end if;
 return out;
end $$;
revoke all on function karvio_private.backup_json_array(text),karvio_private.read_metrics(text) from public,anon,authenticated;
grant execute on function karvio_private.backup_json_array(text),karvio_private.read_metrics(text) to service_role;
