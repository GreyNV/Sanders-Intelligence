import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UsersPage automation settings contract', () => {
  it('exposes default auto-assignee controls', () => {
    const source = readFileSync(resolve(__dirname, '../pages/admin/UsersPage.tsx'), 'utf8')

    expect(source).toContain('useAutomationConfig')
    expect(source).toContain('useSetDefaultAutoAssignee')
    expect(source).toContain('Default Auto-Task Assignee')
    expect(source).toContain('Set default')
  })

  it('renders an empty state when no users are returned', () => {
    const source = readFileSync(resolve(__dirname, '../pages/admin/UsersPage.tsx'), 'utf8')

    expect(source).toContain('No users found')
    expect(source).toContain('colSpan={8}')
  })
})
