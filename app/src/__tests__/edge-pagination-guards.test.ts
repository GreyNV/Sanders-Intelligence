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

  it('enriches sales orders with P&L and prefers USD net sales when available', () => {
    const salesSync = readRepoFile('supabase/functions/sync-sales/index.ts')
    const enrichPnl = functionBody(salesSync, 'enrichOrdersWithProfitAndLoss')
    const revenueSelector = functionBody(salesSync, 'reportGrandTotal')

    expect(salesSync).toContain('enrichOrdersWithProfitAndLoss(base, token, pageRows)')
    expect(enrichPnl).toContain('/api/Orders/ProfitAndLoss')
    expect(enrichPnl).toContain('Orders: batch')
    expect(enrichPnl).toContain('ProfitAndLoss')
    expect(revenueSelector).toContain("['OrderCostUsd', 'orderCostUsd']")
    expect(revenueSelector).toContain("['ProfitLossUsd', 'profitLossUsd']")
    expect(revenueSelector).toContain("['OrderCost', 'orderCost']")
    expect(revenueSelector).toContain('applyCurrencyRate: false')
    expect(revenueSelector).toContain('applyCurrencyRate: true')
    expect(revenueSelector.indexOf('pnlUsdNet')).toBeLessThan(revenueSelector.indexOf('pnlLocalNet'))
    expect(revenueSelector.indexOf('pnlLocalNet')).toBeLessThan(revenueSelector.indexOf('grandTotal'))
  })
})
