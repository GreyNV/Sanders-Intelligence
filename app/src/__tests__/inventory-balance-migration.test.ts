import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260903133038_inventory_balance.sql'),
  'utf8'
)

describe('inventory balance migration', () => {
  it('creates opening balance and receipt movement schema with RLS', () => {
    expect(migration).toContain('create table if not exists public.inventory_balance_settings')
    expect(migration).toContain("settings_key text not null default 'active'")
    expect(migration).toContain('create table if not exists public.po_receipt_movements')
    expect(migration).toContain('movement_key text not null')
    expect(migration).toContain('add column if not exists last_balance_received_units numeric')
    expect(migration).toContain('add column if not exists cogs_amount numeric not null default 0')
    expect(migration).toContain('alter table public.inventory_balance_settings enable row level security')
    expect(migration).toContain('alter table public.po_receipt_movements enable row level security')
    expect(migration).toContain('to authenticated')
    expect(migration).toContain('revoke all on public.inventory_balance_settings from anon')
    expect(migration).toContain('revoke all on public.po_receipt_movements from anon')
    expect(migration).toContain('grant select, insert, update on public.inventory_balance_settings to authenticated')
    expect(migration).toContain('grant select on public.po_receipt_movements to authenticated')
  })

  it('initializes existing PO item receipt baselines without creating receipt movements', () => {
    expect(migration).toContain('update public.po_items')
    expect(migration).toContain('set last_balance_received_units = qty_units_received')
    expect(migration).toContain('where last_balance_received_units is null')
  })
})

