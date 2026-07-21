import { describe, expect, it } from 'vitest'
import {
  ADD_MAPPING_CHANNEL,
  deriveSalesByChannel,
  mappingKey,
  normalizeSalesChannelValue,
} from '../pages/csuite/SalesByChannel.helpers'

describe('Sales by Channel helpers', () => {
  it('aggregates MTD and LY sales by mapped QB channel and flags unmapped source pairs', () => {
    const result = deriveSalesByChannel({
      periodMonth: '2026-07-01',
      daysElapsed: 5,
      daysRemaining: 26,
      rows: [
        { sale_date: '2026-07-01', raw_company: 'Amazon Canada', raw_channel: 'FBA', channel: 'FBA', revenue: 1000, orders_count: 2 },
        { sale_date: '2026-07-02', raw_company: 'Amazon Canada', raw_channel: 'FBA', channel: 'FBA', revenue: 250, orders_count: 1 },
        { sale_date: '2026-07-02', raw_company: 'Cloud 9 Fundraising', raw_channel: 'Website', channel: 'Website', revenue: 500, orders_count: 1 },
        { sale_date: '2026-07-02', raw_company: 'Unknown Co', raw_channel: 'Website', channel: 'Website', revenue: 300, orders_count: 1 },
      ],
      previousYearRows: [
        { sale_date: '2025-07-01', raw_company: 'Amazon Canada', raw_channel: 'FBA', channel: 'FBA', revenue: 400, orders_count: 1 },
        { sale_date: '2025-07-01', raw_company: 'Unknown Co', raw_channel: 'Website', channel: 'Website', revenue: 100, orders_count: 1 },
      ],
      mappings: [
        {
          sellercloud_company: 'Amazon Canada',
          sellercloud_channel: 'FBA',
          normalized_company: 'amazon canada',
          normalized_channel: 'fba',
          qb_channel: 'Amazon CA',
          is_active: true,
        },
        {
          sellercloud_company: 'Cloud 9 Fundraising',
          sellercloud_channel: 'Website',
          normalized_company: 'cloud 9 fundraising',
          normalized_channel: 'website',
          qb_channel: 'Cloud9',
          is_active: true,
        },
        {
          sellercloud_company: 'Unknown Co',
          sellercloud_channel: 'Website',
          normalized_company: 'unknown co',
          normalized_channel: 'website',
          qb_channel: 'Legacy Other',
          is_active: false,
        },
      ],
      goals: [
        { period_month: '2026-07-01', qb_channel: 'Amazon CA', goal_amount: 3100 },
      ],
    })

    expect(result.rows).toEqual([
      expect.objectContaining({
        channel: 'Amazon CA',
        mtd_revenue: 1250,
        ly_mtd_revenue: 400,
        goal_amount: 3100,
        daily_pace: 250,
        projected_month_end: 7750,
        status: 'on_track',
        requires_mapping: false,
      }),
      expect.objectContaining({
        channel: 'Cloud9',
        mtd_revenue: 500,
        ly_mtd_revenue: 0,
        goal_amount: null,
        status: 'no_goal',
        requires_mapping: false,
      }),
      expect.objectContaining({
        channel: ADD_MAPPING_CHANNEL,
        mtd_revenue: 300,
        ly_mtd_revenue: 100,
        goal_amount: null,
        status: 'add_mapping',
        requires_mapping: true,
      }),
    ])
    expect(result.unmappedSourcePairs).toEqual([
      {
        sellercloud_company: 'Unknown Co',
        sellercloud_channel: 'Website',
        normalized_company: 'unknown co',
        normalized_channel: 'website',
        mtd_revenue: 300,
        ly_mtd_revenue: 100,
        row_count: 1,
        orders_count: 1,
      },
    ])
  })

  it('normalizes source keys with the same whitespace-insensitive contract as the seed importer', () => {
    expect(normalizeSalesChannelValue(' Amazon   EU\tDirect ')).toBe('amazon eu direct')
    expect(mappingKey(' Amazon Canada ', ' FBA ')).toBe('amazon canada|fba')
  })
})
