-- Incremental SellerCloud PO sync cursor.

alter table public.purchase_orders
  add column if not exists updated_on timestamptz;

create index if not exists idx_purchase_orders_updated_on
  on public.purchase_orders(updated_on desc nulls last);

create table if not exists public.sync_state (
  key text primary key,
  last_successful_sync_at timestamptz,
  cursor_value timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.sync_state enable row level security;

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
