import { useRef, useState } from 'react'
import { CheckCircle, FileSpreadsheet, RefreshCw, Upload, AlertTriangle } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { parseSalesReportFile, type ParsedSalesReport } from '@/lib/salesReportParser'
import {
  syncSalesReport,
  type SalesReportSyncProgress,
  type SalesReportSyncResult,
} from '@/lib/salesReportSync'
import { fmtCurrency, fmtNumber } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

export default function SalesReportUpload() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<ParsedSalesReport | null>(null)
  const [progress, setProgress] = useState<SalesReportSyncProgress | null>(null)
  const [result, setResult] = useState<SalesReportSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  if (profile?.role !== 'admin') return null

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please upload the SellerCloud .xlsx export.')
      return
    }

    setParsing(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      setReport(await parseSalesReportFile(file))
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : 'Could not read the SellerCloud report.')
    } finally {
      setParsing(false)
    }
  }

  async function handleSync() {
    if (!report) return
    setSyncing(true)
    setError(null)
    setResult(null)
    try {
      setResult(await syncSalesReport(report, setProgress))
      await queryClient.invalidateQueries({ queryKey: ['sales_daily'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sales sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const completedDates = progress ? progress.dateIndex : 0
  const progressPct = progress
    ? progress.phase === 'finalizing'
      ? 100
      : Math.max(3, Math.round((completedDates / progress.dateCount) * 100))
    : 0

  return (
    <section className="mb-6 border-y border-border py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-text1">SellerCloud sales</h2>
          <p className="mt-1 max-w-2xl text-sm text-text2">
            Upload Sales by Date Range. The file validates the range and totals; sales are rebuilt from SellerCloud to preserve SKU detail.
          </p>
        </div>
        <FileSpreadsheet size={20} className="text-accent" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => inputRef.current?.click()}
          disabled={parsing || syncing}
        >
          {parsing ? <LoadingSpinner size="sm" /> : <Upload size={14} />}
          Choose sales report
        </button>
        {report && (
          <button type="button" className="btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? <LoadingSpinner size="sm" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing sales…' : `Sync ${report.dateFrom} to ${report.dateTo}`}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
          event.currentTarget.value = ''
        }}
      />

      {report && (
        <div className="mt-4 grid gap-x-8 gap-y-2 border-l-2 border-accent pl-4 text-sm sm:grid-cols-3">
          <div><span className="text-text2">File and range</span><div className="font-medium text-text1">{report.filename}</div><div className="text-xs text-text2">{report.dateFrom} – {report.dateTo}</div></div>
          <div><span className="text-text2">Orders</span><div className="font-medium tabular-nums text-text1">{fmtNumber(report.rowCount)}</div></div>
          <div><span className="text-text2">Report total</span><div className="font-medium tabular-nums text-text1">{fmtCurrency(report.totalRevenue)}</div></div>
        </div>
      )}

      {syncing && progress && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-text2">
            <span>{progress.phase === 'finalizing' ? 'Finalizing automatic sync' : `Syncing ${progress.date} · page ${progress.startPage}`}</span>
            <span>{Math.min(progress.dateIndex + 1, progress.dateCount)} / {progress.dateCount} dates</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-text2">Keep this page open until reconciliation finishes.</p>
        </div>
      )}

      {result && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle size={15} /> Sales synced through {report?.dateTo}.
          </div>
          <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div><span className="text-text2">SellerCloud API</span><div className="font-medium tabular-nums text-text1">{fmtCurrency(result.syncedRevenue)}</div></div>
            <div><span className="text-text2">Export</span><div className="font-medium tabular-nums text-text1">{fmtCurrency(result.reportRevenue)}</div></div>
            <div><span className="text-text2">Variance</span><div className="font-medium tabular-nums text-text1">{fmtCurrency(result.variance)}</div></div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}
