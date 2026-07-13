-- Singleton leadership-tool finance snapshot for Stitch North Star.

create extension if not exists pgcrypto;

create table if not exists public.leadership_tool_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null default 'current' check (snapshot_key = 'current'),
  filename text not null,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now(),
  cashflow jsonb not null default '{}'::jsonb,
  payroll jsonb not null default '{}'::jsonb,
  pnl jsonb not null default '{}'::jsonb,
  sales_simulation jsonb not null default '{}'::jsonb,
  source_meta jsonb not null default '{}'::jsonb,
  unique (snapshot_key)
);

alter table public.leadership_tool_snapshot enable row level security;

drop policy if exists "leadership snapshot readable by active users" on public.leadership_tool_snapshot;
create policy "leadership snapshot readable by active users"
on public.leadership_tool_snapshot for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "leadership snapshot replaceable by admins" on public.leadership_tool_snapshot;
create policy "leadership snapshot replaceable by admins"
on public.leadership_tool_snapshot for all
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

revoke all on public.leadership_tool_snapshot from anon, authenticated;
grant select, insert, update, delete on public.leadership_tool_snapshot to authenticated;
