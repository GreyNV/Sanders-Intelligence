import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

function salesChannelGamePlansMigration() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations')
  const sources = readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => readFileSync(resolve(migrationDir, file), 'utf8'))
  return sources.find(source => source.includes('sales_channel_game_plans')) ?? ''
}

describe('sales channel game plans migration contract', () => {
  it('persists one editable current-month game plan per QB channel with historical read-only RLS', () => {
    const migration = salesChannelGamePlansMigration()

    expect(migration).toContain('create table if not exists public.sales_channel_game_plans')
    expect(migration).toContain('period_month date not null')
    expect(migration).toContain('qb_channel text not null')
    expect(migration).toContain('game_plan text not null default')
    expect(migration).toContain('unique (period_month, qb_channel)')
    expect(migration).toContain('alter table public.sales_channel_game_plans enable row level security')
    expect(migration).toContain('sales channel game plans readable by active users')
    expect(migration).toContain('sales channel game plans editable by active users for current month')
    expect(migration).toContain("period_month = date_trunc('month', current_date)::date")
    expect(migration).toContain('grant select, insert, update on public.sales_channel_game_plans to authenticated')
  })
})
