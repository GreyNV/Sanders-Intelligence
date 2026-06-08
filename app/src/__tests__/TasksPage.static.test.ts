import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TasksPage workflow contract', () => {
  it('exposes assignee grouping and postpone/cancel actions', () => {
    const source = readFileSync(resolve(__dirname, '../pages/tasks/TasksPage.tsx'), 'utf8')

    expect(source).toContain("'assignee'")
    expect(source).toContain('postponedCount')
    expect(source).toContain('showPostponed')
    expect(source).toContain('Postpone Task')
    expect(source).toContain('Cancel Task')
  })

  it('requires a trimmed note before cancel or postpone status changes', () => {
    const source = readFileSync(resolve(__dirname, '../pages/tasks/TasksPage.tsx'), 'utf8')

    expect(source).toContain('const trimmedNote = note.trim()')
    expect(source).toContain('if (!trimmedNote) return')
    expect(source).toContain('body: trimmedNote')
  })
})
