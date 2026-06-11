-- Purchase Orders V1 + logistics news cache.
-- Run manually in Supabase SQL Editor for production rollout.

create table if not exists public.purchase_orders (
  id integer primary key,
  purchase_title text,
  vendor_id integer,
  vendor_name text,
  po_status text not null,
  po_status_code integer,
  payment_status text,
  payment_status_code integer,
  shipping_status text,
  shipping_status_code integer,
  receiving_status text,
  receiving_status_code integer,
  is_active boolean not null default false,
  date_ordered timestamptz,
  expected_delivery_date timestamptz,
  created_on timestamptz,
  shipped_on timestamptz,
  grand_total numeric,
  order_total numeric,
  tax_total numeric,
  shipping_total numeric,
  unit_counts integer,
  warehouse_id integer,
  company_id integer,
  memo text,
  tracking_numbers jsonb,
  approved boolean,
  cancelled_po_id integer,
  updated_on timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.po_items (
  id integer primary key,
  po_id integer not null references public.purchase_orders(id) on delete cascade,
  source_sku text not null,
  planning_sku text,
  product_name text,
  qty_units_ordered integer,
  qty_units_received integer,
  qty_units_open integer,
  qty_units_per_case integer,
  unit_price numeric,
  case_price numeric,
  discount_type text,
  discount_value numeric,
  expected_delivery_date timestamptz,
  receiving_status text,
  receiving_status_code integer
);

create index if not exists idx_purchase_orders_status on public.purchase_orders(po_status);
create index if not exists idx_purchase_orders_date_ordered on public.purchase_orders(date_ordered);
create index if not exists idx_purchase_orders_updated_on on public.purchase_orders(updated_on desc nulls last);
create index if not exists idx_purchase_orders_is_active on public.purchase_orders(is_active, updated_on desc nulls last);
create index if not exists idx_purchase_orders_status_codes on public.purchase_orders(po_status_code, shipping_status_code, receiving_status_code);
create index if not exists idx_po_items_po_id on public.po_items(po_id);
create index if not exists idx_po_items_planning_sku on public.po_items(planning_sku);
create index if not exists idx_po_items_qty_open on public.po_items(qty_units_open) where qty_units_open > 0;

create table if not exists public.sync_state (
  key text primary key,
  last_successful_sync_at timestamptz,
  cursor_value timestamptz,
  updated_at timestamptz not null default now(),
  state jsonb,
  last_error text
);

create table if not exists public.news_items (
  id text primary key,
  provider text not null default 'gdelt',
  title text not null,
  source text,
  url text not null,
  published_at timestamptz,
  snippet text,
  query text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_items_published_at on public.news_items(published_at desc nulls last);
create index if not exists idx_news_items_query on public.news_items(query);

alter table public.purchase_orders enable row level security;
alter table public.po_items enable row level security;
alter table public.news_items enable row level security;
alter table public.sync_state enable row level security;

drop policy if exists "purchase orders readable by purchasing roles" on public.purchase_orders;
create policy "purchase orders readable by purchasing roles"
on public.purchase_orders for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'purchasing')
  )
);

drop policy if exists "po items readable by purchasing roles" on public.po_items;
create policy "po items readable by purchasing roles"
on public.po_items for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'purchasing')
  )
);

drop policy if exists "news readable by purchasing roles" on public.news_items;
create policy "news readable by purchasing roles"
on public.news_items for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'purchasing')
  )
);

drop policy if exists "sync state readable by admins" on public.sync_state;
create policy "sync state readable by admins"
on public.sync_state for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);
