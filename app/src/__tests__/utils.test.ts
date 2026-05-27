import { describe, it, expect } from 'vitest'
import {
  fmtNumber,
  fmtCurrency,
  fmtCurrencyFull,
  fmtDateTime,
  isOverdue,
  estimatedArrivalMonth,
  parseMonthLabel,
  groupBy,
  cn,
  prioritySort,
} from '../lib/utils'

// ─── fmtNumber ────────────────────────────────────────────────────────────────

describe('fmtNumber', () => {
  it('formats integers with commas', () => {
    expect(fmtNumber(1234567)).toBe('1,234,567')
  })
  it('rounds decimals to nearest integer', () => {
    expect(fmtNumber(1234.4)).toBe('1,234')
    expect(fmtNumber(1234.9)).toBe('1,235')
  })
  it('handles zero', () => {
    expect(fmtNumber(0)).toBe('0')
  })
  it('handles negative numbers', () => {
    expect(fmtNumber(-500)).toBe('-500')
  })
  it('handles values under 1000', () => {
    expect(fmtNumber(42)).toBe('42')
  })
})

// ─── fmtCurrency ─────────────────────────────────────────────────────────────

describe('fmtCurrency', () => {
  it('formats with dollar sign', () => {
    expect(fmtCurrency(1000)).toBe('$1,000')
  })
  it('rounds to integer (no cents)', () => {
    expect(fmtCurrency(1234.9)).toBe('$1,235')
  })
  it('handles zero', () => {
    expect(fmtCurrency(0)).toBe('$0')
  })
  it('handles large values', () => {
    expect(fmtCurrency(1_000_000)).toBe('$1,000,000')
  })
  it('handles negative values', () => {
    expect(fmtCurrency(-500)).toBe('-$500')
  })
})

// ─── fmtCurrencyFull ──────────────────────────────────────────────────────────

describe('fmtCurrencyFull', () => {
  it('includes exactly 2 decimal places', () => {
    expect(fmtCurrencyFull(1234.5)).toBe('$1,234.50')
    expect(fmtCurrencyFull(1234.99)).toBe('$1,234.99')
  })
  it('handles whole numbers', () => {
    expect(fmtCurrencyFull(1000)).toBe('$1,000.00')
  })
})

describe('fmtDateTime', () => {
  it('includes date and time for refresh timestamps', () => {
    const value = fmtDateTime('2026-05-26T12:34:00Z')
    expect(value).toContain('May 26, 2026')
    expect(value).toMatch(/12:34|3:34/)
  })
})

// ─── isOverdue ────────────────────────────────────────────────────────────────

describe('isOverdue', () => {
  it('returns false for null', () => {
    expect(isOverdue(null)).toBe(false)
  })
  it('returns true for a clearly past date', () => {
    expect(isOverdue('2020-01-01')).toBe(true)
  })
  it('returns false for a clearly future date', () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10)
    expect(isOverdue(future)).toBe(false)
  })
})

// ─── parseMonthLabel ─────────────────────────────────────────────────────────

describe('parseMonthLabel', () => {
  it('parses "May 2026" to a valid timestamp', () => {
    const ts = parseMonthLabel('May 2026')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4) // May is index 4
  })

  it('parses "Jan 2025"', () => {
    const ts = parseMonthLabel('Jan 2025')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseMonthLabel('')).toBe(0)
  })

  it('returns 0 for malformed input (no space)', () => {
    expect(parseMonthLabel('May2026')).toBe(0)
  })

  it('produces sortable order: May < Jun < Jul 2026', () => {
    const may = parseMonthLabel('May 2026')
    const jun = parseMonthLabel('Jun 2026')
    const jul = parseMonthLabel('Jul 2026')
    expect(may).toBeLessThan(jun)
    expect(jun).toBeLessThan(jul)
  })

  it('year boundary: Dec 2025 < Jan 2026', () => {
    const dec = parseMonthLabel('Dec 2025')
    const jan = parseMonthLabel('Jan 2026')
    expect(dec).toBeLessThan(jan)
  })
})

// ─── estimatedArrivalMonth ───────────────────────────────────────────────────

describe('estimatedArrivalMonth', () => {
  it('returns a string in "Mon YYYY" format', () => {
    const result = estimatedArrivalMonth(30)
    // Should be something like "Jun 2026"
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{4}$/)
  })

  it('0 days returns this month', () => {
    const now = new Date()
    const expected = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    expect(estimatedArrivalMonth(0)).toBe(expected)
  })

  it('result is parseable by parseMonthLabel', () => {
    const label = estimatedArrivalMonth(45)
    expect(parseMonthLabel(label)).toBeGreaterThan(0)
  })
})

// ─── groupBy ─────────────────────────────────────────────────────────────────

describe('groupBy', () => {
  it('groups by string key', () => {
    const items = [
      { status: 'a', val: 1 },
      { status: 'b', val: 2 },
      { status: 'a', val: 3 },
    ]
    const result = groupBy(items, r => r.status)
    expect(result['a']).toHaveLength(2)
    expect(result['b']).toHaveLength(1)
    expect(result['a'][0].val).toBe(1)
    expect(result['a'][1].val).toBe(3)
  })

  it('returns an empty object for an empty array', () => {
    expect(groupBy([], _ => 'x')).toEqual({})
  })

  it('handles all items in the same group', () => {
    const items = [{ x: 1 }, { x: 2 }, { x: 3 }]
    const result = groupBy(items, _ => 'same')
    expect(result['same']).toHaveLength(3)
  })

  it('preserves item order within each group', () => {
    const items = [{ n: 1 }, { n: 3 }, { n: 2 }]
    const result = groupBy(items, r => (r.n % 2 === 0 ? 'even' : 'odd'))
    expect(result['odd'].map(r => r.n)).toEqual([1, 3])
    expect(result['even'].map(r => r.n)).toEqual([2])
  })
})

// ─── cn ──────────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('joins two class strings with a space', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('filters out false values', () => {
    expect(cn('foo', false, 'bar')).toBe('foo bar')
  })

  it('filters out null and undefined', () => {
    expect(cn('foo', null, undefined, 'bar')).toBe('foo bar')
  })

  it('returns empty string for all falsy inputs', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('handles a single class', () => {
    expect(cn('only')).toBe('only')
  })
})

// ─── prioritySort ─────────────────────────────────────────────────────────────

describe('prioritySort', () => {
  it('urgent sorts before high', () => {
    expect(prioritySort('urgent', 'high')).toBeLessThan(0)
  })

  it('high sorts before medium', () => {
    expect(prioritySort('high', 'medium')).toBeLessThan(0)
  })

  it('medium sorts before low', () => {
    expect(prioritySort('medium', 'low')).toBeLessThan(0)
  })

  it('equal priorities return 0', () => {
    expect(prioritySort('high', 'high')).toBe(0)
    expect(prioritySort('low', 'low')).toBe(0)
  })

  it('reverse order returns positive', () => {
    expect(prioritySort('low', 'urgent')).toBeGreaterThan(0)
  })

  it('unknown priority is treated as lowest', () => {
    expect(prioritySort('unknown', 'low')).toBeGreaterThan(0)
  })
})
