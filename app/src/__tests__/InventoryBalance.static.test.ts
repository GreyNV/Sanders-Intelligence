import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Inventory Balance purchasing view contract', () => {
  const appSource = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8')
  const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')
  const pagePath = resolve(__dirname, '../pages/purchasing/InventoryBalance.tsx')

  it('registers Inventory Balance under guarded Purchasing navigation', () => {
    expect(appSource).toContain("const InventoryBalance = lazy(() => import('@/pages/purchasing/InventoryBalance'))")
    expect(appSource).toContain('path="/purchasing/inventory-balance"')
    expect(appSource).toContain("<RoleGuard allow={['admin', 'purchasing']}><InventoryBalance /></RoleGuard>")
    expect(appSource).not.toContain('/executive/inventory-balance')

    expect(sidebarSource).toContain("to: '/purchasing/inventory-balance'")
    expect(sidebarSource).toContain("label: 'Inventory Balance'")
    expect(sidebarSource.indexOf("to: '/purchasing/inventory-balance'")).toBeLessThan(sidebarSource.indexOf('// C-Suite'))
  })

  it('builds the page around admin opening balance setup and monthly rollforward math', () => {
    expect(existsSync(pagePath)).toBe(true)
    const pageSource = readFileSync(pagePath, 'utf8')

    expect(pageSource).toContain('useInventoryBalance(selectedMonth)')
    expect(pageSource).toContain('useUpdateInventoryBalanceSettings')
    expect(pageSource).toContain("profile?.role === 'admin'")
    expect(pageSource).toContain('type="month"')
    expect(pageSource).toContain('Beginning balance')
    expect(pageSource).toContain('PO received')
    expect(pageSource).toContain('COGS')
    expect(pageSource).toContain('Ending inventory')
    expect(pageSource).toContain('InventoryBalanceTable')
    expect(pageSource).toContain('po_received_value')
    expect(pageSource).toContain('cogs_amount')
    expect(pageSource).toContain('ending_inventory_value')
  })
})
