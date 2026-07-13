import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Stitch North Star page contract', () => {
  const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
  const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')
  const pageSource = readFileSync(resolve(__dirname, '../pages/csuite/StitchNorthStar.tsx'), 'utf8')

  it('registers Stitch North Star as a C-Suite route and sidebar item', () => {
    expect(appSource).toContain("const StitchNorthStar = lazy(() => import('@/pages/csuite/StitchNorthStar'))")
    expect(appSource).toContain('path="/executive/stitch-north-star"')
    expect(appSource).toContain("<RoleGuard allow={['admin', 'csuite']}><StitchNorthStar /></RoleGuard>")

    expect(sidebarSource).toContain("to: '/executive/stitch-north-star'")
    expect(sidebarSource).toContain("label: 'Stitch North Star'")
  })

  it('reuses current North Star data and update paths instead of adding a new table', () => {
    expect(pageSource).toContain('useNorthStarRows')
    expect(pageSource).toContain('useMonthlyStar')
    expect(pageSource).toContain('useMonthlyStarSales')
    expect(pageSource).toContain('useUpdateNorthStarRow')
    expect(pageSource).toContain('useUpdateNorthStarProgress')
    expect(pageSource).not.toContain('stitch_north_star')
  })

  it('renders pillar tabs and an editable owner presentation deck', () => {
    expect(pageSource).toContain('buildStitchPillarTabs')
    expect(pageSource).toContain('filterRowsByPillar')
    expect(pageSource).toContain('buildOwnerSlideDeck')
    expect(pageSource).toContain('OwnerDeckModal')
    expect(pageSource).toContain('FinanceSlideGraph')
    expect(pageSource).toContain("This week's move")
    expect(pageSource).toContain('field="constraint_now"')
    expect(pageSource).toContain('field="weekly_move"')
    expect(pageSource).toContain('label="Plan"')
  })

  it('merges live Monthly Star finance metrics into the same table and deck rows', () => {
    expect(pageSource).toContain('buildStitchFinanceMetricRow')
    expect(pageSource).toContain('buildLeadershipFinanceRows')
    expect(pageSource).toContain('mergeStitchFinanceRows')
    expect(pageSource).toContain('isStitchAutoFinanceField')
    expect(pageSource).toContain('canEditField')
  })

  it('keeps compact labels and controls from collapsing into vertical text', () => {
    expect(pageSource).toContain('whitespace-nowrap')
    expect(pageSource).toContain('truncate')
    expect(pageSource).toContain('shrink-0')
    expect(pageSource).toContain('min-w-[176px]')
  })

  it('keeps Monthly Star actual and forecast overrides local to the Stitch session', () => {
    expect(pageSource).toContain('monthlyStarOverrides')
    expect(pageSource).toContain('setMonthlyStarOverrides')
    expect(pageSource).toContain('useLeadershipSnapshot')
    expect(pageSource).not.toContain('useUpdateMonthlyStar')
  })
})
