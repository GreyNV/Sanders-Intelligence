-- North Star / Business Plan Review V1.

create extension if not exists pgcrypto;

create table if not exists public.north_star_rows (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  period_week date not null,
  slot_index integer not null check (slot_index between 1 and 12),
  pillar text not null,
  owner text,
  north_star text not null default '',
  constraint_now text,
  weekly_move text,
  last_week_result text,
  status text not null default 'on_plan' check (status in ('on_plan', 'at_risk', 'off_plan')),
  is_locked boolean not null default true,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (slot_index)
);

create table if not exists public.north_star_history (
  id uuid primary key default gen_random_uuid(),
  row_id uuid references public.north_star_rows(id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by uuid references public.users(id),
  edited_at timestamptz not null default now(),
  period_week date not null
);

create table if not exists public.monthly_star (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  target_sales numeric not null default 0,
  mtd_actual numeric not null default 0,
  ly_mtd_actual numeric not null default 0,
  days_elapsed integer not null default 1 check (days_elapsed >= 0),
  days_remaining integer not null default 0 check (days_remaining >= 0),
  channel_deltas jsonb not null default '[]'::jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_star_history (
  id uuid primary key default gen_random_uuid(),
  monthly_star_id uuid references public.monthly_star(id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  edited_by uuid references public.users(id),
  edited_at timestamptz not null default now(),
  period_month date not null
);

create index if not exists idx_north_star_rows_slot on public.north_star_rows(slot_index);
create index if not exists idx_north_star_history_row on public.north_star_history(row_id, edited_at desc);
create index if not exists idx_monthly_star_period on public.monthly_star(period_month);
create index if not exists idx_monthly_star_history_month on public.monthly_star_history(period_month, edited_at desc);

alter table public.north_star_rows enable row level security;
alter table public.north_star_history enable row level security;
alter table public.monthly_star enable row level security;
alter table public.monthly_star_history enable row level security;

drop policy if exists "north star rows readable by active users" on public.north_star_rows;
create policy "north star rows readable by active users"
on public.north_star_rows for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "north star rows editable by admins" on public.north_star_rows;
create policy "north star rows editable by admins"
on public.north_star_rows for all
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

drop policy if exists "north star history readable by active users" on public.north_star_history;
create policy "north star history readable by active users"
on public.north_star_history for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "north star history insertable by admins" on public.north_star_history;
create policy "north star history insertable by admins"
on public.north_star_history for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);

drop policy if exists "monthly star readable by active users" on public.monthly_star;
create policy "monthly star readable by active users"
on public.monthly_star for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "monthly star editable by admins" on public.monthly_star;
create policy "monthly star editable by admins"
on public.monthly_star for all
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

drop policy if exists "monthly star history readable by active users" on public.monthly_star_history;
create policy "monthly star history readable by active users"
on public.monthly_star_history for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "monthly star history insertable by admins" on public.monthly_star_history;
create policy "monthly star history insertable by admins"
on public.monthly_star_history for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);
