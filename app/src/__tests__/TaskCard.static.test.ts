import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TaskCard structured metadata contract', () => {
  it('prefers compact auto-task metadata over wall-of-text descriptions', () => {
    const source = readFileSync(resolve(__dirname, '../components/tasks/TaskCard.tsx'), 'utf8')

    expect(source).toContain('showCompactAutoMetadata')
    expect(source).toContain('formatRuleLabel')
    expect(source).toContain('getTaskSkuCount')
    expect(source).toContain("task.source === 'auto'")
  })

  it('does not expose hard-delete controls', () => {
    const source = readFileSync(resolve(__dirname, '../components/tasks/TaskCard.tsx'), 'utf8')

    expect(source).not.toContain('Trash2')
    expect(source).not.toContain('onDelete')
    expect(source).not.toContain('Delete task')
  })
})
