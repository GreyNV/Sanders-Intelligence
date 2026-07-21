-- Monthly QB-channel sales goals for the C-Suite Sales by Channel page.

create extension if not exists pgcrypto;

create table if not exists public.sales_channel_goals (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  qb_channel text not null,
  goal_amount numeric not null default 0 check (goal_amount >= 0),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sales_channel_goals_qb_channel_not_blank check (trim(qb_channel) <> ''),
  unique (period_month, qb_channel)
);

create index if not exists idx_sales_channel_goals_period
  on public.sales_channel_goals(period_month);

alter table public.sales_channel_goals enable row level security;

drop policy if exists "sales channel goals readable by active users" on public.sales_channel_goals;
create policy "sales channel goals readable by active users"
on public.sales_channel_goals for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "sales channel goals editable by admins" on public.sales_channel_goals;
create policy "sales channel goals editable by admins"
on public.sales_channel_goals for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);

revoke all on public.sales_channel_goals from anon, authenticated;
grant select, insert, update, delete on public.sales_channel_goals to authenticated;

comment on table public.sales_channel_goals is
  'Monthly sales goals by mapped QuickBooks channel for the C-Suite sales page.';
