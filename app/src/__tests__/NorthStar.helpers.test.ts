import { describe, expect, it } from 'vitest'
import {
  computeMonthlyStarMetrics,
  mergeNorthStarRows,
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

  it('merges saved North Star rows over default BPR rows', () => {
    const saved: NorthStarRow = {
      id: 'row-1',
      period_month: '2026-06-01',
      period_week: '2026-06-14',
      slot_index: 1,
      pillar: 'Finance / cash',
      owner: 'Ryan',
      north_star: 'Custom target',
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

    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({
      id: 'row-1',
      north_star: 'Custom target',
      constraint_now: 'capital',
      is_set: true,
      is_locked: true,
      status: 'at_risk',
    })
    expect(rows[1].id).toBeNull()
    expect(rows[1].is_set).toBe(false)
    expect(rows[1].is_locked).toBe(false)
  })

  it('computes Monthly Star pace, gap, YoY, and channel drag', () => {
    const metrics = computeMonthlyStarMetrics({
      target_sales: 9000000,
      mtd_actual: 3000000,
      ly_mtd_actual: 2500000,
      days_elapsed: 10,
      days_remaining: 20,
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
      channel_deltas: [],
    })

    expect(metrics.projectedMonthEnd).toBe(6000000)
    expect(metrics.onTrack).toBe(false)
    expect(metrics.yoyPct).toBeNull()
    expect(metrics.liftNeededPct).toBe(75)
  })
})
