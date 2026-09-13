-- Reject a null payload before replacing receipt history.
create or replace function public.import_inventory_receipts(p_from date, p_to date, p_filename text, p_rows jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if not exists(select 1 from public.users where id=auth.uid() and is_active and role='admin') then
    raise exception 'Admin role required';
  end if;
  if p_from is null or p_to is null or p_from>p_to or p_to>=current_date or p_to-p_from>3660 then
    raise exception 'Use a valid completed-day range of at most ten years';
  end if;
  if nullif(trim(p_filename),'') is null or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50000 then
    raise exception 'Invalid receipt export';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(receipt_id text,received_date date,po_id text,source_sku text,quantity numeric,unit_cost numeric,received_value numeric)
    where nullif(trim(receipt_id),'') is null or received_date is null or received_date not between p_from and p_to
      or nullif(trim(po_id),'') is null or nullif(trim(source_sku),'') is null
      or quantity is null or unit_cost is null or received_value is null
      or quantity::text in ('NaN','Infinity','-Infinity') or unit_cost::text in ('NaN','Infinity','-Infinity')
      or received_value::text in ('NaN','Infinity','-Infinity') or unit_cost<0
      or abs(round(quantity*unit_cost,2)-received_value)>0.01) then raise exception 'Invalid receipt row'; end if;
  if (select count(*)<>count(distinct r->>'receipt_id') from jsonb_array_elements(p_rows) r) then raise exception 'Duplicate receipt IDs'; end if;
  perform pg_advisory_xact_lock(hashtext('inventory-receipt-import'));
  if exists(select 1 from public.inventory_receipt_history h join jsonb_array_elements(p_rows) r on h.receipt_id=r->>'receipt_id'
    where h.received_date not between p_from and p_to) then raise exception 'Receipt ID already exists outside this date range'; end if;
  delete from public.inventory_receipt_history where received_date between p_from and p_to;
  insert into public.inventory_receipt_history(receipt_id,received_date,po_id,source_sku,quantity,unit_cost,received_value,imported_by)
  select receipt_id,received_date,po_id,source_sku,quantity,unit_cost,received_value,auth.uid()
  from jsonb_to_recordset(p_rows) as r(receipt_id text,received_date date,po_id text,source_sku text,quantity numeric,unit_cost numeric,received_value numeric);
  get diagnostics n = row_count;
  insert into public.inventory_receipt_coverage(received_date,source_file,imported_by)
  select d::date,p_filename,auth.uid() from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d
  on conflict(received_date) do update set source_file=excluded.source_file,imported_by=excluded.imported_by,imported_at=now();
  return n;
end $$;
revoke all on function public.import_inventory_receipts(date,date,text,jsonb) from public,anon;
grant execute on function public.import_inventory_receipts(date,date,text,jsonb) to authenticated;
