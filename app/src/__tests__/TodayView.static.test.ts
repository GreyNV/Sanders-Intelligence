import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TodayView route contract', () => {
  it('wires /today into navigation and redirects /daily', () => {
    const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
    const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')

    expect(appSource).toContain('path="/today"')
    expect(appSource).toContain('path="/daily"')
    expect(appSource).toContain('Navigate to="/today"')
    expect(appSource).toContain('TodayView')
    expect(sidebarSource).toContain("to: '/today'")
    expect(sidebarSource).toContain("label: 'Today'")
  })

  it('supports claiming unassigned tasks and read-only inspection of other tasks', () => {
    const source = readFileSync(resolve(__dirname, '../pages/work/TodayView.tsx'), 'utf8')

    expect(source).toContain('useClaimTask')
    expect(source).toContain('Unassigned due today')
    expect(source).toContain('All other tasks due today')
    expect(source).toContain('readOnly={readOnlyTask}')
    expect(source).toContain('Claim')
  })
})
