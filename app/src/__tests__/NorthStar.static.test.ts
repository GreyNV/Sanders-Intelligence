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

  it('lets executive users edit BPR plan, actual, forecast, status, and notes without Manage pillars access', () => {
    expect(source).toContain('canEditProgress')
    expect(source).toContain("profile?.role === 'csuite'")
    expect(source).toContain('buildNorthStarProgressPayload')
    expect(source).toContain('field="plan_value"')
    expect(source).toContain('field="actual_mtd"')
    expect(source).toContain('field="forecast"')
    expect(source).toContain('field="plan_value" value={row.plan_value ?? \'\'} canEdit={canEditRowProgress}')
    expect(source).toContain('field="actual_mtd" value={row.actual_mtd ?? \'\'} canEdit={canEditRowProgress}')
    expect(source).toContain('field="forecast" value={row.forecast ?? \'\'} canEdit={canEditRowProgress}')
    expect(source).toContain('field="constraint_now"')
    expect(source).toContain('field="weekly_move"')
    expect(source).toContain('field="last_week_result"')
  })

  it('straightens Monthly Star into a compact executive tool surface', () => {
    expect(source).toContain('MonthlyStarMetric')
    expect(source).toContain('Gap to target')
    expect(source).toContain('Daily needed')
    expect(source).toContain('Dragging channels')
  })

  it('lets users browse prior Monthly Star periods from the North Star page', () => {
    expect(source).toContain('selectedMonth')
    expect(source).toContain('useMonthlyStar(selectedMonth)')
    expect(source).toContain('useMonthlyStarSales(selectedMonth)')
    expect(source).toContain('addMonthsToPeriod(month, -1)')
    expect(source).toContain('formatPeriodMonth(selectedMonth)')
    expect(source).toContain('Current month')
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

  it('renders BPR status labels from the shared label map', () => {
    expect(source).toContain('{STATUS_LABELS.on_plan}')
    expect(source).toContain('{STATUS_LABELS.at_risk}')
    expect(source).toContain('{STATUS_LABELS.off_plan}')
    expect(source).not.toContain('<option value="on_plan">On plan</option>')
    expect(source).not.toContain('<option value="at_risk">At risk</option>')
    expect(source).not.toContain('<option value="off_plan">Off plan</option>')
  })

  it('lets BPR rows sort by owner without replacing the default slot order', () => {
    expect(source).toContain('bprSort')
    expect(source).toContain('sortNorthStarRows')
    expect(source).toContain('BprSortableTh')
    expect(source).toContain('field="owner"')
  })

  it('keeps BPR table headers sticky inside the scroll container', () => {
    expect(source).toContain('max-h-[72vh] overflow-auto')
    expect(source).toContain('sticky top-0 z-20')
  })

  it('has a read-only conference view for large-screen BPR review', () => {
    expect(source).toContain('conference')
    expect(source).toContain('ConferenceBprView')
    expect(source).toContain('Editable table')
    expect(source).toContain('Large screen')
  })
})
