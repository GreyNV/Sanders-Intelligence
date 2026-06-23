import { describe, expect, it } from 'vitest'
import {
  buildSkuBridgeInsertRows,
  matchSellerCloudSku,
  summarizeSkuBackfill,
} from '../../../supabase/functions/_shared/sku-match'

const inventorySkus = ['ABC-123', 'BOX-24', 'SKU777']

describe('SellerCloud SKU matching', () => {
  it('auto-matches direct source SKUs with full confidence', () => {
    const match = matchSellerCloudSku('ABC-123', inventorySkus)

    expect(match).toMatchObject({
      sourceSku: 'ABC-123',
      planningSku: 'ABC-123',
      matchMethod: 'direct',
      confidence: 1,
    })
  })

  it('auto-matches high-confidence canonical variants', () => {
    const match = matchSellerCloudSku('abc123', inventorySkus)

    expect(match).toMatchObject({
      planningSku: 'ABC-123',
      matchMethod: 'compact_canonical',
      confidence: 0.96,
    })
  })

  it('leaves ambiguous canonical matches unmatched', () => {
    const match = matchSellerCloudSku('abc123', ['ABC-123', 'ABC_123'])

    expect(match).toBeNull()
  })

  it('builds idempotent bridge rows only for confident matches', () => {
    const rows = buildSkuBridgeInsertRows(['ABC-123', 'abc123', 'unknown'], inventorySkus)

    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.source_sku)).toEqual(['ABC-123', 'abc123'])
    expect(rows[0]).toMatchObject({ source_system: 'seller_cloud', planning_sku: 'ABC-123', confidence: 1 })
  })

  it('summarizes before and after unmatched counts', () => {
    const summary = summarizeSkuBackfill({
      beforeUnmatched: 10,
      matchedSourceSkus: 4,
      backfilledItems: 6,
    })

    expect(summary.afterUnmatched).toBe(6)
    expect(summary.matchRate).toBe(0.4)
  })
})
