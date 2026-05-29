import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DailyView route contract', () => {
  it('wires /daily into routing and sidebar navigation', () => {
    const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
    const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')

    expect(appSource).toContain('path="/daily"')
    expect(appSource).toContain('DailyView')
    expect(sidebarSource).toContain("to: '/daily'")
    expect(sidebarSource).toContain("label: 'My Day'")
  })
})
