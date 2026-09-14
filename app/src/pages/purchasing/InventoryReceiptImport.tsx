import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtCurrencyFull } from '@/lib/utils'
import {
  prepareReceiptImport,
  type HistoricalReceipt,
} from './InventoryBalance.import'

export default function InventoryReceiptImport() {
  const qc = useQueryClient()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(`${new Date().getUTCFullYear()}-01-01`)
  const [to, setTo] = useState(yesterday)
  const [filename, setFilename] = useState('')
  const [rows, setRows] = useState<HistoricalReceipt[]>([])
  const [summary, setSummary] = useState({
    native: false,
    excludedToday: 0,
    zeroCost: 0,
    reversals: 0,
  })
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  function clearPreview() {
    setRows([])
    setSummary({ native: false, excludedToday: 0, zeroCost: 0, reversals: 0 })
    setConfirmed(false)
    setFilename('')
    setError('')
    setSuccess('')
  }
  async function load(file: File | undefined) {
    if (!file || busy) return
    clearPreview()
    setBusy(true)
    try {
      if (!from || !to || from > to || to > yesterday)
        throw new Error('Choose a completed-day export range first')
      if (file.size > 15 * 1024 * 1024)
        throw new Error('Use a file smaller than 15 MB')
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        raw: true,
        cellDates: true,
      })
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]],
        { raw: true, defval: '' },
      )
      const preview = prepareReceiptImport(
        source,
        from,
        to,
        new Date().toISOString().slice(0, 10),
      )
      setRows(preview.rows)
      setSummary(preview)
      setFilename(file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the export')
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    if (!confirmed || !rows.length) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase.rpc('import_inventory_receipts', {
        p_from: from,
        p_to: to,
        p_filename: filename,
        p_rows: rows,
      })
      if (err) throw err
      await qc.invalidateQueries({ queryKey: ['inventory_balance'] })
      setSuccess(`Imported ${rows.length} receipts for ${from} through ${to}.`)
      setRows([])
      setSummary({ native: false, excludedToday: 0, zeroCost: 0, reversals: 0 })
      setConfirmed(false)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : ((e as { message?: string }).message ?? 'Import failed'),
      )
    } finally {
      setBusy(false)
    }
  }
  function template() {
    const blob = new Blob(
      ['receipt_id,received_date,po_id,sku,quantity,unit_cost\r\n'],
      { type: 'text/csv' },
    )
    const url = URL.createObjectURL(blob),
      a = document.createElement('a')
    a.href = url
    a.download = 'inventory-receipts-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <details
      className="card mb-5"
      onDragOver={(e) => {
        e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (!busy) {
          e.currentTarget.open = true
          void load(e.dataTransfer.files[0])
        }
      }}
    >
      <summary className="cursor-pointer font-semibold text-text1">
        Import historical receipts
      </summary>
      <p className="mt-3 text-sm text-text2">
        Drop the original SellerCloud Inventory Arrivals XLSX here, or choose a
        file below. No column changes are needed. Receipt dates, discounted USD
        costs, and corrections are read directly from the report. Confirm the
        date range you exported. Today's receipts are excluded because the day
        is still incomplete.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-text2">
          Export from
          <input
            aria-label="Receipt export from"
            className="input mt-1 block"
            type="date"
            value={from}
            max={to}
            disabled={busy}
            onChange={(e) => {
              setFrom(e.target.value)
              clearPreview()
            }}
          />
        </label>
        <label className="text-xs text-text2">
          Export through
          <input
            aria-label="Receipt export through"
            className="input mt-1 block"
            type="date"
            value={to}
            min={from}
            max={yesterday}
            disabled={busy}
            onChange={(e) => {
              setTo(e.target.value)
              clearPreview()
            }}
          />
        </label>
        <button className="btn-secondary text-xs" onClick={template}>
          <Download size={14} />
          CSV template
        </button>
        <label className="btn-secondary text-xs cursor-pointer">
          <Upload size={14} />
          {busy ? 'Reading…' : 'Choose CSV or XLSX'}
          <input
            aria-label="Receipt history file"
            className="hidden"
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => {
              void load(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-border p-3 text-sm">
          <p>
            {filename}: {rows.length} receipts ·{' '}
            {fmtCurrencyFull(rows.reduce((n, r) => n + r.received_value, 0))}
          </p>
          {summary.native && (
            <p className="mt-2 text-text2">
              SellerCloud Inventory Arrivals detected. Using the final
              discounted unit price plus extra cost per unit.
            </p>
          )}
          <p className="mt-2 text-text2">
            {summary.reversals} negative-quantity corrections preserved.
          </p>
          {summary.zeroCost > 0 && (
            <p className="mt-2 text-warning">
              {summary.zeroCost} receipts have zero unit cost. They will be kept
              at zero; review these costs before relying on the balance.
            </p>
          )}
          {summary.excludedToday > 0 && (
            <p className="mt-2 text-text2">
              {summary.excludedToday} receipts dated today excluded. Import them
              with a later export after the day is complete.
            </p>
          )}
          <p className="mt-1 text-text2">
            Import replaces historical receipts in this date range. Observed
            sync movements in covered days will be excluded to avoid counting
            them twice.
          </p>
          <label className="mt-3 flex gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this is the complete export for the selected range,
            including reversals and days with no receipts.
          </label>
          <button
            className="btn-primary mt-3 text-xs"
            disabled={!confirmed || busy}
            onClick={() => void save()}
          >
            {busy ? 'Importing…' : 'Import receipts'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 text-sm text-success">
          {success}
        </p>
      )}
    </details>
  )
}
