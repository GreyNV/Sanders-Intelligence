import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Leadership tool upload contract', () => {
  const uploadsSource = readFileSync(resolve(__dirname, '../pages/admin/UploadsPage.tsx'), 'utf8')
  const hookSource = readFileSync(resolve(__dirname, '../hooks/useLeadershipSnapshot.ts'), 'utf8')
  const leadershipBudgetMigrationPath = resolve(process.cwd(), '../supabase/migrations/025_leadership_tool_budget.sql')
  const leadershipBudgetMigration = existsSync(leadershipBudgetMigrationPath) ? readFileSync(leadershipBudgetMigrationPath, 'utf8') : ''

  it('keeps the leadership workbook upload separate from inventory csv upload', () => {
    expect(uploadsSource).toContain('Leadership Tool')
    expect(uploadsSource).toContain('accept=".xlsx,.xlsm"')
    expect(uploadsSource).toContain('parseLeadershipToolFile')
    expect(uploadsSource).toContain('useReplaceLeadershipSnapshot')
  })

  it('replaces the singleton snapshot instead of creating history rows', () => {
    expect(hookSource).toContain("snapshot_key: 'current'")
    expect(hookSource).toContain("onConflict: 'snapshot_key'")
    expect(hookSource).not.toContain('leadership_tool_snapshot_history')
  })

  it('persists parsed leadership budget data into the singleton snapshot', () => {
    expect(hookSource).toContain('budget: parsed.budget')
    expect(leadershipBudgetMigration).toContain('alter table public.leadership_tool_snapshot')
    expect(leadershipBudgetMigration).toContain("add column if not exists budget jsonb not null default '{}'::jsonb")
  })
})
