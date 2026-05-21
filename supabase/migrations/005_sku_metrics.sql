-- Migration 005: Materialized SKU profitability and price metrics
-- Run in Supabase SQL Editor after 004_sku_bridge.sql

create table if not exists public.sku_profit_metrics (
  planning_sku text primary key,
  metric_date date not null,
  units_today numeric not null default 0,
  revenue_today numeric not null default 0,
  accrual_profit_today numeric not null default 0,
  cash_profit_today numeric not null default 0,
  units_7d numeric not null default 0,
  revenue_7d numeric not null default 0,
  accrual_profit_7d numeric not null default 0,
  cash_profit_7d numeric not null default 0,
  units_30d numeric not null default 0,
  revenue_30d numeric not null default 0,
  accrual_profit_30d numeric not null default 0,
  cash_profit_30d numeric not null default 0,
  matched_source_skus integer not null default 0,
  match_methods text[] not null default '{}',
  refreshed_at timestamptz not null default now()
);

create index if not exists sku_profit_metrics_metric_date_idx
  on public.sku_profit_metrics (metric_date);

create table if not exists public.sku_price_metrics (
  planning_sku text primary key,
  price_date date not null,
  selling_price numeric,
  price_min numeric,
  price_max numeric,
  price_avg numeric,
  price_source text,
  price_source_count integer not null default 0,
  refreshed_at timestamptz not null default now()
);

create index if not exists sku_price_metrics_price_date_idx
  on public.sku_price_metrics (price_date);

alter table public.sku_profit_metrics enable row level security;
alter table public.sku_price_metrics enable row level security;

create policy "Authenticated users can read SKU profit metrics"
  on public.sku_profit_metrics for select
  to authenticated using (true);

create policy "Authenticated users can read SKU price metrics"
  on public.sku_price_metrics for select
  to authenticated using (true);
