import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')
const migration = readFileSync(resolve(repoRoot, 'supabase/migrations/024_sales_channel_mapping.sql'), 'utf8')

describe('sales channel mapping migration contract', () => {
  it('extends sales_daily with raw SellerCloud company and channel fields', () => {
    expect(migration).toContain('alter table public.sales_daily')
    expect(migration).toContain('add column if not exists raw_company text')
    expect(migration).toContain('add column if not exists raw_channel text')
    expect(migration).toContain('sales_daily_raw_company_channel_source_sku_key')
    expect(migration).toContain('(sale_date, raw_company, raw_channel, source_sku)')
  })

  it('creates an RLS-protected QB channel mapping table', () => {
    expect(migration).toContain('create table if not exists public.sales_channel_mappings')
    expect(migration).toContain('normalized_company text not null')
    expect(migration).toContain('normalized_channel text not null')
    expect(migration).toContain('qb_channel text not null')
    expect(migration).toContain('unique (normalized_company, normalized_channel)')
    expect(migration).toContain('alter table public.sales_channel_mappings enable row level security')
    expect(migration).toContain('sales channel mappings readable by active users')
    expect(migration).toContain('sales channel mappings editable by admins')
  })

  it('keeps mapping source values inspectable for admin cleanup', () => {
    expect(migration).toContain('sellercloud_company text not null')
    expect(migration).toContain('sellercloud_channel text not null')
    expect(migration).toContain('is_active boolean not null default true')
    expect(migration).toContain('source_file text')
    expect(migration).toContain('notes text')
  })
})
