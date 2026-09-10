-- Shared manual overrides for automatically generated Stitch North Star slides.

create extension if not exists pgcrypto;

create table if not exists public.stitch_auto_row_overrides (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  source text not null,
  source_version text not null,
  row_key text not null,
  field_name text not null,
  field_value text not null default '',
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stitch_auto_row_overrides_period_is_month
    check (period_month = date_trunc('month', period_month)::date),
  constraint stitch_auto_row_overrides_source_valid
    check (source in ('monthly_star', 'leadership_tool')),
  constraint stitch_auto_row_overrides_source_version_not_blank
    check (trim(source_version) <> ''),
  constraint stitch_auto_row_overrides_row_key_not_blank
    check (trim(row_key) <> ''),
  constraint stitch_auto_row_overrides_field_valid
    check (field_name in (
      'north_star', 'plan_value', 'actual_mtd', 'forecast',
      'constraint_now', 'weekly_move', 'last_week_result', 'status'
    )),
  unique (period_month, source, row_key, field_name)
);

create index if not exists idx_stitch_auto_row_overrides_period
  on public.stitch_auto_row_overrides(period_month);

create index if not exists idx_stitch_auto_row_overrides_updated_by
  on public.stitch_auto_row_overrides(updated_by);

alter table public.stitch_auto_row_overrides enable row level security;

drop policy if exists "stitch auto row overrides readable by active bpr users"
  on public.stitch_auto_row_overrides;
create policy "stitch auto row overrides readable by active bpr users"
on public.stitch_auto_row_overrides for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
);

drop policy if exists "stitch auto row overrides editable by active bpr users"
  on public.stitch_auto_row_overrides;
create policy "stitch auto row overrides editable by active bpr users"
on public.stitch_auto_row_overrides for insert
to authenticated
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
);

drop policy if exists "stitch auto row overrides updatable by active bpr users"
  on public.stitch_auto_row_overrides;
create policy "stitch auto row overrides updatable by active bpr users"
on public.stitch_auto_row_overrides for update
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
)
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
);

revoke all on public.stitch_auto_row_overrides from anon, authenticated;
grant select, insert, update on public.stitch_auto_row_overrides to authenticated;

comment on table public.stitch_auto_row_overrides is
  'Stores shared manual field overrides for generated Stitch slides until the source version changes.';
