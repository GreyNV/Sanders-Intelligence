// ─── Number formatting ───────────────────────────────────────────────────────

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

export function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function fmtCurrencyFull(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// ─── Date formatting ─────────────────────────────────────────────────────────

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

// ─── Inventory helpers ───────────────────────────────────────────────────────

/** Estimate arrival month for on-order items using lead time days */
export function estimatedArrivalMonth(ltDays: number, baselineDate: string | Date = new Date()): string {
  const d = baselineDate instanceof Date ? new Date(baselineDate) : new Date(baselineDate)
  if (!Number.isFinite(d.getTime())) return 'Unknown'
  d.setDate(d.getDate() + ltDays)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Parse a month label produced by estimatedArrivalMonth ("May 2026") into a
 * sortable timestamp. Explicitly constructs "Month 1, Year" which every
 * browser's Date parser handles reliably.
 */
export function parseMonthLabel(label: string): number {
  const parts = label.split(' ') // ["May", "2026"]
  if (parts.length !== 2) return 0
  return new Date(`${parts[0]} 1, ${parts[1]}`).getTime()
}

/** Group an array of items by a key extractor */
export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}

// ─── Class name helper ───────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ─── Priority sorting ─────────────────────────────────────────────────────────

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }
export function prioritySort(a: string, b: string): number {
  return (PRIORITY_ORDER[a as keyof typeof PRIORITY_ORDER] ?? 99) -
         (PRIORITY_ORDER[b as keyof typeof PRIORITY_ORDER] ?? 99)
}
