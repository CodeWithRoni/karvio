-- Fresh Karvio database. Existing Google Sheets data is deliberately not imported.
-- Column names/types follow backend/Code.gs exactly; JSON-bearing text columns remain
-- text for compatibility with existing backup files and business rules.
create table public."Users" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "username" text,
  "password_hash" text,
  "salt" text,
  "role" text,
  "active" boolean,
  "created_at" text,
  "access_limit" boolean,
  "access_from" text,
  "access_to" text,
  "access_days" text,
  "phone" text
);
alter table public."Users" enable row level security;
revoke all on public."Users" from anon, authenticated;
grant select, insert, update, delete on public."Users" to service_role;

create table public."Settings" (
  _position bigint not null unique check (_position >= 2),
  "key" text primary key,
  "value" text
);
alter table public."Settings" enable row level security;
revoke all on public."Settings" from anon, authenticated;
grant select, insert, update, delete on public."Settings" to service_role;

create table public."Accounts" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "type" text,
  "number" text,
  "opening_balance" numeric,
  "active" boolean,
  "created_at" text
);
alter table public."Accounts" enable row level security;
revoke all on public."Accounts" from anon, authenticated;
grant select, insert, update, delete on public."Accounts" to service_role;

create table public."AccountTxns" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "date" text,
  "account_id" text,
  "direction" text,
  "amount" numeric,
  "ref_type" text,
  "ref_id" text,
  "note" text,
  "user" text,
  "voided" boolean
);
alter table public."AccountTxns" enable row level security;
revoke all on public."AccountTxns" from anon, authenticated;
grant select, insert, update, delete on public."AccountTxns" to service_role;

create table public."Categories" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "parent_id" text
);
alter table public."Categories" enable row level security;
revoke all on public."Categories" from anon, authenticated;
grant select, insert, update, delete on public."Categories" to service_role;

create table public."Brands" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text
);
alter table public."Brands" enable row level security;
revoke all on public."Brands" from anon, authenticated;
grant select, insert, update, delete on public."Brands" to service_role;

create table public."WarrantyPeriods" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "label" text,
  "days" numeric
);
alter table public."WarrantyPeriods" enable row level security;
revoke all on public."WarrantyPeriods" from anon, authenticated;
grant select, insert, update, delete on public."WarrantyPeriods" to service_role;

create table public."Units" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "label" text,
  "decimal" boolean
);
alter table public."Units" enable row level security;
revoke all on public."Units" from anon, authenticated;
grant select, insert, update, delete on public."Units" to service_role;

create table public."Products" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "sku" text,
  "barcode" text,
  "name" text,
  "category_id" text,
  "subcategory_id" text,
  "brand_id" text,
  "unit" text,
  "roll_length" numeric,
  "cost_price" numeric,
  "sale_price" numeric,
  "wholesale_price" numeric,
  "stock" numeric,
  "low_stock" numeric,
  "has_warranty" boolean,
  "warranty_type" text,
  "warranty_days" numeric,
  "active" boolean,
  "created_at" text,
  "service" boolean,
  "description" text
);
alter table public."Products" enable row level security;
revoke all on public."Products" from anon, authenticated;
grant select, insert, update, delete on public."Products" to service_role;

create table public."SerialItems" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "product_id" text,
  "serial" text,
  "purchase_id" text,
  "sale_id" text,
  "status" text,
  "cost" numeric,
  "created_at" text
);
alter table public."SerialItems" enable row level security;
revoke all on public."SerialItems" from anon, authenticated;
grant select, insert, update, delete on public."SerialItems" to service_role;

create table public."Customers" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "phones" text,
  "addresses" text,
  "opening_balance" numeric,
  "note" text,
  "active" boolean,
  "created_at" text,
  "link_id" text
);
alter table public."Customers" enable row level security;
revoke all on public."Customers" from anon, authenticated;
grant select, insert, update, delete on public."Customers" to service_role;

create table public."Suppliers" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "name" text,
  "phones" text,
  "address" text,
  "opening_balance" numeric,
  "note" text,
  "active" boolean,
  "created_at" text,
  "link_id" text
);
alter table public."Suppliers" enable row level security;
revoke all on public."Suppliers" from anon, authenticated;
grant select, insert, update, delete on public."Suppliers" to service_role;

create table public."Purchases" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "invoice_no" text,
  "date" text,
  "supplier_id" text,
  "supplier_name" text,
  "subtotal" numeric,
  "discount" numeric,
  "total" numeric,
  "paid" numeric,
  "due" numeric,
  "note" text,
  "status" text,
  "user" text,
  "created_at" text,
  "payments" text,
  "cancel_reason" text,
  "supplier_invoice" text
);
alter table public."Purchases" enable row level security;
revoke all on public."Purchases" from anon, authenticated;
grant select, insert, update, delete on public."Purchases" to service_role;

create table public."PurchaseItems" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "purchase_id" text,
  "product_id" text,
  "name" text,
  "unit" text,
  "qty" numeric,
  "cost" numeric,
  "total" numeric,
  "serials" text,
  "valuation" text
);
alter table public."PurchaseItems" enable row level security;
revoke all on public."PurchaseItems" from anon, authenticated;
grant select, insert, update, delete on public."PurchaseItems" to service_role;

create table public."Sales" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "invoice_no" text,
  "date" text,
  "customer_id" text,
  "customer_name" text,
  "subtotal" numeric,
  "discount" numeric,
  "total" numeric,
  "paid" numeric,
  "credit_used" numeric,
  "due" numeric,
  "cost" numeric,
  "profit" numeric,
  "note" text,
  "status" text,
  "user_id" text,
  "user_name" text,
  "created_at" text,
  "payments" text,
  "cancel_reason" text,
  "next_payment_date" text,
  "balance_snapshot" text
);
alter table public."Sales" enable row level security;
revoke all on public."Sales" from anon, authenticated;
grant select, insert, update, delete on public."Sales" to service_role;

create table public."SaleItems" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "sale_id" text,
  "product_id" text,
  "name" text,
  "unit" text,
  "qty" numeric,
  "price" numeric,
  "cost" numeric,
  "total" numeric,
  "serials" text,
  "warranty_type" text,
  "warranty_days" numeric,
  "warranty_expiry" text
);
alter table public."SaleItems" enable row level security;
revoke all on public."SaleItems" from anon, authenticated;
grant select, insert, update, delete on public."SaleItems" to service_role;

create table public."SalesReturns" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "return_no" text,
  "date" text,
  "sale_id" text,
  "invoice_no" text,
  "customer_id" text,
  "customer_name" text,
  "type" text,
  "total" numeric,
  "cost" numeric,
  "refund" numeric,
  "refund_account_id" text,
  "note" text,
  "status" text,
  "user" text,
  "created_at" text,
  "cancel_reason" text
);
alter table public."SalesReturns" enable row level security;
revoke all on public."SalesReturns" from anon, authenticated;
grant select, insert, update, delete on public."SalesReturns" to service_role;

create table public."SalesReturnItems" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "return_id" text,
  "sale_item_id" text,
  "product_id" text,
  "name" text,
  "qty" numeric,
  "price" numeric,
  "cost" numeric,
  "total" numeric,
  "serials" text,
  "valuation" text
);
alter table public."SalesReturnItems" enable row level security;
revoke all on public."SalesReturnItems" from anon, authenticated;
grant select, insert, update, delete on public."SalesReturnItems" to service_role;

create table public."PurchaseReturns" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "return_no" text,
  "date" text,
  "purchase_id" text,
  "invoice_no" text,
  "supplier_id" text,
  "supplier_name" text,
  "total" numeric,
  "received" numeric,
  "account_id" text,
  "note" text,
  "status" text,
  "user" text,
  "created_at" text,
  "cancel_reason" text
);
alter table public."PurchaseReturns" enable row level security;
revoke all on public."PurchaseReturns" from anon, authenticated;
grant select, insert, update, delete on public."PurchaseReturns" to service_role;

create table public."PurchaseReturnItems" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "return_id" text,
  "purchase_item_id" text,
  "product_id" text,
  "name" text,
  "qty" numeric,
  "cost" numeric,
  "total" numeric,
  "serials" text,
  "valuation" text
);
alter table public."PurchaseReturnItems" enable row level security;
revoke all on public."PurchaseReturnItems" from anon, authenticated;
grant select, insert, update, delete on public."PurchaseReturnItems" to service_role;

create table public."Expenses" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "date" text,
  "category" text,
  "amount" numeric,
  "account_id" text,
  "note" text,
  "user" text,
  "status" text,
  "created_at" text,
  "cancel_reason" text
);
alter table public."Expenses" enable row level security;
revoke all on public."Expenses" from anon, authenticated;
grant select, insert, update, delete on public."Expenses" to service_role;

create table public."CustomerLedger" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "date" text,
  "customer_id" text,
  "type" text,
  "ref_id" text,
  "ref_no" text,
  "debit" numeric,
  "credit" numeric,
  "note" text,
  "voided" boolean
);
alter table public."CustomerLedger" enable row level security;
revoke all on public."CustomerLedger" from anon, authenticated;
grant select, insert, update, delete on public."CustomerLedger" to service_role;

create table public."SupplierLedger" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "date" text,
  "supplier_id" text,
  "type" text,
  "ref_id" text,
  "ref_no" text,
  "debit" numeric,
  "credit" numeric,
  "note" text,
  "voided" boolean
);
alter table public."SupplierLedger" enable row level security;
revoke all on public."SupplierLedger" from anon, authenticated;
grant select, insert, update, delete on public."SupplierLedger" to service_role;

create table public."WarrantyClaims" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "claim_no" text,
  "date" text,
  "serial" text,
  "sale_id" text,
  "invoice_no" text,
  "product_id" text,
  "product_name" text,
  "customer_id" text,
  "customer_name" text,
  "phone" text,
  "issue" text,
  "expiry" text,
  "in_warranty" boolean,
  "status" text,
  "vendor" text,
  "log" text,
  "delivered_date" text,
  "updated_at" text,
  "replacement" text
);
alter table public."WarrantyClaims" enable row level security;
revoke all on public."WarrantyClaims" from anon, authenticated;
grant select, insert, update, delete on public."WarrantyClaims" to service_role;

create table public."ItemEvents" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "ts" text,
  "serial" text,
  "product_id" text,
  "product_name" text,
  "event" text,
  "ref_type" text,
  "ref_id" text,
  "ref_no" text,
  "party" text,
  "qty" numeric,
  "amount" numeric,
  "note" text,
  "user" text
);
alter table public."ItemEvents" enable row level security;
revoke all on public."ItemEvents" from anon, authenticated;
grant select, insert, update, delete on public."ItemEvents" to service_role;

create table public."SmsLog" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "ts" text,
  "phone" text,
  "message" text,
  "status" text,
  "response" text
);
alter table public."SmsLog" enable row level security;
revoke all on public."SmsLog" from anon, authenticated;
grant select, insert, update, delete on public."SmsLog" to service_role;

create table public."InvoiceLinks" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "token_hash" text,
  "sale_id" text,
  "created_at" text,
  "expires_at" text
);
alter table public."InvoiceLinks" enable row level security;
revoke all on public."InvoiceLinks" from anon, authenticated;
grant select, insert, update, delete on public."InvoiceLinks" to service_role;

create table public."AuditLog" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "ts" text,
  "user" text,
  "action" text,
  "detail" text
);
alter table public."AuditLog" enable row level security;
revoke all on public."AuditLog" from anon, authenticated;
grant select, insert, update, delete on public."AuditLog" to service_role;

create table public."Repairs" (
  _position bigint not null unique check (_position >= 2),
  "id" text primary key,
  "job_no" text,
  "date" text,
  "customer_id" text,
  "customer_name" text,
  "phone" text,
  "device" text,
  "serial" text,
  "problem" text,
  "accessories" text,
  "technician_id" text,
  "technician_name" text,
  "estimate" numeric,
  "charge" numeric,
  "advance" numeric,
  "parts" text,
  "status" text,
  "note" text,
  "sale_id" text,
  "invoice_no" text,
  "ready_date" text,
  "delivered_date" text,
  "cancel_reason" text,
  "log" text,
  "user" text,
  "created_at" text,
  "updated_at" text,
  "result_note" text,
  "result_by" text,
  "result_at" text,
  "alert_seen" boolean,
  "alert_seen_by" text
);
alter table public."Repairs" enable row level security;
revoke all on public."Repairs" from anon, authenticated;
grant select, insert, update, delete on public."Repairs" to service_role;

create unique index users_username_casefold on public."Users" (lower(username));
create index customer_ledger_party_date on public."CustomerLedger" (customer_id, date);
create index supplier_ledger_party_date on public."SupplierLedger" (supplier_id, date);
create index sale_items_invoice on public."SaleItems" (sale_id);
create index purchase_items_invoice on public."PurchaseItems" (purchase_id);
create index serial_items_product_serial on public."SerialItems" (product_id, lower(serial));
create index invoice_links_token on public."InvoiceLinks" (token_hash);

create schema karvio_private;
revoke all on schema karvio_private from public, anon, authenticated;
grant usage on schema karvio_private to service_role;
create table karvio_private.runtime (
 id boolean primary key default true check(id), revision bigint not null default 0,
 metadata jsonb not null default '{"properties":{},"cache":{},"privateSheets":{}}',
 setup_hash text,
 updated_at timestamptz not null default now()
);
alter table karvio_private.runtime enable row level security;
grant select, update on karvio_private.runtime to service_role;
insert into karvio_private.runtime(id) values(true);
create table karvio_private.backups (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(), reason text not null, snapshot jsonb not null
);
alter table karvio_private.backups enable row level security;
grant select, insert, delete on karvio_private.backups to service_role;
grant usage, select on all sequences in schema karvio_private to service_role;
create table karvio_private.sms_outbox (
 id text primary key, payload jsonb not null, state text not null default 'queued',
 created_at timestamptz not null default now(), claimed_at timestamptz
);
alter table karvio_private.sms_outbox enable row level security;
grant select, insert, update on karvio_private.sms_outbox to service_role;
create table karvio_private.rate_limits (
 key text primary key, window_start timestamptz not null, requests integer not null
);
alter table karvio_private.rate_limits enable row level security;
grant select,insert,update,delete on karvio_private.rate_limits to service_role;
create function public.karvio_rate_limit(bucket text, max_requests integer, seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if length(bucket)>100 or max_requests not between 1 and 1000 or seconds not between 1 and 3600 then raise exception 'Invalid limit'; end if;
 delete from karvio_private.rate_limits where window_start < now()-interval '2 hours';
 insert into karvio_private.rate_limits(key,window_start,requests) values(bucket,now(),1)
 on conflict(key) do update set
 requests=case when rate_limits.window_start < now()-make_interval(secs=>seconds) then 1 else rate_limits.requests+1 end,
 window_start=case when rate_limits.window_start < now()-make_interval(secs=>seconds) then now() else rate_limits.window_start end
 returning requests into n;
 return n<=max_requests;
end $$;
revoke all on function public.karvio_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.karvio_rate_limit(text,integer,integer) to service_role;

-- A single SQL statement produces a consistent snapshot. The private gateway is the
-- only caller. Anonymous/browser clients cannot read password hashes or SMS secrets.
create function public.karvio_snapshot() returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare r record; t text; rows jsonb; tables jsonb := '{}';
begin
 select * into r from karvio_private.runtime where id for share;
 foreach t in array array['Users','Settings','Accounts','AccountTxns','Categories','Brands','WarrantyPeriods','Units','Products','SerialItems','Customers','Suppliers','Purchases','PurchaseItems','Sales','SaleItems','SalesReturns','SalesReturnItems','PurchaseReturns','PurchaseReturnItems','Expenses','CustomerLedger','SupplierLedger','WarrantyClaims','ItemEvents','SmsLog','InvoiceLinks','AuditLog','Repairs'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(x) order by _position), ''[]''::jsonb) from public.%I x', t) into rows;
   tables := tables || jsonb_build_object(t, rows);
 end loop;
 return jsonb_build_object('revision',r.revision,'metadata',r.metadata,'tables',tables,'requiresSetup',r.setup_hash is not null or not exists(select 1 from public."Users"));
end $$;
revoke all on function public.karvio_snapshot() from public, anon, authenticated;
grant execute on function public.karvio_snapshot() to service_role;

-- Compare-and-swap serializes requests across Edge isolates. Financial tables,
-- durable receipts and sessions commit together, or the entire call rolls back.
create function public.karvio_commit(expected_revision bigint, changes jsonb, next_metadata jsonb,
 setup_token_hash text default null, initialize_owner boolean default false,
 backup_reason text default null, sms_jobs jsonb default '[]') returns jsonb language plpgsql security invoker
set search_path = '' as $$
declare r record; t text; data jsonb; allowed jsonb := '{"Users":["id","name","username","password_hash","salt","role","active","created_at","access_limit","access_from","access_to","access_days","phone"],"Settings":["key","value"],"Accounts":["id","name","type","number","opening_balance","active","created_at"],"AccountTxns":["id","date","account_id","direction","amount","ref_type","ref_id","note","user","voided"],"Categories":["id","name","parent_id"],"Brands":["id","name"],"WarrantyPeriods":["id","label","days"],"Units":["id","name","label","decimal"],"Products":["id","sku","barcode","name","category_id","subcategory_id","brand_id","unit","roll_length","cost_price","sale_price","wholesale_price","stock","low_stock","has_warranty","warranty_type","warranty_days","active","created_at","service","description"],"SerialItems":["id","product_id","serial","purchase_id","sale_id","status","cost","created_at"],"Customers":["id","name","phones","addresses","opening_balance","note","active","created_at","link_id"],"Suppliers":["id","name","phones","address","opening_balance","note","active","created_at","link_id"],"Purchases":["id","invoice_no","date","supplier_id","supplier_name","subtotal","discount","total","paid","due","note","status","user","created_at","payments","cancel_reason","supplier_invoice"],"PurchaseItems":["id","purchase_id","product_id","name","unit","qty","cost","total","serials","valuation"],"Sales":["id","invoice_no","date","customer_id","customer_name","subtotal","discount","total","paid","credit_used","due","cost","profit","note","status","user_id","user_name","created_at","payments","cancel_reason","next_payment_date","balance_snapshot"],"SaleItems":["id","sale_id","product_id","name","unit","qty","price","cost","total","serials","warranty_type","warranty_days","warranty_expiry"],"SalesReturns":["id","return_no","date","sale_id","invoice_no","customer_id","customer_name","type","total","cost","refund","refund_account_id","note","status","user","created_at","cancel_reason"],"SalesReturnItems":["id","return_id","sale_item_id","product_id","name","qty","price","cost","total","serials","valuation"],"PurchaseReturns":["id","return_no","date","purchase_id","invoice_no","supplier_id","supplier_name","total","received","account_id","note","status","user","created_at","cancel_reason"],"PurchaseReturnItems":["id","return_id","purchase_item_id","product_id","name","qty","cost","total","serials","valuation"],"Expenses":["id","date","category","amount","account_id","note","user","status","created_at","cancel_reason"],"CustomerLedger":["id","date","customer_id","type","ref_id","ref_no","debit","credit","note","voided"],"SupplierLedger":["id","date","supplier_id","type","ref_id","ref_no","debit","credit","note","voided"],"WarrantyClaims":["id","claim_no","date","serial","sale_id","invoice_no","product_id","product_name","customer_id","customer_name","phone","issue","expiry","in_warranty","status","vendor","log","delivered_date","updated_at","replacement"],"ItemEvents":["id","ts","serial","product_id","product_name","event","ref_type","ref_id","ref_no","party","qty","amount","note","user"],"SmsLog":["id","ts","phone","message","status","response"],"InvoiceLinks":["id","token_hash","sale_id","created_at","expires_at"],"AuditLog":["id","ts","user","action","detail"],"Repairs":["id","job_no","date","customer_id","customer_name","phone","device","serial","problem","accessories","technician_id","technician_name","estimate","charge","advance","parts","status","note","sale_id","invoice_no","ready_date","delivered_date","cancel_reason","log","user","created_at","updated_at","result_note","result_by","result_at","alert_seen","alert_seen_by"]}'::jsonb;
begin
 select * into r from karvio_private.runtime where id for update;
 if r.revision <> expected_revision then return '{"committed":false}'::jsonb; end if;
 if initialize_owner then
   if r.setup_hash is null or r.setup_hash <> setup_token_hash or exists(select 1 from public."Users") then
     raise exception 'Setup is unavailable or setup key is invalid';
   end if;
 elsif not exists(select 1 from public."Users") then raise exception 'Initialize the owner account first';
 end if;
 if backup_reason is not null then
   insert into karvio_private.backups(reason,snapshot) values(backup_reason,public.karvio_snapshot());
 end if;
 -- Only fixed business tables may be changed. No arbitrary SQL identifiers are accepted.
 for t, data in select * from jsonb_each(changes) loop
   if not allowed ? t or jsonb_typeof(data) <> 'array' then raise exception 'Invalid table payload'; end if;
   execute format('delete from public.%I',t);
   execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1)',t,t) using data;
 end loop;
 insert into karvio_private.sms_outbox(id,payload)
 select j->>'id',j from jsonb_array_elements(sms_jobs) j;
 update karvio_private.runtime set revision=revision+1, metadata=next_metadata,
   setup_hash=case when initialize_owner then null else setup_hash end, updated_at=now() where id;
 return jsonb_build_object('committed',true,'revision',r.revision+1);
end $$;
revoke all on function public.karvio_commit(bigint,jsonb,jsonb,text,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.karvio_commit(bigint,jsonb,jsonb,text,boolean,text,jsonb) to service_role;

create function public.karvio_claim_sms() returns jsonb language plpgsql security invoker set search_path='' as $$
declare jobs jsonb;
begin
 perform 1 from karvio_private.runtime where id for update;
 with claimed as (
   update karvio_private.sms_outbox set state='claimed',claimed_at=now()
   where id in (select id from karvio_private.sms_outbox where state='queued' order by created_at for update skip locked limit 10)
   returning id,payload
 ) select coalesce(jsonb_agg(payload),'[]') into jobs from claimed;
 update public."SmsLog" set status='unknown',response='Delivery is being attempted. Check gateway before resending.'
 where id in (select j->>'id' from jsonb_array_elements(jobs) j);
 if jsonb_array_length(jobs)>0 then update karvio_private.runtime set revision=revision+1 where id; end if;
 return jobs;
end $$;
revoke all on function public.karvio_claim_sms() from public,anon,authenticated;
grant execute on function public.karvio_claim_sms() to service_role;
create function public.karvio_finish_sms(job_id text, delivery_status text, gateway_response text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from karvio_private.runtime where id for update;
 if delivery_status not in ('sent','failed','unknown') then raise exception 'Invalid SMS state'; end if;
 update karvio_private.sms_outbox set state=delivery_status,payload='{}' where id=job_id and state='claimed';
 if found then
   update public."SmsLog" set status=delivery_status,response=left(gateway_response,300) where id=job_id;
   update karvio_private.runtime set revision=revision+1 where id;
 end if;
end $$;
revoke all on function public.karvio_finish_sms(text,text,text) from public,anon,authenticated;
grant execute on function public.karvio_finish_sms(text,text,text) to service_role;
