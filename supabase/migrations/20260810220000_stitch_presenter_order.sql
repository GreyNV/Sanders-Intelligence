-- Global saved presenter order for Stitch North Star decks.

create table if not exists public.stitch_presenter_order (
  owner_key text primary key,
  owner_name text not null,
  sort_index integer not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stitch_presenter_order_owner_key_not_blank check (trim(owner_key) <> ''),
  constraint stitch_presenter_order_owner_name_not_blank check (trim(owner_name) <> ''),
  constraint stitch_presenter_order_sort_index_nonnegative check (sort_index >= 0)
);

create index if not exists idx_stitch_presenter_order_sort
  on public.stitch_presenter_order(sort_index);

create index if not exists idx_stitch_presenter_order_updated_by
  on public.stitch_presenter_order(updated_by);

alter table public.stitch_presenter_order enable row level security;

drop policy if exists "stitch presenter order readable by active bpr users" on public.stitch_presenter_order;
create policy "stitch presenter order readable by active bpr users"
on public.stitch_presenter_order for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
);

drop policy if exists "stitch presenter order editable by active admins" on public.stitch_presenter_order;
create policy "stitch presenter order editable by active admins"
on public.stitch_presenter_order for insert
to authenticated
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);

drop policy if exists "stitch presenter order updatable by active admins" on public.stitch_presenter_order;
create policy "stitch presenter order updatable by active admins"
on public.stitch_presenter_order for update
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
  updated_by = auth.uid()
  and exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);

revoke all on public.stitch_presenter_order from anon, authenticated;
grant select, insert, update on public.stitch_presenter_order to authenticated;

comment on table public.stitch_presenter_order is
  'Stores the global admin-managed presenter sort order for Stitch North Star presentation decks.';
