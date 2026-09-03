-- Inventory balance rollforward support.

create extension if not exists pgcrypto;

create table if not exists public.inventory_balance_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null default 'active',
  beginning_period_month date not null,
  beginning_inventory_value numeric not null default 0,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inventory_balance_settings_period_month_check
    check (beginning_period_month = date_trunc('month', beginning_period_month)::date)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_balance_settings_key'
      and conrelid = 'public.inventory_balance_settings'::regclass
  ) then
    alter table public.inventory_balance_settings
      add constraint inventory_balance_settings_key unique (settings_key);
  end if;
end $$;

create table if not exists public.po_receipt_movements (
  id uuid primary key default gen_random_uuid(),
  movement_key text not null,
  po_item_id integer not null,
  po_id integer not null references public.purchase_orders(id) on delete cascade,
  source_sku text not null,
  planning_sku text,
  received_delta_units numeric not null,
  unit_price numeric not null default 0,
  received_value numeric not null default 0,
  observed_at timestamptz not null default now(),
  source_updated_on timestamptz,
  sync_run_key text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'po_receipt_movements_movement_key'
      and conrelid = 'public.po_receipt_movements'::regclass
  ) then
    alter table public.po_receipt_movements
      add constraint po_receipt_movements_movement_key unique (movement_key);
  end if;
end $$;

alter table public.po_items
  add column if not exists last_balance_received_units numeric;

update public.po_items
set last_balance_received_units = qty_units_received
where last_balance_received_units is null;

alter table public.sales_daily
  add column if not exists cogs_amount numeric not null default 0,
  add column if not exists cogs_source text;

create index if not exists idx_inventory_balance_settings_updated_at
  on public.inventory_balance_settings(updated_at desc);

create index if not exists idx_inventory_balance_settings_updated_by
  on public.inventory_balance_settings(updated_by);

create index if not exists idx_po_receipt_movements_observed_at
  on public.po_receipt_movements(observed_at);

create index if not exists idx_po_receipt_movements_po_id
  on public.po_receipt_movements(po_id);

create index if not exists idx_po_receipt_movements_po_item_id
  on public.po_receipt_movements(po_item_id);

create index if not exists idx_po_receipt_movements_planning_sku
  on public.po_receipt_movements(lower(planning_sku));

create index if not exists idx_sales_daily_balance_month
  on public.sales_daily(sale_date, cogs_amount);

alter table public.inventory_balance_settings enable row level security;
alter table public.po_receipt_movements enable row level security;

drop policy if exists "inventory balance settings readable by purchasing roles" on public.inventory_balance_settings;
create policy "inventory balance settings readable by purchasing roles"
on public.inventory_balance_settings for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role in ('admin', 'purchasing')
  )
);

drop policy if exists "inventory balance settings editable by admins" on public.inventory_balance_settings;
create policy "inventory balance settings editable by admins"
on public.inventory_balance_settings for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

drop policy if exists "po receipt movements readable by purchasing roles" on public.po_receipt_movements;
create policy "po receipt movements readable by purchasing roles"
on public.po_receipt_movements for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
      and u.role in ('admin', 'purchasing')
  )
);

revoke all on public.inventory_balance_settings from anon, authenticated;
revoke all on public.po_receipt_movements from anon, authenticated;
grant select, insert, update on public.inventory_balance_settings to authenticated;
grant select on public.po_receipt_movements to authenticated;
