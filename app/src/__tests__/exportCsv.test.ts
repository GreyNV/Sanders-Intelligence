import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, inventoryToExportRows } from '../lib/exportCsv'
import type { InventoryRecord } from '../types'

function makeRecord(overrides: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    id: 'id',
    upload_id: 'upload',
    warehouse: 'WH',
    product_code: 'SKU-1',
    description: 'Widget',
    supplier_code: 'SUP',
    supplier_description: 'Vendor A',
    brand_code: 'BR',
    brand_name: 'Brand',
    category_code: 'CAT',
    category_name: 'Category',
    on_hand: 10,
    days_on_hand: 20,
    cost_price: 2,
    on_hand_value: 20,
    classification: 'A',
    velocity: 'H',
    status: 'Ok',
    status_units: 0,
    status_value: 0,
    excess_units: 0,
    excess_value: 0,
    recommended_order: 5,
    recommended_order_value: 10,
    recommended_order_days: 15,
    age: 1,
    average_sales: 30,
    average_forecasted_sales: 35,
    lt_days: 7,
    on_order: 2,
    back_orders: 0,
    total_customer_orders: 1,
    unsatisfied_customer_orders_units: 0,
    unsatisfied_customer_orders_value: 0,
    moq: 1,
    order_multiples: 1,
    selling_price: 4,
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('exportCsv', () => {
  it('converts inventory records to stable flat export rows', () => {
    const [row] = inventoryToExportRows([makeRecord({ product_code: 'SKU-9', average_sales: 45, status: 'Potential s/o' })])

    expect(Object.keys(row)).toEqual([
      'SKU',
      'Description',
      'Warehouse',
      'Supplier Code',
      'Supplier',
      'Brand Code',
      'Brand',
      'Category Code',
      'Category',
      'Status',
      'Classification',
      'Velocity',
      'On Hand',
      'Days on Hand',
      'Cost Price',
      'On Hand Value',
      'Selling Price',
      'Average Sales (mo)',
      'Avg Sales (day)',
      'Avg Forecasted Sales',
      'On Order',
      'Lead Time (days)',
      'Recommended Order Qty',
      'Recommended Order Value',
      'Recommended Order Days',
      'Excess Units',
      'Excess Value',
      'Status Units',
      'Status Value',
      'Total Customer Orders',
      'Unsatisfied Units',
      'Unsatisfied Value',
      'Back Orders',
      'MOQ',
      'Order Multiples',
      'Age',
    ])
    expect(row.SKU).toBe('SKU-9')
    expect(row.Status).toBe('Potential s/o')
    expect(row['Avg Sales (day)']).toBe(1.5)
  })

  it('creates a CSV download with text/csv MIME and a .csv filename', async () => {
    const click = vi.fn()
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(node => node)
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Blob', class {
      type: string
      private content: string

      constructor(parts: string[], options: { type: string }) {
        this.type = options.type
        this.content = parts.join('')
      }

      text() {
        return Promise.resolve(this.content)
      }
    })

    downloadCsv([
      { Name: 'Widget, Large', Quantity: 2 },
      { Name: 'Quote "Test"', Quantity: 3 },
    ], 'inventory_export')

    expect(anchor.href).toBe('blob:csv')
    expect(anchor.download).toBe('inventory_export.csv')
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0]?.[0] as unknown as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8;')
    await expect(blob.text()).resolves.toBe('Name,Quantity\r\n"Widget, Large",2\r\n"Quote ""Test""",3')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
  })
})
