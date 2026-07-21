-- Monthly channel-level game plans for the C-Suite Sales by Channel page.

create extension if not exists pgcrypto;

create table if not exists public.sales_channel_game_plans (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  qb_channel text not null,
  game_plan text not null default '',
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_channel_game_plans_period_is_month check (period_month = date_trunc('month', period_month)::date),
  constraint sales_channel_game_plans_qb_channel_not_blank check (trim(qb_channel) <> ''),
  unique (period_month, qb_channel)
);

create index if not exists idx_sales_channel_game_plans_period
  on public.sales_channel_game_plans(period_month);

create index if not exists idx_sales_channel_game_plans_updated_by
  on public.sales_channel_game_plans(updated_by);

alter table public.sales_channel_game_plans enable row level security;

drop policy if exists "sales channel game plans readable by active users" on public.sales_channel_game_plans;
create policy "sales channel game plans readable by active users"
on public.sales_channel_game_plans for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "sales channel game plans editable by active users for current month" on public.sales_channel_game_plans;
create policy "sales channel game plans editable by active users for current month"
on public.sales_channel_game_plans for insert
to authenticated
with check (
  period_month = date_trunc('month', current_date)::date
  and updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "sales channel game plans updatable by active users for current month" on public.sales_channel_game_plans;
create policy "sales channel game plans updatable by active users for current month"
on public.sales_channel_game_plans for update
to authenticated
using (
  period_month = date_trunc('month', current_date)::date
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
)
with check (
  period_month = date_trunc('month', current_date)::date
  and updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

revoke all on public.sales_channel_game_plans from anon, authenticated;
grant select, insert, update on public.sales_channel_game_plans to authenticated;

comment on table public.sales_channel_game_plans is
  'Month-scoped sales growth game plans by mapped QuickBooks channel.';
