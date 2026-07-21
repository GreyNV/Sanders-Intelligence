import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, MapPinned, RotateCcw, Save, TrendingDown, TrendingUp } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { useSalesByChannel, useUpdateSalesChannelGoal } from '@/hooks/useSalesChannels'
import { cn, fmtCurrency, fmtNumber } from '@/lib/utils'
import { addMonthsToPeriod, formatPeriodMonth, periodMonth } from './NorthStar.helpers'
import { ADD_MAPPING_CHANNEL, type SalesByChannelRow } from './SalesByChannel.helpers'

const STATUS_COPY: Record<SalesByChannelRow['status'], string> = {
  on_track: 'On track',
  needs_lift: 'Needs lift',
  no_goal: 'No goal',
  add_mapping: 'Add mapping',
}

const STATUS_VARIANT: Record<SalesByChannelRow['status'], 'ok' | 'danger' | 'neutral' | 'warning'> = {
  on_track: 'ok',
  needs_lift: 'danger',
  no_goal: 'neutral',
  add_mapping: 'warning',
}

export default function SalesByChannel() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const currentMonth = useMemo(() => periodMonth(), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const { data, isLoading, error } = useSalesByChannel(selectedMonth)
  const updateGoal = useUpdateSalesChannelGoal()

  if (isLoading) return <PageLoader />

  if (error) {
    return (
      <div className="card py-16 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-danger" />
        <div className="font-semibold text-text1">Failed to load sales by channel</div>
        <div className="mt-1 text-sm text-text2">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  const rows = data?.rows ?? []
  const mappedRows = rows.filter(row => !row.requires_mapping)
  const addMappingRow = rows.find(row => row.channel === ADD_MAPPING_CHANNEL)
  const totalMtd = sumRows(rows, 'mtd_revenue')
  const totalLyMtd = sumRows(rows, 'ly_mtd_revenue')
  const activeGoalTotal = mappedRows.reduce((sum, row) => sum + Number(row.goal_amount ?? 0), 0)
  const remainingToGoal = mappedRows.reduce((sum, row) => sum + Number(row.remaining_to_goal ?? 0), 0)
  const onTrackCount = mappedRows.filter(row => row.status === 'on_track').length
  const needsLiftCount = mappedRows.filter(row => row.status === 'needs_lift').length

  async function handleGoalSave(channel: string, goalAmount: number) {
    await updateGoal.mutateAsync({
      period_month: selectedMonth,
      qb_channel: channel,
      goal_amount: goalAmount,
    })
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text1">Sales by Channel</h1>
          <p className="mt-0.5 text-sm text-text2">
            MTD SellerCloud sales grouped through QB channel mapping.
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
          {isAdmin && (
            <Link to="/admin/sales-channel-mappings" className="btn-secondary text-xs">
              <MapPinned size={14} />
              Channel mappings
            </Link>
          )}
        </div>
      </div>

      <div className="grid border border-border bg-surface md:grid-cols-2 xl:grid-cols-5">
        <MetricCell label="MTD sales" value={fmtCurrency(totalMtd)} sub={`${signedCurrency(totalMtd - totalLyMtd)} vs LY`} tone={totalMtd >= totalLyMtd ? 'success' : 'danger'} />
        <MetricCell label="Goal" value={fmtCurrency(activeGoalTotal)} sub={`${fmtCurrency(remainingToGoal)} remaining`} />
        <MetricCell label="Mapped channels" value={fmtNumber(mappedRows.length)} sub={`${fmtNumber(onTrackCount)} on track`} tone="info" />
        <MetricCell label="Needs lift" value={fmtNumber(needsLiftCount)} sub="Channels behind pace" tone={needsLiftCount > 0 ? 'danger' : 'success'} />
        <MetricCell label="Unmapped sales" value={fmtCurrency(addMappingRow?.mtd_revenue ?? 0)} sub={`${fmtNumber(data?.unmappedSourcePairs.length ?? 0)} source pairs`} tone={(addMappingRow?.mtd_revenue ?? 0) > 0 ? 'warning' : 'success'} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-text1">Channel pace</div>
              <div className="mt-1 text-xs text-text2">Goal inputs drive daily lift and status.</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="ok">On track</Badge>
              <Badge variant="danger">Needs lift</Badge>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead className="bg-surface2 text-xs uppercase tracking-wider text-text2">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Channel</th>
                  <th className="px-4 py-3 text-right font-semibold">MTD</th>
                  <th className="px-4 py-3 text-right font-semibold">LY MTD</th>
                  <th className="px-4 py-3 text-right font-semibold">YoY</th>
                  <th className="px-4 py-3 text-right font-semibold">Goal</th>
                  <th className="px-4 py-3 text-right font-semibold">Projected</th>
                  <th className="px-4 py-3 text-right font-semibold">Daily lift</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-text2">
                      No SellerCloud sales rows found for {formatPeriodMonth(selectedMonth)}.
                    </td>
                  </tr>
                ) : (
                  rows.map(row => (
                    <ChannelRow
                      key={row.channel}
                      row={row}
                      isAdmin={isAdmin}
                      isSaving={updateGoal.isPending}
                      onGoalSave={handleGoalSave}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card p-0">
          <div className="border-b border-border px-5 py-4">
            <div className="text-sm font-semibold text-text1">Mapping queue</div>
            <div className="mt-1 text-xs text-text2">Source pairs without an active QB mapping.</div>
          </div>
          <div className="max-h-[560px] overflow-auto">
            {(data?.unmappedSourcePairs.length ?? 0) === 0 ? (
              <div className="px-5 py-8 text-sm text-text2">All current source pairs are mapped.</div>
            ) : (
              <div className="divide-y divide-border">
                {data?.unmappedSourcePairs.map(pair => (
                  <div key={`${pair.normalized_company}|${pair.normalized_channel}`} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold text-text1">{pair.sellercloud_company}</div>
                        <div className="mt-0.5 break-words text-xs text-text2">{pair.sellercloud_channel}</div>
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums text-warning">
                        {fmtCurrency(pair.mtd_revenue)}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-text2">
                      <span>{fmtNumber(pair.row_count)} rows</span>
                      <span>{fmtNumber(pair.orders_count)} orders</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="border-t border-border p-4">
              <Link to="/admin/sales-channel-mappings" className="btn-primary w-full justify-center text-xs">
                <MapPinned size={14} />
                Add mapping
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function ChannelRow({
  row,
  isAdmin,
  isSaving,
  onGoalSave,
}: {
  row: SalesByChannelRow
  isAdmin: boolean
  isSaving: boolean
  onGoalSave: (channel: string, goalAmount: number) => Promise<void>
}) {
  const [goalDraft, setGoalDraft] = useState(row.goal_amount == null ? '' : String(row.goal_amount))
  const canEditGoal = isAdmin && !row.requires_mapping
  const rowTone = row.status === 'on_track'
    ? 'border-l-4 border-success bg-success/5'
    : row.status === 'needs_lift'
      ? 'border-l-4 border-danger bg-danger/5'
      : row.status === 'add_mapping'
        ? 'border-l-4 border-warning bg-warning/10'
        : 'border-l-4 border-border'

  useEffect(() => {
    setGoalDraft(row.goal_amount == null ? '' : String(row.goal_amount))
  }, [row.goal_amount])

  async function saveGoal() {
    if (!canEditGoal) return
    await onGoalSave(row.channel, parseMoney(goalDraft))
  }

  return (
    <tr className={cn('transition-colors hover:bg-surface2/60', rowTone)}>
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <div>
            <div className="font-semibold text-text1">{row.channel}</div>
            {row.requires_mapping && (
              <div className="mt-0.5 text-xs text-warning">Unmapped SellerCloud source pairs</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-text1">{fmtCurrency(row.mtd_revenue)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-text2">{fmtCurrency(row.ly_mtd_revenue)}</td>
      <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', row.yoy_delta >= 0 ? 'text-success' : 'text-danger')}>
        {signedCurrency(row.yoy_delta)}
      </td>
      <td className="px-4 py-3 text-right">
        {canEditGoal ? (
          <div className="ml-auto flex w-[170px] items-center gap-1.5">
            <input
              className="input h-8 w-full py-1 text-right text-xs tabular-nums"
              inputMode="decimal"
              value={goalDraft}
              onChange={event => setGoalDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') saveGoal()
              }}
              aria-label={`Goal for ${row.channel}`}
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-success transition hover:bg-success/10 disabled:opacity-50"
              onClick={saveGoal}
              disabled={isSaving}
              title={`Save goal for ${row.channel}`}
              aria-label={`Save goal for ${row.channel}`}
            >
              <Save size={14} />
            </button>
          </div>
        ) : row.goal_amount == null ? (
          <span className="text-text2">Not set</span>
        ) : (
          <span className="font-semibold tabular-nums text-text1">{fmtCurrency(row.goal_amount)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text2">{fmtCurrency(row.projected_month_end)}</td>
      <td className="px-4 py-3 text-right">
        {row.daily_lift == null ? (
          <span className="text-text2">No goal</span>
        ) : (
          <div className={cn('font-semibold tabular-nums', row.daily_lift > 0 ? 'text-danger' : 'text-success')}>
            {fmtCurrency(row.daily_lift)}
            <div className="mt-0.5 text-[11px] font-normal text-text2">{fmtCurrency(row.daily_needed ?? 0)} needed/day</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex items-center gap-2">
          {row.status === 'on_track' ? <TrendingUp size={14} className="text-success" /> : <TrendingDown size={14} className={row.status === 'needs_lift' ? 'text-danger' : 'text-text2'} />}
          <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_COPY[row.status]}</Badge>
        </div>
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
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'info'
}) {
  const toneClass = {
    default: 'text-text1',
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    info: 'text-accent',
  }[tone]
  return (
    <div className="border-b border-border px-4 py-3 md:border-r xl:border-b-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className={cn('mt-1 text-lg font-bold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text2">{sub}</div>
    </div>
  )
}

function sumRows(rows: SalesByChannelRow[], key: 'mtd_revenue' | 'ly_mtd_revenue'): number {
  return Number(rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0).toFixed(2))
}

function signedCurrency(value: number): string {
  const formatted = fmtCurrency(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function parseMoney(value: string): number {
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}
