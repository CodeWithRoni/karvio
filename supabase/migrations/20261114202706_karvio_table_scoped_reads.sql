-- Table-scoped reads: every row of only the business tables an action uses.
-- The Edge gateway re-runs a request with the whole shop if the engine opens any other table,
-- so a narrow read can make a request slower but never changes its result.
create function public.karvio_snapshot_tables(table_names text[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; t text; rows jsonb; tables jsonb := '{}'; names text[];
begin
 if table_names is null or cardinality(table_names) > 64 then raise exception 'Invalid table list'; end if;
 select coalesce(array_agg(distinct n order by n), '{}') into names from unnest(table_names) n;
 if exists(select 1 from unnest(names) n where not n = any(array['Users','Settings','Accounts','AccountTxns','Categories','Brands','WarrantyPeriods','Units','Products','SerialItems','Customers','Suppliers','Purchases','PurchaseItems','Sales','SaleItems','SalesReturns','SalesReturnItems','PurchaseReturns','PurchaseReturnItems','Expenses','CustomerLedger','SupplierLedger','WarrantyClaims','ItemEvents','SmsLog','InvoiceLinks','AuditLog','Repairs'])) then raise exception 'Invalid table list'; end if;
 -- Same consistency rule as karvio_snapshot: commits wait while this read holds the runtime row.
 select * into r from karvio_private.runtime where id for share;
 foreach t in array names loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by _position), ''[]''::jsonb) from public.%I x', t) into rows;
  tables := tables || jsonb_build_object(t, rows);
 end loop;
 return jsonb_build_object('revision', r.revision, 'metadata', r.metadata, 'tables', tables, 'loadedTables', names,
   'requiresSetup', r.setup_hash is not null or not exists(select 1 from public."Users"));
end $$;
revoke all on function public.karvio_snapshot_tables(text[]) from public, anon, authenticated;
grant execute on function public.karvio_snapshot_tables(text[]) to service_role;

-- Row-scoped reads for list/statement screens whose rows are chosen by a date range or one party.
-- Every row the engine can consult for the visible result is included (see comments per action);
-- backend/test/scoped-reads.mjs compares each answer with the whole-shop answer.
-- Returns null when the request is not narrow (e.g. no date range): the gateway then reads whole tables.
create function public.karvio_snapshot_scoped(action_name text, payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; names text[]; t text; rows jsonb; tables jsonb := '{}'; positions jsonb := '{}'; last_pos bigint;
 date_from text; date_to text; party text; where_sql text; range_ids text[] := '{}'; parties text[] := '{}';
begin
 if jsonb_typeof(payload) is distinct from 'object' then return null; end if;
 date_from := case when jsonb_typeof(payload->'from') = 'string' then payload->>'from' else '' end;
 date_to := case when jsonb_typeof(payload->'to') = 'string' then payload->>'to' else '' end;
 -- Only exact calendar dates are narrowed; anything else keeps the engine's own comparison.
 if (date_from <> '' and date_from !~ '^\d{4}-\d{2}-\d{2}$') or (date_to <> '' and date_to !~ '^\d{4}-\d{2}-\d{2}$') then return null; end if;
 if action_name = 'customer.statement' then
  party := case when jsonb_typeof(payload->'customer_id') = 'string' then payload->>'customer_id' else null end;
  if party is null then return null; end if;
  names := array['Users','Settings','Customers','CustomerLedger'];
 elsif action_name = 'supplier.statement' then
  party := case when jsonb_typeof(payload->'supplier_id') = 'string' then payload->>'supplier_id' else null end;
  if party is null then return null; end if;
  names := array['Users','Settings','Suppliers','SupplierLedger'];
 elsif action_name = 'sales.list' then
  if date_from = '' and date_to = '' then return null; end if;
  names := array['Users','Settings','Customers','CustomerLedger','Sales','SaleItems','SalesReturns'];
 elsif action_name = 'sreturns.list' then
  if date_from = '' and date_to = '' then return null; end if;
  names := array['Users','Settings','Sales','SalesReturns','SalesReturnItems'];
 else
  return null;
 end if;
 -- Same consistency rule as karvio_snapshot: commits wait while this read holds the runtime row.
 select * into r from karvio_private.runtime where id for share;
 if action_name = 'sales.list' then
  -- Invoices dated in the range (the engine compares the first 10 characters as plain text).
  range_ids := array(select x.id from public."Sales" x
   where (date_from = '' or left(x.date,10) collate "C" >= date_from) and (date_to = '' or left(x.date,10) collate "C" <= date_to));
  -- Open dues replay each customer's whole ledger, so load every customer on a listed invoice
  -- with all of their invoices, ledger lines and the returns those lines point to.
  parties := array(select distinct x.customer_id from public."Sales" x where x.id = any(range_ids) and x.customer_id <> '');
 end if;
 foreach t in array names loop
  where_sql := 'true';
  if action_name in ('customer.statement','supplier.statement') then
   if t in ('Customers','Suppliers') then where_sql := 'x.id = $1'; end if;
   if t = 'CustomerLedger' then where_sql := 'x.customer_id = $1'; end if;
   if t = 'SupplierLedger' then where_sql := 'x.supplier_id = $1'; end if;
  elsif action_name = 'sales.list' then
   if t = 'Customers' then where_sql := 'x.id = any($5)'; end if;
   if t = 'CustomerLedger' then where_sql := 'x.customer_id = any($5)'; end if;
   if t = 'Sales' then where_sql := 'x.id = any($4) or x.customer_id = any($5)
     or x.id in (select l.ref_id from public."CustomerLedger" l where l.customer_id = any($5))'; end if;
   if t = 'SaleItems' then where_sql := 'x.sale_id = any($4)'; end if;
   if t = 'SalesReturns' then where_sql := 'x.sale_id = any($4)
     or x.sale_id in (select s.id from public."Sales" s where s.customer_id = any($5))
     or x.id in (select l.ref_id from public."CustomerLedger" l where l.customer_id = any($5))'; end if;
  elsif action_name = 'sreturns.list' then
   if t = 'SalesReturns' then where_sql := '($2 = '''' or left(x.date,10) collate "C" >= $2) and ($3 = '''' or left(x.date,10) collate "C" <= $3)'; end if;
   if t = 'Sales' then where_sql := 'x.id in (select sr.sale_id from public."SalesReturns" sr where ($2 = '''' or left(sr.date,10) collate "C" >= $2) and ($3 = '''' or left(sr.date,10) collate "C" <= $3))'; end if;
   if t = 'SalesReturnItems' then where_sql := 'x.return_id in (select sr.id from public."SalesReturns" sr where ($2 = '''' or left(sr.date,10) collate "C" >= $2) and ($3 = '''' or left(sr.date,10) collate "C" <= $3))'; end if;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by _position), ''[]''::jsonb) from public.%I x where %s', t, where_sql)
   into rows using party, date_from, date_to, range_ids, parties;
  execute format('select coalesce(max(_position),1) from public.%I', t) into last_pos;
  tables := tables || jsonb_build_object(t, rows); positions := positions || jsonb_build_object(t, last_pos);
 end loop;
 return jsonb_build_object('revision', r.revision, 'metadata', r.metadata, 'tables', tables, 'loadedTables', names,
   'compactRows', true, 'tablePositions', positions, 'readOnlyScope', true,
   'requiresSetup', r.setup_hash is not null or not exists(select 1 from public."Users"));
end $$;
revoke all on function public.karvio_snapshot_scoped(text,jsonb) from public, anon, authenticated;
grant execute on function public.karvio_snapshot_scoped(text,jsonb) to service_role;
