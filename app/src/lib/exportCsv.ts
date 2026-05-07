/**
 * Lightweight CSV export utility.
 * Excel opens .csv files natively — no xlsx dependency required.
 */

type Row = Record<string, string | number | boolean | null | undefined>

export function downloadCsv(rows: Row[], filename: string): void {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])

  function escapeCell(val: string | number | boolean | null | undefined): string {
    if (val === null || val === undefined) return ''
    const str = String(val)
    // Wrap in quotes if the value contains commas, newlines or quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(',')),
  ]

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Convert InventoryRecord[] to flat export rows */
import { InventoryRecord } from '@/types'

export function inventoryToExportRows(records: InventoryRecord[]): Row[] {
  return records.map(r => ({
    'SKU':                    r.product_code,
    'Description':            r.description,
    'Warehouse':              r.warehouse,
    'Supplier Code':          r.supplier_code,
    'Supplier':               r.supplier_description,
    'Brand Code':             r.brand_code,
    'Brand':                  r.brand_name,
    'Category Code':          r.category_code,
    'Category':               r.category_name,
    'Status':                 r.status,
    'Classification':         r.classification,
    'Velocity':               r.velocity,
    'On Hand':                r.on_hand,
    'Days on Hand':           r.days_on_hand,
    'Cost Price':             r.cost_price,
    'On Hand Value':          r.on_hand_value,
    'Selling Price':          r.selling_price,
    'Average Sales (mo)':     r.average_sales,
    'Avg Sales (day)':        +(r.average_sales / 30).toFixed(4),
    'Avg Forecasted Sales':   r.average_forecasted_sales,
    'On Order':               r.on_order,
    'Lead Time (days)':       r.lt_days,
    'Recommended Order Qty':  r.recommended_order,
    'Recommended Order Value': r.recommended_order_value,
    'Recommended Order Days': r.recommended_order_days,
    'Excess Units':           r.excess_units,
    'Excess Value':           r.excess_value,
    'Status Units':           r.status_units,
    'Status Value':           r.status_value,
    'Total Customer Orders':  r.total_customer_orders,
    'Unsatisfied Units':      r.unsatisfied_customer_orders_units,
    'Unsatisfied Value':      r.unsatisfied_customer_orders_value,
    'Back Orders':            r.back_orders,
    'MOQ':                    r.moq,
    'Order Multiples':        r.order_multiples,
    'Age':                    r.age,
  }))
}
