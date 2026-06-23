import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertTriangle, Check, Edit3, GripVertical, Plus, Save, Target, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { fmtCurrency, fmtNumber } from '@/lib/utils'
import { useDeleteNorthStarRow, useMonthlyStar, useMonthlyStarSales, useNorthStarRows, useUpdateMonthlyStar, useUpdateNorthStarRow } from '@/hooks/useNorthStar'
import type { NorthStarStatus } from '@/types'
import {
  STATUS_LABELS,
  buildNorthStarUpdatePayload,
  computeMonthlyStarMetrics,
  createNorthStarDraftRow,
  deriveMonthlyStarFromSalesRows,
  mergeNorthStarRows,
  monthlyStarToInput,
  periodMonth,
  periodWeek,
  type MonthlyStarInput,
  type NorthStarDisplayRow,
  type NorthStarEditableField,
} from './NorthStar.helpers'

interface MonthlyFormState {
  target_sales: string
  mtd_actual: string
  ly_mtd_actual: string
  days_elapsed: string
  days_remaining: string
  dragging_channel_notes: string
}

type MonthlyStarViewInput = MonthlyStarInput & { period_month: string }

const STATUS_VARIANT: Record<NorthStarStatus, 'ok' | 'warning' | 'danger'> = {
  on_plan: 'ok',
  at_risk: 'warning',
  off_plan: 'danger',
}

const STATUS_ROW_CLASS: Record<NorthStarStatus, string> = {
  on_plan: 'border-l-4 border-success bg-success/5 hover:bg-success/10',
  at_risk: 'border-l-4 border-warning bg-warning/10 hover:bg-warning/15',
  off_plan: 'border-l-4 border-danger bg-danger/10 hover:bg-danger/15',
}

const SHORT_FIELDS = new Set<NorthStarEditableField>(['pillar', 'owner', 'plan_value', 'actual_mtd', 'forecast'])

export default function NorthStar() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const currentMonth = useMemo(() => periodMonth(), [])
  const currentWeek = useMemo(() => periodWeek(), [])
  const { data: savedRows = [], isLoading: rowsLoading, error: rowsError } = useNorthStarRows()
  const { data: monthlyStar = null, isLoading: monthlyLoading, error: monthlyError } = useMonthlyStar(currentMonth)
  const { data: salesRows, isLoading: salesLoading, error: salesError } = useMonthlyStarSales(currentMonth)
  const updateRow = useUpdateNorthStarRow()
  const deleteRow = useDeleteNorthStarRow()
  const updateMonthly = useUpdateMonthlyStar()
  const [managePillars, setManagePillars] = useState(false)
  const [draftRows, setDraftRows] = useState<NorthStarDisplayRow[]>([])
  const [monthlyForm, setMonthlyForm] = useState<MonthlyFormState | null>(null)

  const savedDisplayRows = useMemo(
    () => mergeNorthStarRows(savedRows, currentMonth, currentWeek),
    [savedRows, currentMonth, currentWeek]
  )
  const rows = useMemo(
    () => [...savedDisplayRows, ...draftRows].sort((a, b) => a.slot_index - b.slot_index),
    [savedDisplayRows, draftRows]
  )
  const manualMonthlyInput = useMemo(() => monthlyStarToInput(monthlyStar, currentMonth), [monthlyStar, currentMonth])
  const monthlyInput = useMemo(() => {
    if (!salesRows?.current.length) return manualMonthlyInput
    return deriveMonthlyStarFromSalesRows({
      periodMonth: currentMonth,
      targetSales: manualMonthlyInput.target_sales,
      rows: salesRows.current,
      previousYearRows: salesRows.previousYear,
      daysElapsed: manualMonthlyInput.days_elapsed,
      daysRemaining: manualMonthlyInput.days_remaining,
    })
  }, [salesRows, manualMonthlyInput, currentMonth])
  const monthlyDraft = monthlyForm ? monthlyFormToInput(monthlyForm, monthlyInput.period_month) : monthlyInput
  const monthlyMetrics = useMemo(() => computeMonthlyStarMetrics(monthlyDraft), [monthlyDraft])

  useEffect(() => {
    setMonthlyForm({
      target_sales: String(monthlyInput.target_sales),
      mtd_actual: String(monthlyInput.mtd_actual),
      ly_mtd_actual: String(monthlyInput.ly_mtd_actual),
      days_elapsed: String(monthlyInput.days_elapsed),
      days_remaining: String(monthlyInput.days_remaining),
      dragging_channel_notes: monthlyInput.dragging_channel_notes ?? formatChannelDeltas(monthlyInput.channel_deltas),
    })
  }, [monthlyInput])

  if (rowsLoading || monthlyLoading || salesLoading) return <PageLoader />

  const error = rowsError ?? monthlyError ?? salesError
  if (error) {
    return (
      <div className="card text-center py-16">
        <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
        <div className="text-text1 font-semibold">Failed to load North Star</div>
        <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  async function handleCellSave(row: NorthStarDisplayRow, field: NorthStarEditableField, value: string | NorthStarStatus) {
    await updateRow.mutateAsync(buildNorthStarUpdatePayload(row, field, value))
    if (!row.id) {
      setDraftRows(current => current.filter(draft => draft.slot_index !== row.slot_index))
    }
  }

  function addPillar() {
    setManagePillars(true)
    setDraftRows(current => [...current, createNorthStarDraftRow(rows, currentMonth, currentWeek)])
  }

  async function removePillar(row: NorthStarDisplayRow) {
    if (!row.id) {
      setDraftRows(current => current.filter(draft => draft.slot_index !== row.slot_index))
      return
    }
    const confirmed = window.confirm(`Remove ${row.pillar}? This deletes the pillar row and stores the change in history.`)
    if (!confirmed) return
    const saved = savedRows.find(savedRow => savedRow.id === row.id)
    if (!saved) return
    await deleteRow.mutateAsync(saved)
  }

  async function saveMonthly() {
    if (!monthlyForm) return
    await updateMonthly.mutateAsync({
      id: monthlyStar?.id ?? null,
      period_month: monthlyDraft.period_month,
      target_sales: parseMoney(monthlyForm.target_sales),
      mtd_actual: parseMoney(monthlyForm.mtd_actual),
      ly_mtd_actual: parseMoney(monthlyForm.ly_mtd_actual),
      days_elapsed: parseInteger(monthlyForm.days_elapsed),
      days_remaining: parseInteger(monthlyForm.days_remaining),
      dragging_channel_notes: monthlyForm.dragging_channel_notes.trim() || null,
      channel_deltas: parseChannelDeltas(monthlyForm.dragging_channel_notes),
    })
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text1">North Star</h1>
          <p className="text-text2 text-sm mt-0.5">Business plan review for the week of {currentWeek}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="ok">On plan</Badge>
          <Badge variant="warning">At risk</Badge>
          <Badge variant="danger">Off plan</Badge>
        </div>
      </div>

      <MonthlyStarPanel
        input={monthlyDraft}
        metrics={monthlyMetrics}
        isAdmin={isAdmin}
        monthlyForm={monthlyForm}
        setMonthlyForm={setMonthlyForm}
        onSave={saveMonthly}
        isSaving={updateMonthly.isPending}
      />

      <div className="card mt-6 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-text1">Business plan review pillars</div>
            <div className="text-xs text-text2 mt-1">
              Admins can update text inline. Structure changes stay behind Manage pillars.
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={managePillars ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                onClick={() => setManagePillars(value => !value)}
              >
                <GripVertical size={14} />
                Manage pillars
              </button>
              {managePillars && (
                <button type="button" className="btn-secondary text-xs" onClick={addPillar}>
                  <Plus size={14} />
                  Add pillar
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-sm">
            <thead className="bg-surface2/70 text-xs uppercase tracking-wider text-text2">
              <tr>
                {managePillars && isAdmin && <th className="w-12 px-3 py-3 text-left font-semibold">Slot</th>}
                <th className="px-3 py-3 text-left font-semibold">Pillar</th>
                <th className="px-3 py-3 text-left font-semibold">Owner</th>
                <th className="px-3 py-3 text-left font-semibold">Metric</th>
                <th className="px-3 py-3 text-left font-semibold">Plan</th>
                <th className="px-3 py-3 text-left font-semibold">Actual</th>
                <th className="px-3 py-3 text-left font-semibold">Forecast</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Constraint now</th>
                <th className="px-3 py-3 text-left font-semibold">This week's move</th>
                <th className="px-3 py-3 text-left font-semibold">Last week</th>
                {managePillars && isAdmin && <th className="w-16 px-3 py-3 text-right font-semibold">Remove</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={`${row.slot_index}-${row.id ?? 'draft'}`} className={`group transition-colors ${STATUS_ROW_CLASS[row.status]}`}>
                  {managePillars && isAdmin && (
                    <td className="px-3 py-3 align-top text-xs font-semibold text-text2">#{row.slot_index}</td>
                  )}
                  <td className="w-[150px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="pillar" value={row.pillar} isAdmin={isAdmin} onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[120px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="owner" value={row.owner ?? ''} isAdmin={isAdmin} placeholder="Unassigned" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[220px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="north_star" value={row.north_star} isAdmin={isAdmin} multiline placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[130px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="plan_value" value={row.plan_value ?? ''} isAdmin={isAdmin} placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[130px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="actual_mtd" value={row.actual_mtd ?? ''} isAdmin={isAdmin} placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[130px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="forecast" value={row.forecast ?? ''} isAdmin={isAdmin} placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[130px] px-3 py-3 align-top">
                    {isAdmin ? (
                      <select
                        className="select w-full py-1.5 text-xs"
                        value={row.status}
                        onChange={e => handleCellSave(row, 'status', e.target.value as NorthStarStatus)}
                        disabled={updateRow.isPending}
                        aria-label={`Status for ${row.pillar}`}
                      >
                        <option value="on_plan">On plan</option>
                        <option value="at_risk">At risk</option>
                        <option value="off_plan">Off plan</option>
                      </select>
                    ) : (
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                    )}
                  </td>
                  <td className="w-[210px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="constraint_now" value={row.constraint_now ?? ''} isAdmin={isAdmin} multiline placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[210px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="weekly_move" value={row.weekly_move ?? ''} isAdmin={isAdmin} multiline placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  <td className="w-[210px] px-3 py-3 align-top">
                    <InlineEditableCell row={row} field="last_week_result" value={row.last_week_result ?? ''} isAdmin={isAdmin} multiline placeholder="Not set" onSave={handleCellSave} isSaving={updateRow.isPending} />
                  </td>
                  {managePillars && isAdmin && (
                    <td className="px-3 py-3 align-top text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-danger transition hover:bg-danger/10 disabled:opacity-50"
                        onClick={() => removePillar(row)}
                        disabled={deleteRow.isPending}
                        title={`Remove ${row.pillar}`}
                        aria-label={`Remove ${row.pillar}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function MonthlyStarPanel({
  input,
  metrics,
  isAdmin,
  monthlyForm,
  setMonthlyForm,
  onSave,
  isSaving,
}: {
  input: MonthlyStarViewInput
  metrics: ReturnType<typeof computeMonthlyStarMetrics>
  isAdmin: boolean
  monthlyForm: MonthlyFormState | null
  setMonthlyForm: (value: MonthlyFormState) => void
  onSave: () => void
  isSaving: boolean
}) {
  const statusTone = metrics.onTrack ? 'success' : 'warning'
  return (
    <div className="card p-0">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-text1">Sales Star</div>
          <div className="text-xs text-text2 mt-1">Monthly goal progress for {input.period_month.slice(0, 7)}</div>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${metrics.onTrack ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {metrics.onTrack ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {metrics.onTrack ? 'On track' : 'Needs lift'}
        </div>
      </div>

      <div className="grid gap-0 border-b border-border md:grid-cols-3 xl:grid-cols-6">
        <MonthlyStarMetric label="Monthly target" value={fmtCurrency(input.target_sales)} sub={`${fmtNumber(input.days_remaining)} days left`} />
        <MonthlyStarMetric label="MTD actual" value={fmtCurrency(input.mtd_actual)} sub={`${fmtCurrency(metrics.dailyPace)} / day`} tone="info" />
        <MonthlyStarMetric label="Projected" value={fmtCurrency(metrics.projectedMonthEnd)} sub="Month-end pace" tone={statusTone} />
        <MonthlyStarMetric label="Gap to target" value={fmtCurrency(metrics.remainingToTarget)} sub="Remaining sales" tone={metrics.remainingToTarget > 0 ? 'warning' : 'success'} />
        <MonthlyStarMetric label="Daily needed" value={fmtCurrency(metrics.dailyNeeded)} sub={metrics.liftNeededPct === null ? 'No pace yet' : `${metrics.liftNeededPct.toFixed(1)}% lift`} />
        <MonthlyStarMetric label="YoY MTD" value={fmtCurrency(metrics.yoyDelta)} sub={metrics.yoyPct === null ? 'No LY baseline' : `${metrics.yoyPct.toFixed(1)}% vs LY`} tone={metrics.yoyDelta >= 0 ? 'success' : 'danger'} />
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-text2">Inputs</div>
            {isAdmin && (
              <button type="button" className="btn-primary text-xs" onClick={onSave} disabled={isSaving}>
                <Save size={14} />
                {isSaving ? 'Saving...' : 'Save Sales Star'}
              </button>
            )}
          </div>
          {isAdmin && monthlyForm ? (
            <div className="grid gap-3 md:grid-cols-3">
              <MoneyInput label="Sales target" value={monthlyForm.target_sales} onChange={target_sales => setMonthlyForm({ ...monthlyForm, target_sales })} />
              <MoneyInput label="MTD actual" value={monthlyForm.mtd_actual} onChange={mtd_actual => setMonthlyForm({ ...monthlyForm, mtd_actual })} />
              <MoneyInput label="LY MTD actual" value={monthlyForm.ly_mtd_actual} onChange={ly_mtd_actual => setMonthlyForm({ ...monthlyForm, ly_mtd_actual })} />
              <NumberInput label="Days elapsed" value={monthlyForm.days_elapsed} onChange={days_elapsed => setMonthlyForm({ ...monthlyForm, days_elapsed })} />
              <NumberInput label="Days remaining" value={monthlyForm.days_remaining} onChange={days_remaining => setMonthlyForm({ ...monthlyForm, days_remaining })} />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <ReadOnlyField label="Sales target" value={fmtCurrency(input.target_sales)} />
              <ReadOnlyField label="MTD actual" value={fmtCurrency(input.mtd_actual)} />
              <ReadOnlyField label="LY MTD actual" value={fmtCurrency(input.ly_mtd_actual)} />
              <ReadOnlyField label="Days elapsed" value={fmtNumber(input.days_elapsed)} />
              <ReadOnlyField label="Days remaining" value={fmtNumber(input.days_remaining)} />
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text2">Dragging channels</div>
          {isAdmin && monthlyForm && (
            <textarea
              className="input min-h-[104px] w-full"
              value={monthlyForm.dragging_channel_notes}
              onChange={e => setMonthlyForm({ ...monthlyForm, dragging_channel_notes: e.target.value })}
              placeholder={'FBA: -279000\nDropshipCentral: -49000\nWFS: -5000'}
            />
          )}
          {!isAdmin && input.dragging_channel_notes && (
            <div className="rounded-lg bg-surface2 p-3 text-sm text-text1 whitespace-pre-wrap">{input.dragging_channel_notes}</div>
          )}
          <div className="mt-3 space-y-2">
            {metrics.draggingChannels.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-text2">No negative channel deltas recorded.</div>
            ) : (
              metrics.draggingChannels.map(channel => (
                <div key={channel.channel} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2">
                  <span className="text-sm text-text1">{channel.channel}</span>
                  <span className="text-sm font-semibold text-danger tabular-nums">{fmtCurrency(channel.delta)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthlyStarMetric({ label, value, sub, tone = 'default' }: { label: string; value: string; sub: string; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const toneClass = {
    default: 'text-text1',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-accent',
  }[tone]
  return (
    <div className="border-b border-border px-4 py-3 md:border-r xl:border-b-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text2">{sub}</div>
    </div>
  )
}

function InlineEditableCell({
  row,
  field,
  value,
  isAdmin,
  multiline = false,
  placeholder = 'Not set',
  onSave,
  isSaving,
}: {
  row: NorthStarDisplayRow
  field: NorthStarEditableField
  value: string
  isAdmin: boolean
  multiline?: boolean
  placeholder?: string
  onSave: (row: NorthStarDisplayRow, field: NorthStarEditableField, value: string) => Promise<void>
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(!row.id && field === 'pillar')
  const [draft, setDraft] = useState(value)
  const isShort = SHORT_FIELDS.has(field)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!isAdmin) {
    return <ReadOnlyCell value={value} placeholder={placeholder} strong={field === 'pillar'} />
  }

  async function save() {
    await onSave(row, field, draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    if (!multiline && event.key === 'Enter') {
      event.preventDefault()
      save()
      return
    }
    if (multiline && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      save()
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        {multiline ? (
          <textarea
            className="input min-h-[72px] w-full resize-y py-1.5 text-xs leading-relaxed"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
          />
        ) : (
          <input
            className="input w-full py-1.5 text-xs"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-text2">{multiline ? 'Ctrl+Enter saves' : 'Enter saves'}</span>
          <div className="flex gap-1">
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-success hover:bg-success/10 disabled:opacity-50" onClick={save} disabled={isSaving} title="Save">
              <Check size={14} />
            </button>
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text2 hover:bg-surface2" onClick={cancel} title="Cancel">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="group/cell flex min-h-[32px] w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface2"
      onClick={() => setEditing(true)}
      title="Edit inline"
    >
      <ReadOnlyCell value={value} placeholder={placeholder} strong={field === 'pillar'} compact={isShort} />
      <Edit3 size={13} className="mt-0.5 shrink-0 text-text2 opacity-0 transition group-hover/cell:opacity-100" />
    </button>
  )
}

function ReadOnlyCell({ value, placeholder, strong = false, compact = false }: { value: string; placeholder: string; strong?: boolean; compact?: boolean }) {
  const className = strong
    ? 'font-semibold text-text1'
    : compact
      ? 'text-text2'
      : 'text-text1'
  if (!value.trim()) return <span className="text-text2/70">{placeholder}</span>
  return <span className={`block whitespace-pre-wrap break-words text-xs leading-relaxed ${className}`}>{value}</span>
}

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</span>
      <input className="input mt-1 w-full py-1.5" inputMode="decimal" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</span>
      <input className="input mt-1 w-full py-1.5" inputMode="numeric" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface2 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className="mt-1 text-sm font-semibold text-text1 tabular-nums">{value}</div>
    </div>
  )
}

function parseMoney(value: string): number {
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value.replace(/[,\s]/g, ''), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function formatChannelDeltas(channels: Array<{ channel: string; delta: number }>): string {
  return channels.map(channel => `${channel.channel}: ${channel.delta}`).join('\n')
}

function monthlyFormToInput(form: MonthlyFormState, periodMonthValue: string): MonthlyStarViewInput {
  return {
    period_month: periodMonthValue,
    target_sales: parseMoney(form.target_sales),
    mtd_actual: parseMoney(form.mtd_actual),
    ly_mtd_actual: parseMoney(form.ly_mtd_actual),
    days_elapsed: parseInteger(form.days_elapsed),
    days_remaining: parseInteger(form.days_remaining),
    dragging_channel_notes: form.dragging_channel_notes.trim() || null,
    channel_deltas: parseChannelDeltas(form.dragging_channel_notes),
  }
}

function parseChannelDeltas(value: string): Array<{ channel: string; delta: number }> {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [channel, rawDelta] = line.includes(':') ? line.split(/:(.*)/s) : line.split(/,(.*)/s)
      return {
        channel: (channel ?? '').trim(),
        delta: parseMoney(rawDelta ?? '0'),
      }
    })
    .filter(channel => channel.channel)
}
