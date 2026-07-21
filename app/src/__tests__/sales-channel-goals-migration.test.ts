import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

function salesChannelGoalMigration() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations')
  const sources = readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => readFileSync(resolve(migrationDir, file), 'utf8'))
  return sources.find(source => source.includes('sales_channel_goals')) ?? ''
}

describe('sales channel goals migration contract', () => {
  it('persists one monthly goal per QB channel with RLS', () => {
    const migration = salesChannelGoalMigration()

    expect(migration).toContain('create table if not exists public.sales_channel_goals')
    expect(migration).toContain('period_month date not null')
    expect(migration).toContain('qb_channel text not null')
    expect(migration).toContain('goal_amount numeric not null default 0')
    expect(migration).toContain('unique (period_month, qb_channel)')
    expect(migration).toContain('alter table public.sales_channel_goals enable row level security')
    expect(migration).toContain('sales channel goals readable by active users')
    expect(migration).toContain('sales channel goals editable by admins')
    expect(migration).toContain('grant select, insert, update, delete on public.sales_channel_goals to authenticated')
  })
})
