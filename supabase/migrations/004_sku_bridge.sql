-- Migration 004: SKU bridge for SI source-system SKUs to planning SKUs
-- Run in Supabase SQL Editor after 003_allow_overstock_dismissals.sql

create table if not exists public.sku_bridge (
  id             uuid primary key default gen_random_uuid(),
  source_system  text not null,
  source_sku     text not null,
  planning_sku   text not null,
  match_method   text not null check (
    match_method in (
      'direct',
      'seller_cloud_shadow_of_sku',
      'standard_sku',
      'seller_cloud_sku_box_qty_and_item_label',
      'channel_prefix_strip',
      'compact_canonical',
      'manual_override'
    )
  ),
  confidence     numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  evidence       jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  reviewed_by    uuid references public.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists sku_bridge_unique_active_source
  on public.sku_bridge (source_system, lower(source_sku), lower(planning_sku), match_method)
  where is_active;

create index if not exists sku_bridge_source_lookup_idx
  on public.sku_bridge (source_system, lower(source_sku))
  where is_active;

create index if not exists sku_bridge_planning_lookup_idx
  on public.sku_bridge (lower(planning_sku))
  where is_active;

create or replace function public.set_sku_bridge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sku_bridge_set_updated_at on public.sku_bridge;

create trigger sku_bridge_set_updated_at
before update on public.sku_bridge
for each row execute function public.set_sku_bridge_updated_at();

alter table public.sku_bridge enable row level security;

create policy "Authenticated users can read SKU bridge"
  on public.sku_bridge for select
  to authenticated using (true);

create policy "Admins can insert SKU bridge rows"
  on public.sku_bridge for insert
  to authenticated with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can update SKU bridge rows"
  on public.sku_bridge for update
  to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete SKU bridge rows"
  on public.sku_bridge for delete
  to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );
