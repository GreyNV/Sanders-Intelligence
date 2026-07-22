-- Per-slide raw HTML view mode for Stitch North Star decks.

create extension if not exists pgcrypto;

create table if not exists public.stitch_slide_html_blocks (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  slide_key text not null,
  view_mode text not null default 'fields',
  html_code text not null default '',
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stitch_slide_html_blocks_period_is_month check (period_month = date_trunc('month', period_month)::date),
  constraint stitch_slide_html_blocks_slide_key_not_blank check (trim(slide_key) <> ''),
  constraint stitch_slide_html_blocks_view_mode_valid check (view_mode in ('fields', 'html')),
  unique (period_month, slide_key)
);

create index if not exists idx_stitch_slide_html_blocks_period
  on public.stitch_slide_html_blocks(period_month);

create index if not exists idx_stitch_slide_html_blocks_updated_by
  on public.stitch_slide_html_blocks(updated_by);

alter table public.stitch_slide_html_blocks enable row level security;

drop policy if exists "stitch slide html blocks readable by active bpr users" on public.stitch_slide_html_blocks;
create policy "stitch slide html blocks readable by active bpr users"
on public.stitch_slide_html_blocks for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role in ('admin', 'csuite')
  )
);

drop policy if exists "stitch slide html blocks editable by active bpr users" on public.stitch_slide_html_blocks;
create policy "stitch slide html blocks editable by active bpr users"
on public.stitch_slide_html_blocks for insert
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

drop policy if exists "stitch slide html blocks updatable by active bpr users" on public.stitch_slide_html_blocks;
create policy "stitch slide html blocks updatable by active bpr users"
on public.stitch_slide_html_blocks for update
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

revoke all on public.stitch_slide_html_blocks from anon, authenticated;
grant select, insert, update on public.stitch_slide_html_blocks to authenticated;

comment on table public.stitch_slide_html_blocks is
  'Stores raw optional HTML and Fields/HTML view mode per Stitch North Star month and slide key.';
