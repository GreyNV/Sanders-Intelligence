import { FormEvent, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RotateCcw, Save } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useSalesByChannel, useSalesChannelMappings, useUpsertSalesChannelMapping } from '@/hooks/useSalesChannels'
import { cn, fmtCurrency, fmtNumber } from '@/lib/utils'
import type { SalesChannelMapping } from '@/types'
import { addMonthsToPeriod, formatPeriodMonth, periodMonth } from '@/pages/csuite/NorthStar.helpers'
import type { UnmappedSalesChannelPair } from '@/pages/csuite/SalesByChannel.helpers'

interface ManualMappingForm {
  sellercloud_company: string
  sellercloud_channel: string
  qb_channel: string
  notes: string
}

const EMPTY_FORM: ManualMappingForm = {
  sellercloud_company: '',
  sellercloud_channel: '',
  qb_channel: '',
  notes: '',
}

export default function SalesChannelMappingsPage() {
  const currentMonth = useMemo(() => periodMonth(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const { data: salesData, isLoading: salesLoading, error: salesError } = useSalesByChannel(selectedMonth)
  const { data: mappings = [], isLoading: mappingsLoading, error: mappingsError } = useSalesChannelMappings()
  const upsertMapping = useUpsertSalesChannelMapping()
  const [manualForm, setManualForm] = useState<ManualMappingForm>(EMPTY_FORM)
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  if (salesLoading || mappingsLoading) return <PageLoader />

  const error = salesError ?? mappingsError
  if (error) {
    return (
      <div className="card py-16 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-danger" />
        <div className="font-semibold text-text1">Failed to load sales channel mappings</div>
        <div className="mt-1 text-sm text-text2">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  const unmappedSourcePairs = salesData?.unmappedSourcePairs ?? []
  const activeMappings = mappings.filter(mapping => mapping.is_active).length
  const inactiveMappings = mappings.length - activeMappings
  const unmappedMtd = unmappedSourcePairs.reduce((sum, pair) => sum + Number(pair.mtd_revenue ?? 0), 0)

  async function handleSaveUnmapped(pair: UnmappedSalesChannelPair) {
    const key = sourcePairKey(pair.sellercloud_company, pair.sellercloud_channel)
    const qbChannel = (mappingDrafts[key] ?? '').trim()
    if (!qbChannel) {
      setMessage('QB channel is required before saving a mapping.')
      return
    }

    await upsertMapping.mutateAsync({
      sellercloud_company: pair.sellercloud_company,
      sellercloud_channel: pair.sellercloud_channel,
      qb_channel: qbChannel,
      is_active: true,
      source_file: 'admin',
      notes: `Added from ${formatPeriodMonth(selectedMonth)} unmapped sales queue`,
    })
    setMappingDrafts(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setMessage(`Mapped ${pair.sellercloud_company} / ${pair.sellercloud_channel} to ${qbChannel}.`)
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await upsertMapping.mutateAsync({
      sellercloud_company: manualForm.sellercloud_company,
      sellercloud_channel: manualForm.sellercloud_channel,
      qb_channel: manualForm.qb_channel,
      is_active: true,
      source_file: 'admin',
      notes: manualForm.notes || null,
    })
    setMessage(`Saved ${manualForm.sellercloud_company} / ${manualForm.sellercloud_channel}.`)
    setManualForm(EMPTY_FORM)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text1">Channel Mappings</h1>
          <p className="mt-0.5 text-sm text-text2">
            Map SellerCloud Company + Channel source pairs to the QB channel used by Sales by Channel.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1"
              onClick={() => setSelectedMonth(month => addMonthsToPeriod(month, -1))}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[132px] border-x border-border px-3 text-center text-sm font-semibold text-text1">
              {formatPeriodMonth(selectedMonth)}
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setSelectedMonth(month => addMonthsToPeriod(month, 1))}
              disabled={selectedMonth >= currentMonth}
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {selectedMonth !== currentMonth && (
            <button type="button" className="btn-secondary text-xs" onClick={() => setSelectedMonth(currentMonth)}>
              <RotateCcw size={14} />
              Current month
            </button>
          )}
        </div>
      </div>

      <div className="grid border border-border bg-surface md:grid-cols-4">
        <MetricCell label="Unmapped MTD" value={fmtCurrency(unmappedMtd)} sub={`${fmtNumber(unmappedSourcePairs.length)} source pairs`} tone={unmappedSourcePairs.length > 0 ? 'warning' : 'success'} />
        <MetricCell label="Active mappings" value={fmtNumber(activeMappings)} sub="Usable in rollups" tone="info" />
        <MetricCell label="Inactive mappings" value={fmtNumber(inactiveMappings)} sub="Ignored by sales rollup" />
        <MetricCell label="Total mappings" value={fmtNumber(mappings.length)} sub="Workbook + admin rows" />
      </div>

      {(message || upsertMapping.error) && (
        <div className={cn('mt-4 rounded-lg px-4 py-3 text-sm', upsertMapping.error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
          {upsertMapping.error ? (upsertMapping.error as Error).message : message}
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-text1">Unmapped source pairs</div>
              <div className="mt-1 text-xs text-text2">Rows here appear as Add mapping on the executive sales page.</div>
            </div>
            <Badge variant={unmappedSourcePairs.length > 0 ? 'warning' : 'ok'}>
              {unmappedSourcePairs.length > 0 ? 'Add mapping' : 'Mapped'}
            </Badge>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-surface2 text-xs uppercase tracking-wider text-text2">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">SellerCloud Company</th>
                  <th className="px-4 py-3 text-left font-semibold">SellerCloud Channel</th>
                  <th className="px-4 py-3 text-right font-semibold">MTD</th>
                  <th className="px-4 py-3 text-right font-semibold">Rows</th>
                  <th className="px-4 py-3 text-left font-semibold">QB Channel</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {unmappedSourcePairs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-text2">
                      No unmapped source pairs for {formatPeriodMonth(selectedMonth)}.
                    </td>
                  </tr>
                ) : (
                  unmappedSourcePairs.map(pair => {
                    const key = sourcePairKey(pair.sellercloud_company, pair.sellercloud_channel)
                    return (
                      <tr key={key} className="border-l-4 border-warning bg-warning/5 transition hover:bg-warning/10">
                        <td className="px-4 py-3 align-middle font-semibold text-text1">{pair.sellercloud_company}</td>
                        <td className="px-4 py-3 align-middle text-text2">{pair.sellercloud_channel}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-warning">{fmtCurrency(pair.mtd_revenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-text2">{fmtNumber(pair.row_count)}</td>
                        <td className="px-4 py-3">
                          <input
                            className="input h-8 w-full py-1 text-xs"
                            value={mappingDrafts[key] ?? ''}
                            onChange={event => setMappingDrafts(current => ({ ...current, [key]: event.target.value }))}
                            onKeyDown={event => {
                              if (event.key === 'Enter') handleSaveUnmapped(pair)
                            }}
                            placeholder="QB channel"
                            aria-label={`QB channel for ${pair.sellercloud_company} ${pair.sellercloud_channel}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-success transition hover:bg-success/10 disabled:opacity-50"
                            onClick={() => handleSaveUnmapped(pair)}
                            disabled={upsertMapping.isPending}
                            title="Add mapping"
                            aria-label="Add mapping"
                          >
                            <Save size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form className="card p-5" onSubmit={handleManualSubmit}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text1">Manual mapping</div>
              <div className="mt-1 text-xs text-text2">Add or update a known source pair.</div>
            </div>
            <Plus size={16} className="text-accent" />
          </div>
          <div className="space-y-3">
            <TextInput
              label="SellerCloud Company"
              value={manualForm.sellercloud_company}
              onChange={sellercloud_company => setManualForm(form => ({ ...form, sellercloud_company }))}
              required
            />
            <TextInput
              label="SellerCloud Channel"
              value={manualForm.sellercloud_channel}
              onChange={sellercloud_channel => setManualForm(form => ({ ...form, sellercloud_channel }))}
              required
            />
            <TextInput
              label="QB Channel"
              value={manualForm.qb_channel}
              onChange={qb_channel => setManualForm(form => ({ ...form, qb_channel }))}
              required
            />
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">Notes</span>
              <textarea
                className="input mt-1 min-h-[86px] w-full resize-y py-2 text-sm"
                value={manualForm.notes}
                onChange={event => setManualForm(form => ({ ...form, notes: event.target.value }))}
                placeholder="Optional context"
              />
            </label>
            <button type="submit" className="btn-primary w-full justify-center text-xs" disabled={upsertMapping.isPending}>
              <Save size={14} />
              {upsertMapping.isPending ? 'Saving...' : 'Save mapping'}
            </button>
          </div>
        </form>
      </div>

      <div className="card mt-6 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold text-text1">Existing mappings</div>
          <div className="mt-1 text-xs text-text2">Active rows are used by the executive channel rollup.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wider text-text2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">SellerCloud Company</th>
                <th className="px-4 py-3 text-left font-semibold">SellerCloud Channel</th>
                <th className="px-4 py-3 text-left font-semibold">QB Channel</th>
                <th className="px-4 py-3 text-left font-semibold">Source</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mappings.map(mapping => (
                <MappingRow key={mapping.id} mapping={mapping} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MappingRow({ mapping }: { mapping: SalesChannelMapping }) {
  return (
    <tr className="transition hover:bg-surface2/60">
      <td className="px-4 py-3 font-semibold text-text1">{mapping.sellercloud_company}</td>
      <td className="px-4 py-3 text-text2">{mapping.sellercloud_channel}</td>
      <td className="px-4 py-3 font-semibold text-text1">{mapping.qb_channel}</td>
      <td className="px-4 py-3 text-text2">{mapping.source_file ?? 'admin'}</td>
      <td className="px-4 py-3">
        <Badge variant={mapping.is_active ? 'ok' : 'neutral'}>{mapping.is_active ? 'Active' : 'Inactive'}</Badge>
      </td>
    </tr>
  )
}

function MetricCell({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub: string
  tone?: 'default' | 'success' | 'warning' | 'info'
}) {
  const toneClass = {
    default: 'text-text1',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-accent',
  }[tone]
  return (
    <div className="border-b border-border px-4 py-3 md:border-r md:border-b-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className={cn('mt-1 text-lg font-bold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text2">{sub}</div>
    </div>
  )
}

function TextInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</span>
      <input
        className="input mt-1 w-full py-1.5 text-sm"
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
      />
    </label>
  )
}

function sourcePairKey(sellercloud_company: string, sellercloud_channel: string): string {
  return `${sellercloud_company.trim().toLowerCase()}|${sellercloud_channel.trim().toLowerCase()}`
}
