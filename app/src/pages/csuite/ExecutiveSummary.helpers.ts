import type { UploadTrendPoint } from '@/hooks/useInventory'
import type { InventoryRecord } from '@/types'
import { deriveFinancialPercentages, sumExcessValue } from '@/lib/financialMetrics'

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
  totalSkuCount: number
  atRiskSkuCount: number
  atRiskOnHandValue: number
  okPct: number
  okValue: number
  atRiskPct: number
  atRiskValue: number
  excessPct: number
  excessValue: number
  backorderedPct: number
  backorderedValue: number
  avgSellingPrice: number | null
  avgProfit: number | null
  cogsPct: number | null
  marginPct: number | null
  minDaysOnHand: number | null
  recOrderValue: number
  openBackorderValue: number
  fillRate: number
}

type ProfitMetricLike = Partial<Record<
  | 'units_30d'
  | 'revenue_30d'
  | 'accrual_profit_30d',
  number
>>

interface IsoWeekParts {
  key: string
  monday: Date
}

export function getIsoWeekKey(iso: string): string {
  return getIsoWeekParts(iso).key
}

export function buildTopRiskSuppliers(
  records: InventoryRecord[],
  profitBySku: Map<string, ProfitMetricLike> = new Map()
): TopRiskSupplier[] {
  const grouped = groupBy(records, r => r.supplier_description || 'Unknown supplier')

  return Object.entries(grouped)
    .map(([supplier, items]) => {
      const atRiskItems = items.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out')
      const stockedRiskItems = atRiskItems.filter(r => r.status === 'Potential s/o' && r.days_on_hand > 0)
      const okItems = items.filter(r => r.status === 'Ok')
      const excessItems = items.filter(r => r.status === 'Excess stock' || r.status === 'Surplus orders')
      const backorderedItems = items.filter(r => r.unsatisfied_customer_orders_units > 0)
      const activeSkus = items.filter(r => r.average_sales > 0 || r.on_hand > 0 || r.status === 'Ok').length
      const okCount = okItems.length
      const totalSkuCount = items.length
      const financialTotals = items.reduce((total, item) => {
        const metric = profitBySku.get(item.product_code)
        return {
          units: total.units + Number(metric?.units_30d ?? 0),
          revenue: total.revenue + Number(metric?.revenue_30d ?? 0),
          profit: total.profit + Number(metric?.accrual_profit_30d ?? 0),
        }
      }, { units: 0, revenue: 0, profit: 0 })
      const avgSellingPrice = financialTotals.units > 0
        ? financialTotals.revenue / financialTotals.units
        : null
      const avgProfit = financialTotals.units > 0
        ? financialTotals.profit / financialTotals.units
        : null
      const { cogsPct, marginPct } = deriveFinancialPercentages(financialTotals)

      return {
        supplier,
        totalSkuCount,
        atRiskSkuCount: atRiskItems.length,
        atRiskOnHandValue: atRiskItems.reduce((s, r) => s + r.on_hand_value, 0),
        okPct: percent(okItems.length, totalSkuCount),
        okValue: okItems.reduce((s, r) => s + r.on_hand_value, 0),
        atRiskPct: percent(atRiskItems.length, totalSkuCount),
        atRiskValue: atRiskItems.reduce((s, r) => s + r.on_hand_value, 0),
        excessPct: percent(excessItems.length, totalSkuCount),
        excessValue: sumExcessValue(excessItems),
        backorderedPct: percent(backorderedItems.length, totalSkuCount),
        backorderedValue: backorderedItems.reduce((s, r) => s + r.unsatisfied_customer_orders_value, 0),
        avgSellingPrice,
        avgProfit,
        cogsPct,
        marginPct,
        minDaysOnHand: stockedRiskItems.length > 0 ? Math.min(...stockedRiskItems.map(r => r.days_on_hand)) : null,
        recOrderValue: atRiskItems.reduce((s, r) => s + r.recommended_order_value, 0),
        openBackorderValue: items.reduce((s, r) => s + r.unsatisfied_customer_orders_value, 0),
        fillRate: activeSkus > 0 ? Math.min((okCount / activeSkus) * 100, 100) : 0,
      }
    })
    .filter(row => row.atRiskSkuCount > 0)
    .sort((a, b) => b.atRiskValue - a.atRiskValue)
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

function percent(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}
