import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}`)
  expect(start).toBeGreaterThanOrEqual(0)

  const braceStart = source.indexOf('{', start)
  let depth = 0
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(braceStart, index + 1)
  }

  throw new Error(`Could not parse body for ${name}`)
}

describe('Edge Supabase pagination guards', () => {
  it('paginates SKU matcher reads that can exceed Supabase default limits', () => {
    const source = readRepoFile('supabase/functions/match-sellercloud-skus/index.ts')

    expect(functionBody(source, 'loadUnmatchedSourceSkus')).toContain('.range(from, from + pageSize - 1)')
    expect(functionBody(source, 'loadExistingBridgeKeys')).toContain('.range(from, from + pageSize - 1)')
  })

  it('paginates bridge reads used by PO and sales syncs', () => {
    const poSync = readRepoFile('supabase/functions/sync-purchase-orders/index.ts')
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')

    expect(functionBody(poSync, 'loadSkuBridge')).toContain('.range(from, from + pageSize - 1)')
    expect(functionBody(salesSync, 'loadSkuBridge')).toContain('.range(from, from + pageSize - 1)')
  })

  it('enriches sales orders with P&L but prefers Orders GrandTotal for report matching', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const enrichPnl = functionBody(salesSync, 'enrichOrdersWithProfitAndLoss')
    const revenueSelector = functionBody(salesSync, 'reportGrandTotal')

    expect(salesSync).toContain('enrichOrdersWithProfitAndLoss(base, token, pageRows)')
    expect(enrichPnl).toContain('/api/Orders/ProfitAndLoss')
    expect(enrichPnl).toContain('Orders: batch')
    expect(enrichPnl).toContain('ProfitAndLoss')
    expect(enrichPnl).toContain('orders.filter(needsProfitAndLoss)')
    expect(functionBody(salesSync, 'needsProfitAndLoss')).toContain('!orderHasPositiveLineRevenue(order)')
    expect(functionBody(salesSync, 'orderHasPositiveLineRevenue')).toContain('items.some(item => hasPositiveLineRevenue(item))')
    expect(revenueSelector).toContain("['OrderCostUsd', 'orderCostUsd']")
    expect(revenueSelector).toContain("['ProfitLossUsd', 'profitLossUsd']")
    expect(revenueSelector).toContain("['OrderCost', 'orderCost']")
    expect(revenueSelector).toContain('applyCurrencyRate: false')
    expect(revenueSelector).toContain('applyCurrencyRate: true')
    expect(revenueSelector.indexOf('grandTotal')).toBeLessThan(revenueSelector.indexOf('pnlUsdNet'))
    expect(revenueSelector.indexOf('detailGrandTotal')).toBeLessThan(revenueSelector.indexOf('pnlUsdNet'))
    expect(revenueSelector.indexOf('pnlUsdNet')).toBeLessThan(revenueSelector.indexOf('pnlLocalNet'))
  })

  it('allows zero sales report totals to fall through when secondary revenue exists', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const revenueSelector = functionBody(salesSync, 'reportGrandTotal')

    expect(revenueSelector).toContain('grandTotal != null && grandTotal > 0')
    expect(revenueSelector).toContain('detailGrandTotal != null && detailGrandTotal > 0')
    expect(revenueSelector).toContain('!hasPositiveLineRevenue(row)')
    expect(functionBody(salesSync, 'hasPositiveLineRevenue')).toContain('lineRevenueTotal(row) > 0')
    expect(revenueSelector.indexOf('grandTotal > 0')).toBeLessThan(revenueSelector.indexOf('pnlUsdNet'))
    expect(revenueSelector.indexOf('pnlUsdNet')).toBeLessThan(revenueSelector.indexOf('!hasPositiveLineRevenue(row)'))
  })

  it('merges chunked sales-sync writes so later chunks do not overwrite earlier chunk totals', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const handler = salesSync.slice(salesSync.indexOf('Deno.serve'))

    expect(handler).toContain('mergeSalesRowsWithExisting')
    expect(handler.indexOf('mergeSalesRowsWithExisting')).toBeLessThan(handler.indexOf('.upsert(salesRows'))
    expect(functionBody(salesSync, 'mergeSalesRowsWithExisting')).toContain('.in(')
    expect(functionBody(salesSync, 'mergeSalesRowsWithExisting')).toContain('Number(existing.units_sold')
    expect(functionBody(salesSync, 'mergeSalesRowsWithExisting')).toContain('Number(existing.revenue')
    expect(functionBody(salesSync, 'mergeSalesRowsWithExisting')).toContain('Number(existing.orders_count')
  })

  it('preserves raw SellerCloud company and channel when aggregating sales rows', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const aggregate = functionBody(salesSync, 'aggregateSalesRows')

    expect(aggregate).toContain('raw_company')
    expect(aggregate).toContain('raw_channel')
    expect(aggregate).toContain("['CompanyName', 'companyName', 'Company', 'company']")
    expect(aggregate).toContain('sellerCloudChannel(row)')
    expect(functionBody(salesSync, 'sellerCloudChannel')).toContain("'OrderSource'")
    expect(salesSync).toContain('ORDER_SOURCE_BY_ID')
    expect(salesSync).toContain("'42': 'Walmart'")
    expect(aggregate).toContain('sellercloud_company')
    expect(aggregate).toContain('sellercloud_channel')
  })

  it('keys sales rows by raw company and raw channel to prevent mapping collisions', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const handler = salesSync.slice(salesSync.indexOf('Deno.serve'))
    const keyBuilder = functionBody(salesSync, 'salesRowKey')
    const merge = functionBody(salesSync, 'mergeSalesRowsWithExisting')

    expect(handler).toContain("onConflict: 'sale_date,raw_company,raw_channel,source_sku'")
    expect(merge).toContain('raw_company')
    expect(merge).toContain('raw_channel')
    expect(keyBuilder).toContain('raw_company')
    expect(keyBuilder).toContain('raw_channel')
    expect(keyBuilder.indexOf('sale_date')).toBeLessThan(keyBuilder.indexOf('raw_company'))
    expect(keyBuilder.indexOf('raw_company')).toBeLessThan(keyBuilder.indexOf('raw_channel'))
    expect(keyBuilder.indexOf('raw_channel')).toBeLessThan(keyBuilder.indexOf('source_sku'))
  })

  it('backfills sales by ship date and replaces each date before rebuilding chunks', () => {
    const backfill = readRepoFile('app/scripts/backfill-sales-daily.mjs')

    expect(backfill).toContain("const dateParamPreset = args.dateParamPreset ?? 'shipDate'")
    expect(backfill).toContain("const saleDatePreset = args.saleDatePreset ?? 'shipDate'")
    expect(backfill).toContain('saleDatePreset')
    expect(backfill).toContain('replaceDate: startPage === 1')
  })
})
