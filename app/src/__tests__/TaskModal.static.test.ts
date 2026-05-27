import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TaskModal Select SKUs metric columns', () => {
  it('places Margin % after Status and renders unavailable values safely', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/tasks/TaskModal.tsx'),
      'utf8',
    )

    expect(source).toContain('<SortableTh field="marginPct" label="Margin %"')
    expect(source.indexOf('<SortableTh field="status"')).toBeLessThan(source.indexOf('<SortableTh field="marginPct"'))
    expect(source.indexOf('<SortableTh field="marginPct"')).toBeLessThan(source.indexOf('<SortableTh field="on_hand"'))
    expect(source).toContain("r.marginPct == null ? 'N/A'")
    expect(source).toContain('colSpan={11}')
  })
})
