import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('NorthStar inline editing contract', () => {
  const source = readFileSync(resolve(__dirname, '../pages/csuite/NorthStar.tsx'), 'utf8')

  it('uses inline editable cells instead of the old unlock modal workflow', () => {
    expect(source).toContain('InlineEditableCell')
    expect(source).toContain('handleCellSave')
    expect(source).toContain('Ctrl+Enter')
    expect(source).not.toContain('openRowEditor')
    expect(source).not.toContain('unlockedRows')
  })

  it('gates pillar add/remove behind admin Manage pillars mode', () => {
    expect(source).toContain('Manage pillars')
    expect(source).toContain('managePillars')
    expect(source).toContain('window.confirm')
    expect(source).toContain('Add pillar')
  })

  it('straightens Monthly Star into a compact executive tool surface', () => {
    expect(source).toContain('MonthlyStarMetric')
    expect(source).toContain('Gap to target')
    expect(source).toContain('Daily needed')
    expect(source).toContain('Dragging channels')
  })

  it('color-codes BPR rows by status', () => {
    expect(source).toContain('STATUS_ROW_CLASS')
    expect(source).toContain('on_plan: ')
    expect(source).toContain('bg-success/5')
    expect(source).toContain('at_risk: ')
    expect(source).toContain('bg-warning/10')
    expect(source).toContain('off_plan: ')
    expect(source).toContain('bg-danger/10')
  })
})
