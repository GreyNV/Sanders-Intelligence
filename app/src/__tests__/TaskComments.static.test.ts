import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Task comments contract', () => {
  it('renders a notes thread and add-note action in TaskModal', () => {
    const source = readFileSync(resolve(__dirname, '../components/tasks/TaskModal.tsx'), 'utf8')

    expect(source).toContain('useTaskComments')
    expect(source).toContain('useTaskActivityEvents')
    expect(source).toContain('Timeline')
    expect(source).toContain('Add note')
    expect(source).toContain("kind: 'comment'")
    expect(source).toContain('Changed status from')
  })
})
