import { parseMonthLabel } from '@/lib/utils'
import type { POInboundItem } from '@/types'

export type InboundSortDir = 'asc' | 'desc'
export type InboundSortField =
  | 'sku'
  | 'product_name'
  | 'vendor'
  | 'qty_units_open'
  | 'expected_delivery_date'
  | 'po_id'
  | 'unit_price'
  | 'receiving_status'

export interface InboundSortState {
  field: InboundSortField
  dir: InboundSortDir
}

export interface InboundFilters {
  search: string
  vendorFilter: string
  statuses: string[]
  arrival: 'all' | 'overdue' | 'near' | 'mid' | 'long'
  today?: Date
}

export interface InboundMonthBucket {
  month: string
  units: number
  skus: number
}

const OLDER_BUCKET = 'Older'
const NO_ETA_BUCKET = 'No ETA'
const MAX_MONTH_SPAN = 18

export function inboundSku(item: POInboundItem): string {
  return item.planning_sku || item.source_sku
}

export function inboundVendor(item: POInboundItem): string {
  return item.purchase_order?.vendor_name || String(item.purchase_order?.vendor_id ?? '-')
}

export function inboundExpectedDate(item: POInboundItem): string | null {
  return item.expected_delivery_date || item.purchase_order?.expected_delivery_date || null
}

export function inboundDaysUntil(value: string | null, today = new Date()): number | null {
  if (!value) return null
  const baseline = new Date(today)
  baseline.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  if (!Number.isFinite(target.getTime())) return null
  return Math.ceil((target.getTime() - baseline.getTime()) / 86400000)
}

export function inboundMonthLabel(value: string | null): string {
  if (!value) return NO_ETA_BUCKET
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return NO_ETA_BUCKET
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function inboundDateText(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '-'
}

export function inboundSortValue(item: POInboundItem, field: InboundSortField): string | number {
  if (field === 'sku') return inboundSku(item)
  if (field === 'vendor') return inboundVendor(item)
  if (field === 'expected_delivery_date') return inboundExpectedDate(item) ?? ''
  if (field === 'receiving_status') return item.receiving_status || item.purchase_order?.receiving_status || ''
  return item[field] ?? ''
}

export function filterInboundItems(items: POInboundItem[], filters: InboundFilters): POInboundItem[] {
  const q = filters.search.trim().toLowerCase()
  const today = filters.today ?? new Date()

  return items.filter(item => {
    const itemSku = inboundSku(item)
    const itemVendor = inboundVendor(item)
    const status = item.purchase_order?.receiving_status || item.receiving_status || 'Unknown'
    const dueDays = inboundDaysUntil(inboundExpectedDate(item), today)

    if (filters.vendorFilter !== 'All' && itemVendor !== filters.vendorFilter) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(status)) return false
    if (filters.arrival === 'overdue' && (dueDays == null || dueDays >= 0)) return false
    if (filters.arrival === 'near' && (dueDays == null || dueDays < 0 || dueDays > 30)) return false
    if (filters.arrival === 'mid' && (dueDays == null || dueDays <= 30 || dueDays > 90)) return false
    if (filters.arrival === 'long' && (dueDays == null || dueDays <= 90)) return false

    if (!q) return true
    return (
      itemSku.toLowerCase().includes(q) ||
      item.source_sku.toLowerCase().includes(q) ||
      String(item.po_id).includes(q) ||
      (item.product_name ?? '').toLowerCase().includes(q) ||
      itemVendor.toLowerCase().includes(q)
    )
  })
}

export function sortInboundItems(items: POInboundItem[], sort: InboundSortState): POInboundItem[] {
  return [...items].sort((a, b) => {
    const av = inboundSortValue(a, sort.field)
    const bv = inboundSortValue(b, sort.field)

    if (typeof av === 'number' && typeof bv === 'number') {
      return sort.dir === 'asc' ? av - bv : bv - av
    }

    return sort.dir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })
}

export function buildInboundMonthBuckets(items: POInboundItem[], today = new Date()): InboundMonthBucket[] {
  const buckets = new Map<string, POInboundItem[]>()
  const datedLabels: string[] = []

  for (const item of items) {
    const date = inboundExpectedDate(item)
    const label = monthBucketLabel(date, today)
    const existing = buckets.get(label) ?? []
    existing.push(item)
    buckets.set(label, existing)
    if (label !== NO_ETA_BUCKET && label !== OLDER_BUCKET) datedLabels.push(label)
  }

  for (const label of fillMonthRange(datedLabels)) {
    if (!buckets.has(label)) buckets.set(label, [])
  }

  return [...buckets.entries()]
    .map(([month, monthItems]) => ({
      month,
      units: monthItems.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0),
      skus: new Set(monthItems.map(inboundSku)).size,
    }))
    .sort(compareMonthBuckets)
}

function monthBucketLabel(value: string | null, today: Date): string {
  if (!value) return NO_ETA_BUCKET
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return NO_ETA_BUCKET

  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const itemMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const diffMonths = (currentMonth.getFullYear() - itemMonth.getFullYear()) * 12 + currentMonth.getMonth() - itemMonth.getMonth()
  if (diffMonths > MAX_MONTH_SPAN) return OLDER_BUCKET
  return inboundMonthLabel(value)
}

function fillMonthRange(labels: string[]): string[] {
  if (labels.length < 2) return labels
  const timestamps = labels.map(parseMonthLabel).filter(value => value > 0).sort((a, b) => a - b)
  if (timestamps.length < 2) return labels

  const start = new Date(timestamps[0])
  const end = new Date(timestamps[timestamps.length - 1])
  const filled: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor <= end) {
    filled.push(cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return filled
}

function compareMonthBuckets(a: InboundMonthBucket, b: InboundMonthBucket): number {
  if (a.month === OLDER_BUCKET) return b.month === OLDER_BUCKET ? 0 : -1
  if (b.month === OLDER_BUCKET) return 1
  if (a.month === NO_ETA_BUCKET) return b.month === NO_ETA_BUCKET ? 0 : 1
  if (b.month === NO_ETA_BUCKET) return -1
  return parseMonthLabel(a.month) - parseMonthLabel(b.month)
}
