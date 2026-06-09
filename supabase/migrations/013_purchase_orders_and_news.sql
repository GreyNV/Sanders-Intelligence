-- Purchase Orders V1 + logistics news cache.
-- Run manually in Supabase SQL Editor for production rollout.

create table if not exists public.purchase_orders (
  id integer primary key,
  purchase_title text,
  vendor_id integer,
  po_status text not null,
  payment_status text,
  shipping_status text,
  receiving_status text,
  date_ordered timestamptz,
  expected_delivery_date timestamptz,
  created_on timestamptz,
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
  synced_at timestamptz not null default now()
);

create table if not exists public.po_items (
  id integer primary key,
  po_id integer not null references public.purchase_orders(id) on delete cascade,
  source_sku text not null,
  planning_sku text,
  product_name text,
  qty_units_ordered integer,
  qty_units_per_case integer,
  unit_price numeric,
  case_price numeric,
  discount_type text,
  discount_value numeric,
  expected_delivery_date timestamptz
);

create index if not exists idx_purchase_orders_status on public.purchase_orders(po_status);
create index if not exists idx_purchase_orders_date_ordered on public.purchase_orders(date_ordered);
create index if not exists idx_po_items_po_id on public.po_items(po_id);
create index if not exists idx_po_items_planning_sku on public.po_items(planning_sku);

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
