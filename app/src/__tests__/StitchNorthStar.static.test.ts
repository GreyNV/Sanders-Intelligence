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
    expect(pageSource).toContain("This week's move")
    expect(pageSource).toContain('field="constraint_now"')
    expect(pageSource).toContain('field="weekly_move"')
  })
})
