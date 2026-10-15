import { supabase } from '@/lib/supabase'
import type { ParsedSalesReport } from '@/lib/salesReportParser'

const PAGE_SIZE = 50
const PAGES_PER_CALL = 20

export interface SalesReportSyncProgress {
  phase: 'syncing' | 'finalizing'
  date: string
  dateIndex: number
  dateCount: number
  startPage: number
}

export interface SalesReportSyncDayResult {
  sale_date: string
  reportRevenue: number
  syncedRevenue: number
  variance: number
}

export interface SalesReportSyncResult {
  reportRevenue: number
  syncedRevenue: number
  variance: number
  daily: SalesReportSyncDayResult[]
}

export async function syncSalesReport(
  report: ParsedSalesReport,
  onProgress: (progress: SalesReportSyncProgress) => void
): Promise<SalesReportSyncResult> {
  const dates = eachDate(report.dateFrom, report.dateTo)
  const reportByDate = new Map(report.daily.map(day => [day.sale_date, day]))
  const daily: SalesReportSyncDayResult[] = []

  for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
    const date = dates[dateIndex]
    let startPage = 1

    while (true) {
      onProgress({ phase: 'syncing', date, dateIndex, dateCount: dates.length, startPage })
      const { data, error } = await supabase.functions.invoke('sync-sales', {
        body: {
          dateFrom: date,
          dateTo: date,
          dateParamPreset: 'shipDate',
          saleDatePreset: 'shipDate',
          maxPages: PAGES_PER_CALL,
          pageSize: PAGE_SIZE,
          startPage,
          replaceDate: startPage === 1,
        },
      })
      if (error) throw new Error(`Sales sync failed for ${date} at page ${startPage}: ${error.message}`)
      if (data?.error) throw new Error(`Sales sync failed for ${date} at page ${startPage}: ${data.error}`)

      const pagesFetched = Number(data?.pagesFetched ?? 0)
      const totalResults = Number(data?.totalResults ?? 0)
      if (pagesFetched <= 0 && totalResults > 0) {
        throw new Error(`SellerCloud returned no pages for ${date} at page ${startPage}.`)
      }

      const complete = pagesFetched < PAGES_PER_CALL ||
        (totalResults > 0 && (startPage + pagesFetched - 1) * PAGE_SIZE >= totalResults)
      if (complete) break
      startPage += pagesFetched
    }

    const syncedRevenue = await fetchSalesRevenueForDate(date)
    const reportRevenue = reportByDate.get(date)?.revenue ?? 0
    daily.push({
      sale_date: date,
      reportRevenue,
      syncedRevenue,
      variance: roundCurrency(syncedRevenue - reportRevenue),
    })
  }

  onProgress({
    phase: 'finalizing',
    date: report.dateTo,
    dateIndex: dates.length - 1,
    dateCount: dates.length,
    startPage: 1,
  })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired before the sync could be finalized. Sign in and run the upload again.')
  const finalDate = reportByDate.get(report.dateTo)
  const response = await fetch('/api/sales-upload/finalize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      filename: report.filename,
      reportRevenue: report.totalRevenue,
      reportRows: report.rowCount,
      finalDateOrders: finalDate?.orders ?? 0,
    }),
  })
  const finalBody = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(finalBody.error || 'Sales data was saved, but the automatic-sync checkpoint could not be finalized.')

  const syncedRevenue = roundCurrency(daily.reduce((sum, day) => sum + day.syncedRevenue, 0))
  return {
    reportRevenue: report.totalRevenue,
    syncedRevenue,
    variance: roundCurrency(syncedRevenue - report.totalRevenue),
    daily,
  }
}

async function fetchSalesRevenueForDate(date: string): Promise<number> {
  let from = 0
  let revenue = 0

  while (true) {
    const { data, error } = await supabase
      .from('sales_daily')
      .select('revenue')
      .eq('sale_date', date)
      .range(from, from + 999)
    if (error) throw error
    const rows = data ?? []
    revenue += rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0)
    if (rows.length < 1000) break
    from += 1000
  }

  return roundCurrency(revenue)
}

function eachDate(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
