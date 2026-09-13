export interface HistoricalReceipt {
  receipt_id: string
  received_date: string
  po_id: string
  source_sku: string
  quantity: number
  unit_cost: number
  received_value: number
}
const aliases: Record<string, string[]> = {
  receipt_id: ['receiptid', 'receivingid', 'arrivalid'],
  received_date: ['receiveddate', 'datereceived', 'date'],
  po_id: ['poid', 'purchaseorderid', 'purchaseordernumber'],
  source_sku: ['sku', 'productid', 'sourcesku'],
  quantity: ['quantity', 'qtyreceived', 'quantityreceived'],
  unit_cost: ['unitcost', 'unitprice', 'cost'],
}
export function parseReceiptRows(
  rows: Record<string, unknown>[],
  from: string,
  to: string,
): HistoricalReceipt[] {
  if (!rows.length) throw new Error('The export contains no receipt rows')
  if (rows.length > 50000)
    throw new Error('Import at most 50,000 rows at a time')
  const ids = new Set<string>()
  return rows.map((row, index) => {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.toLowerCase().replace(/[^a-z0-9]/g, ''),
        value,
      ]),
    )
    const get = (field: string) =>
      aliases[field]
        .map((key) => normalized[key])
        .find((value) => value !== undefined && value !== null && value !== '')
    const text = (field: string) => String(get(field) ?? '').trim()
    const numeric = (field: string) => {
      const raw = text(field)
        .replace(/[$,\s]/g, '')
        .replace(/^\((.*)\)$/, '-$1')
      if (!raw || !Number.isFinite(Number(raw)))
        throw new Error(`Row ${index + 2}: invalid ${field}`)
      return Number(raw)
    }
    const receipt_id = text('receipt_id'),
      received_date = text('received_date'),
      po_id = text('po_id'),
      source_sku = text('source_sku')
    if (!receipt_id || !po_id || !source_sku)
      throw new Error(
        `Row ${index + 2}: receipt ID, PO ID, and SKU are required`,
      )
    if (ids.has(receipt_id))
      throw new Error(`Row ${index + 2}: duplicate receipt ID ${receipt_id}`)
    ids.add(receipt_id)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(received_date) ||
      !Number.isFinite(Date.parse(received_date)) ||
      new Date(received_date).toISOString().slice(0, 10) !== received_date
    )
      throw new Error(`Row ${index + 2}: received date must be YYYY-MM-DD`)
    if (received_date < from || received_date > to)
      throw new Error(
        `Row ${index + 2}: received date is outside the declared export range`,
      )
    const quantity = numeric('quantity'),
      unit_cost = numeric('unit_cost')
    if (unit_cost < 0)
      throw new Error(
        `Row ${index + 2}: unit cost cannot be negative; use a negative quantity for reversals`,
      )
    return {
      receipt_id,
      received_date,
      po_id,
      source_sku,
      quantity,
      unit_cost,
      received_value:
        Math.round((quantity * unit_cost + Number.EPSILON) * 100) / 100,
    }
  })
}
