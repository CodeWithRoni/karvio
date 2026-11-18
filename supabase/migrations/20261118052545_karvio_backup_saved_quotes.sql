-- Saved quotations (private sheet __KarvioSavedQuotes) are now part of the streaming database backup.
-- They travel as one extra stream section, "SavedQuotes" ({_position,id,updated,data}), after the 29
-- business tables. The business tables, their schema hash and the stream format are unchanged, so:
--  * backups made before this change still restore (their section list has no "SavedQuotes"); the
--    shop's current saved quotations are then kept instead of being cleared by the restore;
--  * a backup with the section replaces the saved quotations with the ones in the file.

create or replace function karvio_private.transfer_schema() returns jsonb language sql immutable set search_path='' as $$ select '{"Users":{"id":"s","name":"s","username":"s","password_hash":"s","salt":"s","role":"s","active":"b","created_at":"s","access_limit":"b","access_from":"s","access_to":"s","access_days":"s","phone":"s"},"Settings":{"key":"s","value":"s"},"Accounts":{"id":"s","name":"s","type":"s","number":"s","opening_balance":"n","active":"b","created_at":"s"},"AccountTxns":{"id":"s","date":"s","account_id":"s","direction":"s","amount":"n","ref_type":"s","ref_id":"s","note":"s","user":"s","voided":"b"},"Categories":{"id":"s","name":"s","parent_id":"s"},"Brands":{"id":"s","name":"s"},"WarrantyPeriods":{"id":"s","label":"s","days":"n"},"Units":{"id":"s","name":"s","label":"s","decimal":"b"},"Products":{"id":"s","sku":"s","barcode":"s","name":"s","category_id":"s","subcategory_id":"s","brand_id":"s","unit":"s","roll_length":"n","cost_price":"n","sale_price":"n","wholesale_price":"n","stock":"n","low_stock":"n","has_warranty":"b","warranty_type":"s","warranty_days":"n","active":"b","created_at":"s","service":"b","description":"s"},"SerialItems":{"id":"s","product_id":"s","serial":"s","purchase_id":"s","sale_id":"s","status":"s","cost":"n","created_at":"s"},"Customers":{"id":"s","name":"s","phones":"s","addresses":"s","opening_balance":"n","note":"s","active":"b","created_at":"s","link_id":"s"},"Suppliers":{"id":"s","name":"s","phones":"s","address":"s","opening_balance":"n","note":"s","active":"b","created_at":"s","link_id":"s"},"Purchases":{"id":"s","invoice_no":"s","date":"s","supplier_id":"s","supplier_name":"s","subtotal":"n","discount":"n","total":"n","paid":"n","due":"n","note":"s","status":"s","user":"s","created_at":"s","payments":"s","cancel_reason":"s","supplier_invoice":"s"},"PurchaseItems":{"id":"s","purchase_id":"s","product_id":"s","name":"s","unit":"s","qty":"n","cost":"n","total":"n","serials":"s","valuation":"s"},"Sales":{"id":"s","invoice_no":"s","date":"s","customer_id":"s","customer_name":"s","subtotal":"n","discount":"n","total":"n","paid":"n","credit_used":"n","due":"n","cost":"n","profit":"n","note":"s","status":"s","user_id":"s","user_name":"s","created_at":"s","payments":"s","cancel_reason":"s","next_payment_date":"s","balance_snapshot":"s"},"SaleItems":{"id":"s","sale_id":"s","product_id":"s","name":"s","unit":"s","qty":"n","price":"n","cost":"n","total":"n","serials":"s","warranty_type":"s","warranty_days":"n","warranty_expiry":"s"},"SalesReturns":{"id":"s","return_no":"s","date":"s","sale_id":"s","invoice_no":"s","customer_id":"s","customer_name":"s","type":"s","total":"n","cost":"n","refund":"n","refund_account_id":"s","note":"s","status":"s","user":"s","created_at":"s","cancel_reason":"s"},"SalesReturnItems":{"id":"s","return_id":"s","sale_item_id":"s","product_id":"s","name":"s","qty":"n","price":"n","cost":"n","total":"n","serials":"s","valuation":"s"},"PurchaseReturns":{"id":"s","return_no":"s","date":"s","purchase_id":"s","invoice_no":"s","supplier_id":"s","supplier_name":"s","total":"n","received":"n","account_id":"s","note":"s","status":"s","user":"s","created_at":"s","cancel_reason":"s"},"PurchaseReturnItems":{"id":"s","return_id":"s","purchase_item_id":"s","product_id":"s","name":"s","qty":"n","cost":"n","total":"n","serials":"s","valuation":"s"},"Expenses":{"id":"s","date":"s","category":"s","amount":"n","account_id":"s","note":"s","user":"s","status":"s","created_at":"s","cancel_reason":"s"},"CustomerLedger":{"id":"s","date":"s","customer_id":"s","type":"s","ref_id":"s","ref_no":"s","debit":"n","credit":"n","note":"s","voided":"b"},"SupplierLedger":{"id":"s","date":"s","supplier_id":"s","type":"s","ref_id":"s","ref_no":"s","debit":"n","credit":"n","note":"s","voided":"b"},"WarrantyClaims":{"id":"s","claim_no":"s","date":"s","serial":"s","sale_id":"s","invoice_no":"s","product_id":"s","product_name":"s","customer_id":"s","customer_name":"s","phone":"s","issue":"s","expiry":"s","in_warranty":"b","status":"s","vendor":"s","log":"s","delivered_date":"s","updated_at":"s","replacement":"s"},"ItemEvents":{"id":"s","ts":"s","serial":"s","product_id":"s","product_name":"s","event":"s","ref_type":"s","ref_id":"s","ref_no":"s","party":"s","qty":"n","amount":"n","note":"s","user":"s"},"SmsLog":{"id":"s","ts":"s","phone":"s","message":"s","status":"s","response":"s"},"InvoiceLinks":{"id":"s","token_hash":"s","sale_id":"s","created_at":"s","expires_at":"s"},"AuditLog":{"id":"s","ts":"s","user":"s","action":"s","detail":"s"},"Repairs":{"id":"s","job_no":"s","date":"s","customer_id":"s","customer_name":"s","phone":"s","device":"s","serial":"s","problem":"s","accessories":"s","technician_id":"s","technician_name":"s","estimate":"n","charge":"n","advance":"n","parts":"s","status":"s","note":"s","sale_id":"s","invoice_no":"s","ready_date":"s","delivered_date":"s","cancel_reason":"s","log":"s","user":"s","created_at":"s","updated_at":"s","result_note":"s","result_by":"s","result_at":"s","alert_seen":"b","alert_seen_by":"s"},"SavedQuotes":{"id":"s","updated":"n","data":"s"}}'::jsonb; $$;
create or replace function karvio_private.transfer_stream_names() returns text[] language sql immutable set search_path='' as $$ select karvio_private.transfer_names()||array['SavedQuotes']; $$;
create or replace function karvio_private.transfer_copy(job_key text) returns void language plpgsql security invoker set search_path='' as $$
declare t text; pk text; copied bigint; total bigint:=0; bytes bigint;
begin
 foreach t in array karvio_private.transfer_names() loop
  pk:=case when t='Settings' then 'key' else 'id' end;
  execute format('insert into karvio_private.transfer_rows(job_id,table_name,position,record_key,record) select $1,%L,_position,%I,to_jsonb(x) from public.%I x',t,pk,t) using job_key;
  get diagnostics copied=row_count;total:=total+copied;
 end loop;
 -- Saved quotations (a private sheet) travel as the extra stream section "SavedQuotes".
 insert into karvio_private.transfer_rows(job_id,table_name,position,record_key,record)
 select job_key,'SavedQuotes',r.position+1,r.cells->>0,jsonb_build_object('_position',r.position+1,'id',r.cells->>0,
  'updated',case when jsonb_typeof(r.cells->1)='number' then (r.cells->>1)::numeric when coalesce(r.cells->>1,'') ~ '^[0-9]{1,15}$' then (r.cells->>1)::numeric else 0 end,
  'data',coalesce(r.cells->>2,''))
 from karvio_private.private_rows r where r.sheet='__KarvioSavedQuotes' and coalesce(r.cells->>0,'')<>'' on conflict do nothing;
 get diagnostics copied=row_count;total:=total+copied;
 select coalesce(sum(octet_length(record::text)),0) into bytes from karvio_private.transfer_rows where job_id=job_key;
 if total>2000000 or bytes>268435456 or exists(select 1 from karvio_private.transfer_rows where job_id=job_key and octet_length(record::text)>1048576) then raise exception 'This database exceeds the 256 MiB / 2 million row transfer budget; use a native PostgreSQL backup'; end if;
 update karvio_private.transfer_jobs set row_count=total,byte_count=bytes where id=job_key;
end $$;
create or replace function karvio_private.transfer_manifest(job_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; counts jsonb:='[]'; t text; n bigint;
begin
 select * into job from karvio_private.transfer_jobs where id=job_key;
 foreach t in array karvio_private.transfer_stream_names() loop
  select count(*) into n from karvio_private.transfer_rows where job_id=job_key and table_name=t;
  counts:=counts||jsonb_build_array(jsonb_build_object('name',t,'rows',n));
 end loop;
 return jsonb_build_object('format','Karvio streaming backup','version',2,'schema_hash',karvio_private.transfer_schema_hash(),
  'created_at',to_char(job.created_at at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS'),'shop_name',(select value from public."Settings" where key='shop_name'),
  'tables',counts,'total_rows',job.row_count,'data_bytes',job.byte_count);
end $$;
create or replace function public.karvio_export_page(token text,job_id text,table_name text,after_position bigint default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; payload text; cursor bigint; n integer; finished boolean;
begin
 job:=karvio_private.transfer_job(token,job_id);
 if job.kind not in ('export','safety') or job.state<>'ready' or not(table_name=any(karvio_private.transfer_stream_names())) or after_position<0 then raise exception 'Invalid export page'; end if;
 with limited as (select r.position,r.record,r.size_bytes+1 as bytes from karvio_private.transfer_rows r
  where r.job_id=karvio_export_page.job_id and r.table_name=karvio_export_page.table_name and r.position>after_position order by r.position limit 1000),
 sized as(select *,sum(bytes) over(order by position) as through,row_number() over(order by position) as rn from limited)
 select coalesce(jsonb_agg(record order by position),'[]'::jsonb)::text,max(position),count(*)::int into payload,cursor,n from sized where through<=262144 or rn=1;
 cursor:=coalesce(cursor,after_position);
 select not exists(select 1 from karvio_private.transfer_rows r where r.job_id=karvio_export_page.job_id and r.table_name=karvio_export_page.table_name and r.position>cursor) into finished;
 return jsonb_build_object('payload',payload,'sha256',karvio_private.transfer_sha(payload),'next_cursor',cursor,'rows',n,'done',finished);
end $$;
create or replace function public.karvio_restore_begin(token text,request_key text,manifest_text text,receipt_hash text,observed_credential text,password_ok boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public."Users"; job karvio_private.transfer_jobs; header jsonb; names text[]; total bigint; attempt_count integer; blocked_until timestamptz; new_id text:=gen_random_uuid()::text;
begin
 actor:=karvio_private.transfer_actor(token);
 if observed_credential<>actor.password_hash then raise exception 'AUTH: Credential changed'; end if;
 insert into karvio_private.transfer_attempts(user_id) values(actor.id) on conflict do nothing;
 select a.failures,a.until_at into attempt_count,blocked_until from karvio_private.transfer_attempts a where user_id=actor.id for update;
 if blocked_until<=now() then attempt_count:=0; end if;
 if attempt_count>=5 and blocked_until>now() then return jsonb_build_object('ok',false,'error','Too many wrong backup passwords. Try again in 15 minutes'); end if;
 if not password_ok then
  update karvio_private.transfer_attempts set failures=attempt_count+1,until_at=now()+interval '15 minutes' where user_id=actor.id;
  return jsonb_build_object('ok',false,'error','Administrator password is incorrect');
 end if;
 update karvio_private.transfer_attempts set failures=0,until_at=null where user_id=actor.id;
 if octet_length(manifest_text)>65536 or request_key is null or length(request_key) not between 1 and 200 or receipt_hash !~ '^[a-f0-9]{64}$' then raise exception 'BACKUP: Invalid restore manifest or request ID'; end if;
 header:=manifest_text::jsonb;
 if header->>'format'<>'Karvio streaming backup' or header->>'version'<>'2' or header->>'schema_hash'<>karvio_private.transfer_schema_hash() or jsonb_typeof(header->'tables') is distinct from 'array' then raise exception 'BACKUP: Incompatible backup format/schema'; end if;
 select array_agg(x->>'name' order by ord),sum((x->>'rows')::bigint) into names,total from jsonb_array_elements(header->'tables') with ordinality as a(x,ord);
 if (names is distinct from karvio_private.transfer_names() and names is distinct from karvio_private.transfer_stream_names()) or total not between 1 and 2000000 or total is distinct from (header->>'total_rows')::bigint or exists(select 1 from jsonb_array_elements(header->'tables') x where jsonb_typeof(x->'rows') is distinct from 'number' or (x->>'rows')::numeric<>trunc((x->>'rows')::numeric) or (x->>'rows')::numeric<0) then raise exception 'BACKUP: Invalid table counts'; end if;
 select * into job from karvio_private.transfer_jobs j where j.owner_id=actor.id and j.kind='restore' and j.request_key=karvio_restore_begin.request_key;
 if job.id is not null then
  if job.manifest_text<>manifest_text or job.receipt_hash<>receipt_hash or job.owner_credential<>actor.password_hash or job.expires_at<=now() then raise exception 'BACKUP: Restore request conflicts or expired'; end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('job_id',job.id,'received',job.next_seq,'digest',job.digest));
 end if;
 delete from karvio_private.transfer_jobs where expires_at<now() and kind<>'safety';
 insert into karvio_private.transfer_jobs(id,owner_id,owner_credential,kind,state,request_key,manifest,manifest_text,receipt_hash,digest)
 values(new_id,actor.id,actor.password_hash,'restore','uploading',request_key,header,manifest_text,receipt_hash,karvio_private.transfer_sha(manifest_text));
 return jsonb_build_object('ok',true,'data',jsonb_build_object('job_id',new_id,'received',0,'digest',karvio_private.transfer_sha(manifest_text)));
end $$;
create or replace function public.karvio_restore_page(token text,job_id text,seq integer,table_name text,payload text,page_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; data jsonb; definitions jsonb; wanted bigint; prior bigint; n integer; bytes bigint; key_name text; saved karvio_private.transfer_batches;
begin
 job:=karvio_private.transfer_job(token,job_id);
 select * into job from karvio_private.transfer_jobs where id=job_id for update;
 if job.kind<>'restore' or job.state<>'uploading' or job.expires_at<=now() then raise exception 'BACKUP: Restore is not accepting rows'; end if;
 if seq<0 or octet_length(payload)>1572864 or page_hash is distinct from karvio_private.transfer_sha(payload) then raise exception 'BACKUP: Invalid page/checksum'; end if;
 select * into saved from karvio_private.transfer_batches b where b.job_id=karvio_restore_page.job_id and b.seq=karvio_restore_page.seq;
 if saved.job_id is not null then
  if saved.digest<>page_hash or saved.table_name<>table_name then raise exception 'BACKUP: Conflicting repeated page'; end if;
  return jsonb_build_object('received',job.next_seq,'digest',job.digest);
 end if;
 if seq<>job.next_seq or not(table_name=any(karvio_private.transfer_stream_names())) then raise exception 'BACKUP: Upload pages in order'; end if;
 data:=payload::jsonb;definitions:=karvio_private.transfer_schema()->table_name;
 if jsonb_typeof(data) is distinct from 'array' then raise exception 'BACKUP: Page must contain rows'; end if;
 n:=jsonb_array_length(data);if n not between 1 and 1000 then raise exception 'BACKUP: Invalid page row count'; end if;
 key_name:=case when table_name='Settings' then 'key' else 'id' end;
 if exists(select 1 from jsonb_array_elements(data) x where jsonb_typeof(x) is distinct from 'object' or octet_length(x::text)>1048576
  or jsonb_typeof(x->'_position') is distinct from 'number' or (x->>'_position')::numeric not between 2 and 2000000 or (x->>'_position')::numeric<>trunc((x->>'_position')::numeric)
  or coalesce(x->>key_name,'')='' or jsonb_typeof(x->key_name) is distinct from 'string'
  or exists(select 1 from jsonb_each(x) z where case when jsonb_typeof(z.value)='number' then abs((z.value::text)::numeric)>1000000000000000 else false end)
  or (select count(*) from jsonb_object_keys(x))<>(select count(*)+1 from jsonb_object_keys(definitions))) then raise exception 'BACKUP: Invalid row structure/position'; end if;
 if exists(select 1 from jsonb_array_elements(data) x cross join lateral jsonb_each(x) f where f.key<>'_position' and
  (not(definitions ? f.key) or (jsonb_typeof(f.value)<>'null' and jsonb_typeof(f.value)<>case definitions->>f.key when 'n' then 'number' when 'b' then 'boolean' else 'string' end))) then raise exception 'BACKUP: Invalid field type/column'; end if;
 select (x->>'rows')::bigint into wanted from jsonb_array_elements(job.manifest->'tables') x where x->>'name'=table_name;
 select count(*) into prior from karvio_private.transfer_rows r where r.job_id=karvio_restore_page.job_id and r.table_name=karvio_restore_page.table_name;
 if prior+n>wanted then raise exception 'BACKUP: Too many rows for this table'; end if;
 select sum(octet_length(x::text)) into bytes from jsonb_array_elements(data) x;
 if job.byte_count+bytes>268435456 or job.row_count+n>2000000 then raise exception 'BACKUP: Restore exceeds the transfer budget'; end if;
 insert into karvio_private.transfer_rows(job_id,table_name,position,record_key,record) select job_id,table_name,(x->>'_position')::bigint,x->>key_name,x from jsonb_array_elements(data) x;
 insert into karvio_private.transfer_batches values(job_id,seq,table_name,page_hash,n);
 update karvio_private.transfer_jobs set next_seq=next_seq+1,row_count=row_count+n,byte_count=byte_count+bytes,
  digest=karvio_private.transfer_sha(digest||'|'||seq||'|'||table_name||'|'||page_hash) where id=job_id returning * into job;
 return jsonb_build_object('received',job.next_seq,'digest',job.digest);
end $$;
create or replace function karvio_private.transfer_apply(job_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job karvio_private.transfer_jobs; actor public."Users"; t text; names text[]:=karvio_private.transfer_names(); temp_name text; values_json jsonb; cursor bigint; last_pos bigint; safety_id text:=gen_random_uuid()::text; counts jsonb:='{}'; n bigint; keep integer; column_list text; kept_quotes jsonb; has_quotes boolean;
begin
 select * into job from karvio_private.transfer_jobs where id=job_key for update;
 has_quotes:=exists(select 1 from jsonb_array_elements(job.manifest->'tables') x where x->>'name'='SavedQuotes');
 select * into actor from public."Users" where id=job.owner_id and username='admin' and role='admin' and active and password_hash=job.owner_credential;
 if actor.id is null then raise exception 'BACKUP: Administrator credential changed before restore'; end if;
 perform 1 from karvio_private.runtime where id for update;
 -- Parse/cast bounded pages into temporary typed tables before changing live rows.
 foreach t in array names loop
  temp_name:='karvio_restore_'||t;
  execute format('create temporary table %I (like public.%I including all) on commit drop',temp_name,t);
  cursor:=0;
  loop
   with limited as(select r.position,r.record,r.size_bytes from karvio_private.transfer_rows r where r.job_id=job_key and r.table_name=t and r.position>cursor order by r.position limit 1000),
   sized as(select *,sum(size_bytes+1) over(order by position) as through,row_number() over(order by position) as rn from limited)
   select jsonb_agg(record order by position),max(position) into values_json,last_pos from sized where through<=262144 or rn=1;
   exit when values_json is null;
   execute format('insert into pg_temp.%I select * from jsonb_populate_recordset(null::public.%I,$1)',temp_name,t) using values_json;
   cursor:=last_pos;
  end loop;
  select count(*) into n from karvio_private.transfer_rows r where r.job_id=job_key and r.table_name=t;
  counts:=counts||jsonb_build_object(t,n);
 end loop;
 if (select count(*) from pg_temp."karvio_restore_Users" where username='admin' and role='admin' and active)<>1 then raise exception 'BACKUP: Exactly one active Administrator is required'; end if;
 if exists(select 1 from pg_temp."karvio_restore_Users" where coalesce(password_hash,'') !~ '^pbkdf2\$600000\$[a-f0-9]{64}$' or coalesce(trim(salt),'')='') then raise exception 'BACKUP: Incompatible login credentials'; end if;
 if exists(select 1 from pg_temp."karvio_restore_SaleItems" i left join pg_temp."karvio_restore_Sales" p on p.id=i.sale_id where i.sale_id is not null and p.id is null)
 or exists(select 1 from pg_temp."karvio_restore_PurchaseItems" i left join pg_temp."karvio_restore_Purchases" p on p.id=i.purchase_id where i.purchase_id is not null and p.id is null)
 or exists(select 1 from pg_temp."karvio_restore_SalesReturnItems" i left join pg_temp."karvio_restore_SalesReturns" p on p.id=i.return_id where i.return_id is not null and p.id is null)
 or exists(select 1 from pg_temp."karvio_restore_PurchaseReturnItems" i left join pg_temp."karvio_restore_PurchaseReturns" p on p.id=i.return_id where i.return_id is not null and p.id is null) then raise exception 'BACKUP: Missing invoice/return reference'; end if;
 -- The safety copy and replacement commit together; failed validation/space/FK
 -- checks roll back every business change and retain the original database.
 select value::integer into keep from public."Settings" where key='backup_keep_days' and value ~ '^[0-9]{1,3}$';
 keep:=least(365,greatest(1,coalesce(keep,30)));
 insert into karvio_private.transfer_jobs(id,owner_id,owner_credential,kind,state,expires_at) values(safety_id,actor.id,actor.password_hash,'safety','ready',now()+make_interval(days=>keep));
 perform karvio_private.transfer_copy(safety_id);
 update karvio_private.transfer_jobs set manifest=karvio_private.transfer_manifest(safety_id) where id=safety_id;
 foreach t in array names loop
  execute format('delete from public.%I where _position>=2',t);
  select string_agg(quote_ident(attname),',' order by attnum) into column_list from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped and attname<>'_position';
  execute format('insert into public.%I (_position,%s) select row_number() over(order by _position)+1,%s from pg_temp.%I',t,column_list,column_list,'karvio_restore_'||t);
 end loop;
 execute 'insert into public."Settings"(_position,key,value) values((select coalesce(max(_position),1)+1 from public."Settings"),''last_restore_at'',$1) on conflict(key) do update set value=excluded.value' using to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS');
 insert into public."AuditLog"(_position,id,ts,"user",action,detail) values((select coalesce(max(_position),1)+1 from public."AuditLog"),gen_random_uuid()::text,to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS'),actor.name,'database_restore',jsonb_build_object('source','streamed','safety_id',safety_id)::text);
 set constraints all immediate;
 insert into public."Settings"(_position,key,value) values((select coalesce(max(_position),1)+1 from public."Settings"),'last_restore_at',to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS')) on conflict(key) do update set value=excluded.value;
 insert into public."AuditLog"(_position,id,ts,"user",action,detail) values((select coalesce(max(_position),1)+1 from public."AuditLog"),gen_random_uuid()::text,to_char(now() at time zone 'Asia/Dhaka','YYYY-MM-DD"T"HH24:MI:SS'),actor.name,'database_restore',jsonb_build_object('source','streamed','safety_id',safety_id)::text);
 update karvio_private.sms_outbox set state='cancelled' where id is not null and state in ('queued','claimed');
 -- Resetting the runtime clears every private sheet; saved quotations come back from the backup,
 -- or, for a backup made before they were backed up, today's list is kept.
 select jsonb_agg(r.cells order by r.position) into kept_quotes from karvio_private.private_rows r where r.sheet='__KarvioSavedQuotes';
 update karvio_private.runtime set revision=revision+1,metadata='{"properties":{},"cache":{},"privateSheets":{}}',setup_hash=null,updated_at=now() where id;
 if has_quotes then
  select jsonb_agg(jsonb_build_array(r.record->>'id',r.record->'updated',r.record->>'data') order by r.position) into kept_quotes
  from karvio_private.transfer_rows r where r.job_id=job_key and r.table_name='SavedQuotes';
  counts:=counts||jsonb_build_object('SavedQuotes',coalesce(jsonb_array_length(kept_quotes),0));
 end if;
 if kept_quotes is not null then
  insert into karvio_private.private_sheets(name,columns) values('__KarvioSavedQuotes',3) on conflict(name) do nothing;
  delete from karvio_private.private_rows where sheet='__KarvioSavedQuotes';
  insert into karvio_private.private_rows(sheet,position,cells) select '__KarvioSavedQuotes',ord,cells from jsonb_array_elements(kept_quotes) with ordinality q(cells,ord);
 end if;
 return jsonb_build_object('signed_out',true,'shop_name',job.manifest->>'shop_name','backup_created_at',job.manifest->>'created_at',
  'counts',counts,'safety',jsonb_build_object('name','Safety backup before restore','id',safety_id));
end $$;

-- Same rule as before: only the Edge function (service_role) may call the transfer protocol.
do $$ declare p record;begin for p in select n.nspname,pr.proname,pg_get_function_identity_arguments(pr.oid) as args from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where (n.nspname='karvio_private' and pr.proname like 'transfer_%') or (n.nspname='public' and pr.proname in ('karvio_transfer_context','karvio_export_begin','karvio_export_page','karvio_export_close','karvio_restore_begin','karvio_restore_page','karvio_restore_finish','karvio_transfer_status','karvio_transfer_abort','karvio_transfer_safety_list')) loop execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',p.nspname,p.proname,p.args); execute format('grant execute on function %I.%I(%s) to service_role',p.nspname,p.proname,p.args);end loop;end $$;
