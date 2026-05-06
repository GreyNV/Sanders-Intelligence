-- Migration 002: Dismissed / postponed action alerts
-- Run in Supabase SQL Editor after 001_initial_schema.sql

create table if not exists public.dismissed_actions (
  id              uuid primary key default gen_random_uuid(),
  product_code    text        not null,
  action_type     text        not null check (action_type in ('at_risk', 'backorder')),
  dismissed_by    uuid        not null references public.users(id) on delete cascade,
  dismissed_until date,          -- null = permanently dismissed
  reason          text,
  created_at      timestamptz not null default now()
);

-- Index for fast lookups by product_code
create index if not exists dismissed_actions_product_code_idx
  on public.dismissed_actions (product_code, action_type);

-- RLS: authenticated users can read all, insert/update/delete their own
alter table public.dismissed_actions enable row level security;

create policy "Authenticated users can read dismissed actions"
  on public.dismissed_actions for select
  to authenticated using (true);

create policy "Users can manage their own dismissals"
  on public.dismissed_actions for insert
  to authenticated with check (dismissed_by = auth.uid());

create policy "Users can delete their own dismissals"
  on public.dismissed_actions for delete
  to authenticated using (dismissed_by = auth.uid());

create policy "Admins can delete any dismissal"
  on public.dismissed_actions for delete
  to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );
