-- Historical data coverage is independent of the editable opening balance.
create table public.inventory_cogs_daily (
  sale_date date primary key,
  cogs_amount numeric not null,
  order_count integer not null check (order_count >= 0),
  missing_cost_count integer not null check (missing_cost_count between 0 and order_count),
  source text not null,
  fetched_at timestamptz not null default now()
);
create table public.inventory_receipt_history (
  receipt_id text primary key,
  received_date date not null,
  po_id text not null,
  source_sku text not null,
  quantity numeric not null,
  unit_cost numeric not null,
  received_value numeric not null,
  imported_by uuid references public.users(id),
  imported_at timestamptz not null default now()
);
create index inventory_receipt_history_date on public.inventory_receipt_history(received_date);
create table public.inventory_receipt_coverage (
  received_date date primary key,
  source_file text not null,
  imported_by uuid references public.users(id),
  imported_at timestamptz not null default now()
);
alter table public.inventory_cogs_daily enable row level security;
alter table public.inventory_receipt_history enable row level security;
alter table public.inventory_receipt_coverage enable row level security;
revoke all on public.inventory_cogs_daily, public.inventory_receipt_history, public.inventory_receipt_coverage from anon, authenticated;
grant select on public.inventory_cogs_daily, public.inventory_receipt_history, public.inventory_receipt_coverage to authenticated;
grant insert, update, delete on public.inventory_receipt_history, public.inventory_receipt_coverage to authenticated;
grant all on public.inventory_cogs_daily, public.inventory_receipt_history, public.inventory_receipt_coverage to service_role;
create policy inventory_cogs_read on public.inventory_cogs_daily for select to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role in ('admin','purchasing')));
create policy inventory_receipts_read on public.inventory_receipt_history for select to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role in ('admin','purchasing')));
create policy inventory_coverage_read on public.inventory_receipt_coverage for select to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role in ('admin','purchasing')));
create policy inventory_receipts_admin on public.inventory_receipt_history for all to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role='admin'))
with check (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role='admin'));
create policy inventory_coverage_admin on public.inventory_receipt_coverage for all to authenticated
using (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role='admin'))
with check (exists(select 1 from public.users where id=(select auth.uid()) and is_active and role='admin'));

-- A complete export replaces only the declared date window, atomically. Zero-receipt
-- days are covered explicitly. Re-imports cannot double count observed movements.
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
  if nullif(trim(p_filename),'') is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>50000 then
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

-- Receipt observation and the current PO snapshot commit together. Row updates
-- serialize naturally; repeated upserts with unchanged quantities create no entry.
create or replace function public.record_inventory_receipt_delta()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous_qty numeric; delta numeric;
begin
  previous_qty := case when TG_OP='INSERT' then 0 else coalesce(OLD.qty_units_received,0) end;
  delta := coalesce(NEW.qty_units_received,0)-previous_qty;
  if delta<>0 then
    insert into public.po_receipt_movements(movement_key,po_item_id,po_id,source_sku,planning_sku,received_delta_units,unit_price,received_value,observed_at)
    values(gen_random_uuid()::text,NEW.id,NEW.po_id,NEW.source_sku,NEW.planning_sku,delta,coalesce(NEW.unit_price,0),round(delta*coalesce(NEW.unit_price,0),2),now());
  end if;
  return NEW;
end $$;
revoke all on function public.record_inventory_receipt_delta() from public,anon,authenticated;
create trigger inventory_receipt_delta after insert or update of qty_units_received on public.po_items
for each row execute function public.record_inventory_receipt_delta();

-- Aggregate on the server; the browser never downloads the full sales history.
create or replace function public.inventory_balance_months(p_from date,p_to date)
returns table(period_month date,po_received_value numeric,cogs_amount numeric,missing_cogs_count bigint,
  receipt_count bigint,receipt_covered_days bigint,cogs_covered_days bigint,expected_days bigint,observed_receipt_value numeric)
language sql stable security invoker set search_path='' as $$
with days as (
  select d::date as day_date from generate_series(p_from::timestamp,least(p_to,current_date)::timestamp,interval '1 day') d
  where p_from<=p_to and p_to-p_from<=3660
), history as (
  select received_date as day_date,sum(received_value) amount,count(*) n from public.inventory_receipt_history
  where received_date between p_from and p_to group by received_date
), observed as (
  select (observed_at at time zone 'America/New_York')::date as day_date,sum(received_value) amount,count(*) n
  from public.po_receipt_movements
  where observed_at >= (p_from::timestamp at time zone 'America/New_York')
    and observed_at < ((p_to+1)::timestamp at time zone 'America/New_York') group by 1
), fallback as (
  select sale_date as day_date,sum(cogs_amount) amount,
    sum(case when coalesce(source_payload->>'cogs_missing_count','0') ~ '^\d+$' and (source_payload->>'cogs_missing_count')::numeric>0
      then (source_payload->>'cogs_missing_count')::bigint
      when cogs_source is null or cogs_source='missing' then 1 else 0 end) missing
  from public.sales_daily where sale_date between p_from and p_to group by sale_date
)
select date_trunc('month',d.day_date)::date,
 sum(case when rc.received_date is not null then coalesce(h.amount,0) else coalesce(o.amount,0) end),
 sum(coalesce(c.cogs_amount,f.amount,0)),sum(coalesce(c.missing_cost_count,f.missing,0))::bigint,
 sum(case when rc.received_date is not null then coalesce(h.n,0) else coalesce(o.n,0) end)::bigint,
 count(rc.received_date),count(c.sale_date),count(*),
 sum(case when rc.received_date is null then coalesce(o.amount,0) else 0 end)
from days d left join history h on h.day_date=d.day_date left join observed o on o.day_date=d.day_date
left join public.inventory_receipt_coverage rc on rc.received_date=d.day_date
left join public.inventory_cogs_daily c on c.sale_date=d.day_date left join fallback f on f.day_date=d.day_date
group by 1 order by 1;
$$;
revoke all on function public.inventory_balance_months(date,date) from public,anon;
grant execute on function public.inventory_balance_months(date,date) to authenticated,service_role;

alter table public.inventory_balance_settings add constraint inventory_balance_opening_value_valid
check (beginning_inventory_value >= 0 and beginning_inventory_value::text not in ('NaN','Infinity','-Infinity'));
grant all on public.po_receipt_movements to service_role;
