-- SellerCloud sales ingestion + SKU matching support.

create table if not exists public.sales_daily (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  channel text not null default 'Unassigned',
  source_sku text not null,
  planning_sku text,
  units_sold numeric not null default 0,
  revenue numeric not null default 0,
  orders_count integer not null default 0,
  source_payload jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sale_date, channel, source_sku)
);

create index if not exists idx_sales_daily_date
  on public.sales_daily(sale_date desc);

create index if not exists idx_sales_daily_planning_sku
  on public.sales_daily(lower(planning_sku));

create index if not exists idx_sales_daily_source_sku
  on public.sales_daily(lower(source_sku));

alter table public.sales_daily enable row level security;

drop policy if exists "sales daily readable by active users" on public.sales_daily;
create policy "sales daily readable by active users"
on public.sales_daily for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "sales daily writable by admins" on public.sales_daily;
create policy "sales daily writable by admins"
on public.sales_daily for all
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

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists internal;
revoke all on schema internal from anon, authenticated;

create or replace function internal.invoke_sellercloud_sales_sync()
returns void
language plpgsql
security definer
set search_path = internal, public, extensions, vault
as $$
declare
  project_url text;
  service_role_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'si_supabase_url'
  limit 1;

  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'si_supabase_service_role_key'
  limit 1;

  if project_url is null or service_role_key is null then
    raise warning 'SellerCloud sales refresh skipped: missing Vault secrets';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/sync-sales',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'maxPages', 1,
      'pageSize', 50
    )
  );
end;
$$;

do $$
begin
  perform cron.unschedule('sellercloud-sales-refresh');
exception
  when others then null;
end $$;

select cron.schedule(
  'sellercloud-sales-refresh',
  '*/30 * * * *',
  $$select internal.invoke_sellercloud_sales_sync();$$
);
