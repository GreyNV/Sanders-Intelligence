import { describe, expect, it } from 'vitest'
import {
  createNorthStarDraftRow,
  computeMonthlyStarMetrics,
  deriveMonthlyStarFromSalesRows,
  NORTH_STAR_PROGRESS_FIELDS,
  NORTH_STAR_EDITABLE_FIELDS,
  buildNorthStarProgressPayload,
  buildNorthStarUpdatePayload,
  mergeNorthStarRows,
  monthlyStarSalesWindows,
  nextNorthStarSlot,
  periodMonth,
  periodWeek,
} from '../pages/csuite/NorthStar.helpers'
import type { NorthStarRow } from '../types'

describe('NorthStar helpers', () => {
  it('derives stable month and week periods', () => {
    const date = new Date('2026-06-17T12:00:00Z')
    expect(periodMonth(date)).toBe('2026-06-01')
    expect(periodWeek(date)).toBe('2026-06-14')
  })

  it('builds current-month sales windows through yesterday with matching LY days', () => {
    expect(monthlyStarSalesWindows('2026-06-01', new Date('2026-06-23T12:00:00Z'))).toMatchObject({
      currentStart: '2026-06-01',
      currentEndExclusive: '2026-06-23',
      previousStart: '2025-06-01',
      previousEndExclusive: '2025-06-23',
      daysElapsed: 22,
      daysRemaining: 8,
    })
  })

  it('uses full month sales windows for closed months', () => {
    expect(monthlyStarSalesWindows('2026-05-01', new Date('2026-06-23T12:00:00Z'))).toMatchObject({
      currentStart: '2026-05-01',
      currentEndExclusive: '2026-06-01',
      previousStart: '2025-05-01',
      previousEndExclusive: '2025-06-01',
      daysElapsed: 31,
      daysRemaining: 0,
    })
  })

  it('uses DB-managed North Star rows once rows exist', () => {
    const saved: NorthStarRow = {
      id: 'row-1',
      period_month: '2026-06-01',
      period_week: '2026-06-14',
      slot_index: 1,
      pillar: 'Finance / cash',
      owner: 'Ryan',
      north_star: 'Custom target',
      plan_value: '7%',
      actual_mtd: '5%',
      forecast: '6%',
      constraint_now: 'capital',
      weekly_move: 'Close terms',
      last_week_result: 'Done',
      status: 'at_risk',
      is_locked: true,
      updated_by: null,
      updated_at: '2026-06-17T00:00:00Z',
      created_at: '2026-06-17T00:00:00Z',
    }

    const rows = mergeNorthStarRows([saved], '2026-06-01', '2026-06-14')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'row-1',
      north_star: 'Custom target',
      plan_value: '7%',
      actual_mtd: '5%',
      forecast: '6%',
      constraint_now: 'capital',
      is_set: true,
      is_locked: true,
      status: 'at_risk',
    })
  })

  it('uses starter BPR defaults only before admin-managed rows exist', () => {
    const rows = mergeNorthStarRows([], '2026-06-01', '2026-06-14')

    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({
      id: null,
      is_set: false,
      is_locked: false,
      pillar: 'Finance / cash',
    })
  })

  it('finds the next available pillar slot', () => {
    const rows = mergeNorthStarRows([], '2026-06-01', '2026-06-14')
    expect(nextNorthStarSlot(rows)).toBe(9)
    expect(nextNorthStarSlot(rows.filter(row => row.slot_index !== 3))).toBe(3)
  })

  it('creates an inline draft row for the next pillar slot', () => {
    const rows = mergeNorthStarRows([], '2026-06-01', '2026-06-14')
    const draft = createNorthStarDraftRow(rows, '2026-06-01', '2026-06-14')

    expect(draft).toMatchObject({
      id: null,
      is_set: false,
      is_locked: false,
      period_month: '2026-06-01',
      period_week: '2026-06-14',
      slot_index: 9,
      pillar: 'New pillar',
      owner: null,
      north_star: '',
      status: 'on_plan',
    })
  })

  it('builds a full save payload from an inline cell edit without requiring row unlock', () => {
    const row = mergeNorthStarRows([], '2026-06-01', '2026-06-14')[0]
    const payload = buildNorthStarUpdatePayload(row, 'weekly_move', 'Call out blocked FBA replenishment')

    expect(NORTH_STAR_EDITABLE_FIELDS).toContain('weekly_move')
    expect(payload).toMatchObject({
      id: null,
      is_locked: true,
      period_month: '2026-06-01',
      period_week: '2026-06-14',
      slot_index: 1,
      pillar: 'Finance / cash',
      weekly_move: 'Call out blocked FBA replenishment',
      status: 'on_plan',
    })
  })

  it('builds a progress-only payload for executive status and note edits', () => {
    const row = {
      ...mergeNorthStarRows([], '2026-06-01', '2026-06-14')[0],
      id: 'row-1',
      constraint_now: 'Freight delay',
      weekly_move: 'Escalate receiving',
      last_week_result: 'Open',
      status: 'at_risk' as const,
    }
    const payload = buildNorthStarProgressPayload(row, 'status', 'off_plan')

    expect(NORTH_STAR_PROGRESS_FIELDS).toEqual(['constraint_now', 'weekly_move', 'last_week_result', 'status'])
    expect(payload).toEqual({
      id: 'row-1',
      constraint_now: 'Freight delay',
      weekly_move: 'Escalate receiving',
      last_week_result: 'Open',
      status: 'off_plan',
    })
  })

  it('computes Monthly Star pace, gap, YoY, and channel drag', () => {
    const metrics = computeMonthlyStarMetrics({
      target_sales: 9000000,
      mtd_actual: 3000000,
      ly_mtd_actual: 2500000,
      days_elapsed: 10,
      days_remaining: 20,
      dragging_channel_notes: 'FBA is soft',
      channel_deltas: [
        { channel: 'FBA', delta: -250000 },
        { channel: 'Wholesale', delta: 100000 },
        { channel: 'WFS', delta: -50000 },
      ],
    })

    expect(metrics.dailyPace).toBe(300000)
    expect(metrics.projectedMonthEnd).toBe(9000000)
    expect(metrics.remainingToTarget).toBe(6000000)
    expect(metrics.dailyNeeded).toBe(300000)
    expect(metrics.liftNeededPct).toBe(0)
    expect(metrics.yoyDelta).toBe(500000)
    expect(metrics.yoyPct).toBe(20)
    expect(metrics.onTrack).toBe(true)
    expect(metrics.draggingChannels).toEqual([
      { channel: 'FBA', delta: -250000 },
      { channel: 'WFS', delta: -50000 },
    ])
  })

  it('flags Monthly Star as not on track below target', () => {
    const metrics = computeMonthlyStarMetrics({
      target_sales: 9000000,
      mtd_actual: 2000000,
      ly_mtd_actual: 0,
      days_elapsed: 10,
      days_remaining: 20,
      dragging_channel_notes: null,
      channel_deltas: [],
    })

    expect(metrics.projectedMonthEnd).toBe(6000000)
    expect(metrics.onTrack).toBe(false)
    expect(metrics.yoyPct).toBeNull()
    expect(metrics.liftNeededPct).toBe(75)
  })

  it('derives Monthly Star inputs from live sales rows with manual target fallback', () => {
    const star = deriveMonthlyStarFromSalesRows({
      periodMonth: '2026-06-01',
      targetSales: 9000000,
      rows: [
        { sale_date: '2026-06-01', channel: 'FBA', revenue: 1000 },
        { sale_date: '2026-06-02', channel: 'FBA', revenue: 1500 },
        { sale_date: '2025-06-01', channel: 'FBA', revenue: 900 },
        { sale_date: '2025-06-02', channel: 'WFS', revenue: 600 },
      ],
      previousYearRows: [
        { sale_date: '2025-06-01', channel: 'FBA', revenue: 900 },
        { sale_date: '2025-06-02', channel: 'WFS', revenue: 600 },
      ],
      daysElapsed: 2,
      daysRemaining: 28,
    })

    expect(star).toMatchObject({
      period_month: '2026-06-01',
      target_sales: 9000000,
      mtd_actual: 2500,
      ly_mtd_actual: 1500,
      days_elapsed: 2,
      days_remaining: 28,
    })
    expect(star.channel_deltas).toEqual([
      { channel: 'FBA', delta: 1600 },
      { channel: 'WFS', delta: -600 },
    ])
  })
})
