-- Keep safeupdate enabled and explicitly scope the ERP business rows.
create or replace function public.karvio_commit(expected_revision bigint, changes jsonb, next_metadata jsonb,
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
   execute format('delete from public.%I where _position >= 2',t);
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

