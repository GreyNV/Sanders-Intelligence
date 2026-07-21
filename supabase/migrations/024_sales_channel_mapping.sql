-- Preserve raw SellerCloud Company + Channel and add QB channel mapping support.

create extension if not exists pgcrypto;

alter table public.sales_daily
  add column if not exists raw_company text,
  add column if not exists raw_channel text;

update public.sales_daily
set
  raw_company = coalesce(nullif(trim(raw_company), ''), nullif(trim(source_payload->>'sellercloud_company'), ''), nullif(trim(channel), ''), 'Unassigned'),
  raw_channel = coalesce(nullif(trim(raw_channel), ''), nullif(trim(source_payload->>'sellercloud_channel'), ''), nullif(trim(channel), ''), 'Unassigned')
where raw_company is null
   or raw_channel is null
   or trim(raw_company) = ''
   or trim(raw_channel) = '';

alter table public.sales_daily
  alter column raw_company set default 'Unassigned',
  alter column raw_channel set default 'Unassigned',
  alter column raw_company set not null,
  alter column raw_channel set not null;

alter table public.sales_daily
  drop constraint if exists sales_daily_sale_date_channel_source_sku_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_daily_raw_company_channel_source_sku_key'
      and conrelid = 'public.sales_daily'::regclass
  ) then
    alter table public.sales_daily
      add constraint sales_daily_raw_company_channel_source_sku_key
      unique (sale_date, raw_company, raw_channel, source_sku);
  end if;
end $$;

create index if not exists idx_sales_daily_raw_company_channel
  on public.sales_daily(lower(raw_company), lower(raw_channel));

create or replace function public.normalize_sales_channel_value(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create table if not exists public.sales_channel_mappings (
  id uuid primary key default gen_random_uuid(),
  sellercloud_company text not null,
  sellercloud_channel text not null,
  normalized_company text not null,
  normalized_channel text not null,
  qb_channel text not null,
  is_active boolean not null default true,
  source_file text,
  notes text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_channel_mappings_company_not_blank check (trim(sellercloud_company) <> ''),
  constraint sales_channel_mappings_channel_not_blank check (trim(sellercloud_channel) <> ''),
  constraint sales_channel_mappings_qb_channel_not_blank check (trim(qb_channel) <> ''),
  unique (normalized_company, normalized_channel)
);

create index if not exists idx_sales_channel_mappings_active
  on public.sales_channel_mappings(is_active, qb_channel);

create or replace function public.set_sales_channel_mapping_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.sellercloud_company := trim(new.sellercloud_company);
  new.sellercloud_channel := trim(new.sellercloud_channel);
  new.qb_channel := trim(new.qb_channel);
  new.normalized_company := public.normalize_sales_channel_value(new.sellercloud_company);
  new.normalized_channel := public.normalize_sales_channel_value(new.sellercloud_channel);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_sales_channel_mapping_normalized on public.sales_channel_mappings;
create trigger set_sales_channel_mapping_normalized
before insert or update on public.sales_channel_mappings
for each row
execute function public.set_sales_channel_mapping_normalized();

alter table public.sales_channel_mappings enable row level security;

drop policy if exists "sales channel mappings readable by active users" on public.sales_channel_mappings;
create policy "sales channel mappings readable by active users"
on public.sales_channel_mappings for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "sales channel mappings editable by admins" on public.sales_channel_mappings;
create policy "sales channel mappings editable by admins"
on public.sales_channel_mappings for all
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

revoke all on public.sales_channel_mappings from anon, authenticated;
grant select, insert, update, delete on public.sales_channel_mappings to authenticated;

comment on table public.sales_channel_mappings is
  'Maps SellerCloud Company + Channel combinations to QuickBooks sales channels.';
