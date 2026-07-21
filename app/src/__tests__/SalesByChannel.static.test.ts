import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Sales by Channel data contract', () => {
  const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
  const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')
  const hookPath = resolve(__dirname, '../hooks/useSalesChannels.ts')
  const pagePath = resolve(__dirname, '../pages/csuite/SalesByChannel.tsx')
  const adminPagePath = resolve(__dirname, '../pages/admin/SalesChannelMappingsPage.tsx')

  it('registers the executive sales page and admin mapping panel in guarded navigation', () => {
    expect(appSource).toContain("const SalesByChannel = lazy(() => import('@/pages/csuite/SalesByChannel'))")
    expect(appSource).toContain("const SalesChannelMappingsPage = lazy(() => import('@/pages/admin/SalesChannelMappingsPage'))")
    expect(appSource).toContain('path="/executive/sales"')
    expect(appSource).toContain("<RoleGuard allow={['admin', 'csuite']}><SalesByChannel /></RoleGuard>")
    expect(appSource).toContain('path="/admin/sales-channel-mappings"')
    expect(appSource).toContain("<RoleGuard allow={['admin']}><SalesChannelMappingsPage /></RoleGuard>")

    expect(sidebarSource).toContain("to: '/executive/sales'")
    expect(sidebarSource).toContain("label: 'Sales by Channel'")
    expect(sidebarSource).toContain("to: '/admin/sales-channel-mappings'")
    expect(sidebarSource).toContain("label: 'Channel Mappings'")
  })

  it('builds the executive page around mapped sales, month navigation, goals, and Add mapping', () => {
    expect(existsSync(pagePath)).toBe(true)
    const pageSource = readFileSync(pagePath, 'utf8')

    expect(pageSource).toContain('useSalesByChannel(selectedMonth)')
    expect(pageSource).toContain('useUpdateSalesChannelGoal')
    expect(pageSource).toContain('addMonthsToPeriod')
    expect(pageSource).toContain('formatPeriodMonth')
    expect(pageSource).toContain('ADD_MAPPING_CHANNEL')
    expect(pageSource).toContain('Daily lift')
    expect(pageSource).toContain('On track')
    expect(pageSource).toContain('Needs lift')
    expect(pageSource).toContain('Goal')
    expect(pageSource).toContain('SortableHeader')
    expect(pageSource).toContain('sortSalesByChannelRows')
    expect(pageSource).toContain("sortConfig.key === 'channel'")
    expect(pageSource).toContain("sortConfig.key === 'mtd_revenue'")
    expect(pageSource).toContain("sortConfig.key === 'goal_amount'")
    expect(pageSource).toContain("sortConfig.key === 'projected_month_end'")
    expect(pageSource).toContain("sortConfig.key === 'daily_lift'")
    expect(pageSource).toContain("sortConfig.key === 'status'")
    expect(pageSource).not.toContain('signedCurrency(totalMtd - totalLyMtd)')
    expect(pageSource).not.toContain('MetricCell label="Goal"')
    expect(pageSource).not.toContain('LY MTD')
    expect(pageSource).not.toContain('YoY')
    expect(pageSource).toContain('/admin/sales-channel-mappings')
  })

  it('builds the admin mapping panel around unmapped pairs and mapping upserts', () => {
    expect(existsSync(adminPagePath)).toBe(true)
    const pageSource = readFileSync(adminPagePath, 'utf8')

    expect(pageSource).toContain('useSalesByChannel(selectedMonth)')
    expect(pageSource).toContain('useSalesChannelMappings')
    expect(pageSource).toContain('useUpsertSalesChannelMapping')
    expect(pageSource).toContain('unmappedSourcePairs')
    expect(pageSource).toContain('sellercloud_company')
    expect(pageSource).toContain('sellercloud_channel')
    expect(pageSource).toContain('qb_channel')
    expect(pageSource).toContain('Add mapping')
    expect(pageSource).toContain('editingMappingId')
    expect(pageSource).toContain('handleExistingSubmit')
    expect(pageSource).toContain('Edit mapping')
    expect(pageSource).toContain('Cancel edit')
    expect(pageSource).toContain('Active mapping')
  })

  it('adds a month-scoped hook that fetches sales rows, mappings, and goals', () => {
    expect(existsSync(hookPath)).toBe(true)
    const hookSource = readFileSync(hookPath, 'utf8')

    expect(hookSource).toContain('useSalesByChannel')
    expect(hookSource).toContain("['sales_by_channel', periodMonth]")
    expect(hookSource).toContain("from('sales_daily')")
    expect(hookSource).toContain("from('sales_channel_mappings')")
    expect(hookSource).toContain("from('sales_channel_goals')")
    expect(hookSource).toContain('.range(from, from + pageSize - 1)')
    expect(hookSource).toContain('deriveSalesByChannel')
  })

  it('adds admin-only monthly channel goal mutation hooks', () => {
    expect(existsSync(hookPath)).toBe(true)
    const hookSource = readFileSync(hookPath, 'utf8')

    expect(hookSource).toContain('useUpdateSalesChannelGoal')
    expect(hookSource).toContain('Admin role required')
    expect(hookSource).toContain("onConflict: 'period_month,qb_channel'")
    expect(hookSource).toContain("invalidateQueries({ queryKey: ['sales_by_channel', payload.period_month] })")
  })

  it('adds admin-only mapping management hooks', () => {
    expect(existsSync(hookPath)).toBe(true)
    const hookSource = readFileSync(hookPath, 'utf8')

    expect(hookSource).toContain('useSalesChannelMappings')
    expect(hookSource).toContain('useUpsertSalesChannelMapping')
    expect(hookSource).toContain("from('sales_channel_mappings')")
    expect(hookSource).toContain("onConflict: 'normalized_company,normalized_channel'")
    expect(hookSource).toContain("invalidateQueries({ queryKey: ['sales_channel_mappings'] })")
    expect(hookSource).toContain("invalidateQueries({ queryKey: ['sales_by_channel'] })")
  })
})
