import type { UploadTrendPoint } from '@/hooks/useInventory'
import type { InventoryRecord } from '@/types'

export interface WeeklyHealthPoint {
  weekKey: string
  label: string
  okValue: number
  excessValue: number
  atRiskValue: number
  newItemValue: number
  okPct: number
  excessPct: number
  atRiskPct: number
  newItemPct: number
  isLatestWeek: boolean
}

export interface TopRiskSupplier {
  supplier: string
  atRiskSkuCount: number
  atRiskOnHandValue: number
  minDaysOnHand: number | null
  recOrderValue: number
  openBackorderValue: number
  fillRate: number
}

interface IsoWeekParts {
  key: string
  monday: Date
}

export function getIsoWeekKey(iso: string): string {
  return getIsoWeekParts(iso).key
}

export function buildTopRiskSuppliers(records: InventoryRecord[]): TopRiskSupplier[] {
  const grouped = groupBy(records, r => r.supplier_description || 'Unknown supplier')

  return Object.entries(grouped)
    .map(([supplier, items]) => {
      const atRiskItems = items.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out')
      const stockedRiskItems = atRiskItems.filter(r => r.status === 'Potential s/o' && r.days_on_hand > 0)
      const activeSkus = items.filter(r => r.average_sales > 0 || r.on_hand > 0 || r.status === 'Ok').length
      const okCount = items.filter(r => r.status === 'Ok').length

      return {
        supplier,
        atRiskSkuCount: atRiskItems.length,
        atRiskOnHandValue: atRiskItems.reduce((s, r) => s + r.on_hand_value, 0),
        minDaysOnHand: stockedRiskItems.length > 0 ? Math.min(...stockedRiskItems.map(r => r.days_on_hand)) : null,
        recOrderValue: atRiskItems.reduce((s, r) => s + r.recommended_order_value, 0),
        openBackorderValue: items.reduce((s, r) => s + r.unsatisfied_customer_orders_value, 0),
        fillRate: activeSkus > 0 ? Math.min((okCount / activeSkus) * 100, 100) : 0,
      }
    })
    .filter(row => row.atRiskSkuCount > 0)
    .sort((a, b) => b.recOrderValue - a.recOrderValue)
    .slice(0, 10)
}

export function buildWeeklyHealthPoints(
  trends: UploadTrendPoint[],
  weekCount = 12
): WeeklyHealthPoint[] {
  if (trends.length === 0) return []

  const latestDate = trends.reduce((latest, point) =>
    new Date(point.date).getTime() > new Date(latest.date).getTime() ? point : latest
  , trends[0])
  const latestMonday = getIsoWeekParts(latestDate.date).monday
  const earliestMonday = new Date(latestMonday)
  earliestMonday.setUTCDate(latestMonday.getUTCDate() - ((weekCount - 1) * 7))

  const groups = new Map<string, { monday: Date; uploads: UploadTrendPoint[] }>()

  for (const trend of trends) {
    const parts = getIsoWeekParts(trend.date)
    if (parts.monday < earliestMonday || parts.monday > latestMonday) continue
    const group = groups.get(parts.key) ?? { monday: parts.monday, uploads: [] }
    group.uploads.push(trend)
    groups.set(parts.key, group)
  }

  const points = Array.from(groups.entries())
    .sort(([, a], [, b]) => a.monday.getTime() - b.monday.getTime())
    .map(([weekKey, group]) => {
      const count = group.uploads.length || 1
      const okValue = sum(group.uploads, 'okValue') / count
      const excessValue = sum(group.uploads, 'healthExcessValue') / count
      const atRiskValue = sum(group.uploads, 'atRiskValue') / count
      const newItemValue = sum(group.uploads, 'newItemValue') / count
      const total = okValue + excessValue + atRiskValue + newItemValue

      return {
        weekKey,
        label: group.monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        okValue,
        excessValue,
        atRiskValue,
        newItemValue,
        okPct: total > 0 ? (okValue / total) * 100 : 0,
        excessPct: total > 0 ? (excessValue / total) * 100 : 0,
        atRiskPct: total > 0 ? (atRiskValue / total) * 100 : 0,
        newItemPct: total > 0 ? (newItemValue / total) * 100 : 0,
        isLatestWeek: false,
      }
    })

  const latestWeekKey = points.length > 0 ? points[points.length - 1].weekKey : undefined
  return points.map(point => ({ ...point, isLatestWeek: point.weekKey === latestWeekKey }))
}

function getIsoWeekParts(iso: string): IsoWeekParts {
  const date = new Date(iso)
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  const monday = new Date(utc)
  monday.setUTCDate(utc.getUTCDate() - day + 1)

  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const firstDay = firstThursday.getUTCDay() || 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 4)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))

  return {
    key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    monday,
  }
}

function sum(points: UploadTrendPoint[], field: 'okValue' | 'healthExcessValue' | 'atRiskValue' | 'newItemValue'): number {
  return points.reduce((total, point) => total + point[field], 0)
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}
