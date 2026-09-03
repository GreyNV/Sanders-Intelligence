import { describe, expect, it } from 'vitest'
import { fetchInventoryBalance } from '../hooks/useInventoryBalance'

interface FakeResponse<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

type FakeTable = 'inventory_balance_settings' | 'po_receipt_movements' | 'sales_daily'

function makeClient({
  settings,
  receipts,
  sales,
  missingTable,
}: {
  settings?: Record<string, unknown> | null
  receipts?: Array<Array<Record<string, unknown>>>
  sales?: Array<Array<Record<string, unknown>>>
  missingTable?: FakeTable
}) {
  const pages: Record<FakeTable, Array<Array<Record<string, unknown>>>> = {
    inventory_balance_settings: [],
    po_receipt_movements: receipts ? [...receipts] : [],
    sales_daily: sales ? [...sales] : [],
  }
  const ranges: Partial<Record<FakeTable, Array<[number, number]>>> = {}

  return {
    ranges,
    from(table: FakeTable) {
      ranges[table] ||= []
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        maybeSingle: async (): Promise<FakeResponse<Record<string, unknown>>> => {
          if (missingTable === table) return { data: null, error: { code: '42P01', message: 'missing relation' } }
          return { data: settings ?? null, error: null }
        },
        range: async (from: number, to: number): Promise<FakeResponse<Array<Record<string, unknown>>>> => {
          ranges[table]?.push([from, to])
          if (missingTable === table) return { data: null, error: { code: 'PGRST205', message: 'missing relation' } }
          return { data: pages[table].shift() ?? [], error: null }
        },
      }
      return query
    },
  }
}

describe('fetchInventoryBalance', () => {
  it('fetches paginated movements and rolls them into monthly balances', async () => {
    const firstReceiptPage = Array.from({ length: 1000 }, () => ({
      observed_at: '2026-04-15T12:00:00Z',
      received_value: 1,
    }))
    const client = makeClient({
      settings: {
        id: 'settings-1',
        settings_key: 'active',
        beginning_period_month: '2026-04-01',
        beginning_inventory_value: 1000,
        updated_by: null,
        updated_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
      },
      receipts: [
        firstReceiptPage,
        [{ observed_at: '2026-05-02T12:00:00Z', received_value: 250 }],
      ],
      sales: [
        [
          { sale_date: '2026-04-10', cogs_amount: 200, cogs_source: 'sellercloud_profit_loss_usd', source_payload: { cogs_missing_count: 0 } },
          { sale_date: '2026-05-10', cogs_amount: 300, cogs_source: 'missing', source_payload: { cogs_missing_count: 1 } },
        ],
      ],
    })

    const data = await fetchInventoryBalance('2026-05-01', client as never)

    expect(data.setupRequired).toBe(false)
    expect(data.rows).toEqual([
      {
        period_month: '2026-04-01',
        first_date: '2026-04-01',
        end_date: '2026-04-30',
        beginning_inventory_value: 1000,
        po_received_value: 1000,
        cogs_amount: 200,
        ending_inventory_value: 1800,
        missing_cogs_count: 0,
      },
      {
        period_month: '2026-05-01',
        first_date: '2026-05-01',
        end_date: '2026-05-31',
        beginning_inventory_value: 1800,
        po_received_value: 250,
        cogs_amount: 300,
        ending_inventory_value: 1750,
        missing_cogs_count: 1,
      },
    ])
    expect(data.selectedRow?.period_month).toBe('2026-05-01')
    expect(client.ranges.po_receipt_movements).toEqual([[0, 999], [1000, 1999]])
  })

  it('returns setupRequired when the inventory balance tables are missing', async () => {
    const client = makeClient({ missingTable: 'inventory_balance_settings' })

    await expect(fetchInventoryBalance('2026-05-01', client as never)).resolves.toMatchObject({
      settings: null,
      rows: [],
      selectedRow: null,
      setupRequired: true,
    })
  })
})

