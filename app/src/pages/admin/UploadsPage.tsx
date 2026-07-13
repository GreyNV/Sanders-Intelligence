import { useRef, useState } from 'react'
import { useUploads, useUploadCSV } from '@/hooks/useUploads'
import { fetchInventoryForUpload } from '@/hooks/useInventory'
import { useLeadershipSnapshot, useReplaceLeadershipSnapshot } from '@/hooks/useLeadershipSnapshot'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fmtDate, fmtNumber } from '@/lib/utils'
import { parseLeadershipToolFile } from '@/lib/leadershipToolParser'
import { Upload, CheckCircle, XCircle, Clock, AlertTriangle, Download, FileSpreadsheet } from 'lucide-react'
import { InventoryRecord } from '@/types'

function recordsToCsv(records: InventoryRecord[]): string {
  if (records.length === 0) return ''
  const headers = Object.keys(records[0]).filter(k => k !== 'id' && k !== 'upload_id')
  const rows = records.map(r =>
    headers.map(h => {
      const v = (r as unknown as Record<string, unknown>)[h]
      const s = v == null ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  )
  return [headers.join(','), ...rows].join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function UploadsPage() {
  const { data: uploads = [], isLoading, error } = useUploads()
  const { data: leadershipSnapshot = null } = useLeadershipSnapshot()
  const uploadCSV = useUploadCSV()
  const replaceLeadershipSnapshot = useReplaceLeadershipSnapshot()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const leadershipInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver]         = useState(false)
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [downloading, setDownloading]   = useState<string | null>(null) // upload id being downloaded
  const [leadershipError, setLeadershipError] = useState<string | null>(null)
  const [leadershipSuccess, setLeadershipSuccess] = useState(false)

  async function handleDownload(uploadId: string, filename: string, uploadedAt: string) {
    setDownloading(uploadId)
    try {
      const records = await fetchInventoryForUpload(uploadId)
      const csv     = recordsToCsv(records)
      const date    = uploadedAt.slice(0, 10)
      downloadCsv(csv, `inventory_${date}_${filename}`)
    } finally {
      setDownloading(null)
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please upload a .csv file')
      return
    }
    setUploadError(null)
    setUploadSuccess(false)
    try {
      await uploadCSV.mutateAsync(file)
      setUploadSuccess(true)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleLeadershipFile(file: File) {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
      setLeadershipError('Please upload a .xlsx or .xlsm leadership workbook')
      return
    }

    setLeadershipError(null)
    setLeadershipSuccess(false)

    try {
      const parsed = await parseLeadershipToolFile(file)
      await replaceLeadershipSnapshot.mutateAsync({ filename: file.name, parsed })
      setLeadershipSuccess(true)
    } catch (err) {
      setLeadershipError(err instanceof Error ? err.message : 'Leadership workbook upload failed')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function StatusIcon({ status }: { status: string }) {
    if (status === 'complete')   return <CheckCircle size={14} className="text-success" />
    if (status === 'failed')     return <XCircle size={14} className="text-danger" />
    if (status === 'processing') return <Clock size={14} className="text-warning animate-pulse" />
    return null
  }

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load uploads</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">File Uploads</h1>
        <p className="text-text2 text-sm mt-0.5">Upload the daily fullreport.csv to refresh all dashboards</p>
      </div>

      {/* Upload Drop Zone */}
      <div
        className={`card mb-6 border-2 border-dashed transition-colors text-center py-10 cursor-pointer
          ${dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {uploadCSV.isPending ? (
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-text2 text-sm">Processing file…</p>
          </div>
        ) : (
          <>
            <Upload size={28} className="text-text2 mx-auto mb-3" />
            <p className="text-text1 font-medium">Drop fullreport.csv here or click to browse</p>
            <p className="text-text2 text-sm mt-1">CSV only · file will replace dashboard data immediately</p>
          </>
        )}
      </div>

      {uploadSuccess && (
        <div className="flex items-center gap-2 mb-4 text-success text-sm bg-success/10 border border-success/20 rounded-xl px-4 py-3">
          <CheckCircle size={15} /> Upload complete — dashboards are now refreshed.
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 mb-4 text-danger text-sm bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
          <AlertTriangle size={15} /> {uploadError}
        </div>
      )}

      <div className="card mb-6 border border-border p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-text1">Leadership Tool</h2>
            <p className="mt-1 text-sm text-text2">Upload the weekly leadership workbook to replace the current finance snapshot.</p>
          </div>
          <FileSpreadsheet size={20} className="text-accent" />
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => leadershipInputRef.current?.click()}
          disabled={replaceLeadershipSnapshot.isPending}
        >
          {replaceLeadershipSnapshot.isPending ? <LoadingSpinner size="sm" /> : <Upload size={14} />}
          Upload Leadership Tool
        </button>

        <input
          ref={leadershipInputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) handleLeadershipFile(file)
            event.currentTarget.value = ''
          }}
        />

        {leadershipSnapshot && (
          <p className="mt-3 text-xs text-text2">
            Current snapshot: {leadershipSnapshot.filename} uploaded {fmtDate(leadershipSnapshot.uploaded_at)}
          </p>
        )}

        {leadershipSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            <CheckCircle size={15} /> Leadership snapshot refreshed.
          </div>
        )}

        {leadershipError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle size={15} /> {leadershipError}
          </div>
        )}
      </div>

      {/* Upload History */}
      <h2 className="text-[14px] font-semibold text-text1 mb-3">Upload History</h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>File</th>
              <th>Uploaded By</th>
              <th>Date</th>
              <th>Rows</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {uploads.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-text2">No uploads yet</td></tr>
            ) : (
              uploads.map(u => (
                <tr key={u.id}>
                  <td className="font-mono text-[11px] text-text2">{u.filename}</td>
                  <td className="text-sm">{u.uploader?.name ?? '—'}</td>
                  <td className="text-xs text-text2">{fmtDate(u.uploaded_at)}</td>
                  <td className="tabular-nums text-text2">{u.row_count != null ? fmtNumber(u.row_count) : '—'}</td>
                  <td>
                    <div className="flex items-center gap-1.5 text-xs capitalize">
                      <StatusIcon status={u.status} />
                      <span className={
                        u.status === 'complete' ? 'text-success' :
                        u.status === 'failed' ? 'text-danger' : 'text-warning'
                      }>
                        {u.status}
                      </span>
                    </div>
                  </td>
                  <td className="text-xs text-text2 max-w-[200px] truncate">{u.notes ?? '—'}</td>
                  <td>
                    {u.status === 'complete' && (
                      <button
                        onClick={() => handleDownload(u.id, u.filename, u.uploaded_at)}
                        disabled={downloading === u.id}
                        className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
                        title="Download inventory data as CSV"
                      >
                        {downloading === u.id
                          ? <LoadingSpinner size="sm" />
                          : <><Download size={12} /> CSV</>
                        }
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
