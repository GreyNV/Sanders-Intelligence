import { useEffect, useMemo, useState } from 'react'
import { Edit3, Lock, LockOpen, Target, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import KPICard from '@/components/ui/KPICard'
import Modal from '@/components/ui/Modal'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { fmtCurrency, fmtNumber } from '@/lib/utils'
import { useDeleteNorthStarRow, useMonthlyStar, useNorthStarRows, useUpdateMonthlyStar, useUpdateNorthStarRow } from '@/hooks/useNorthStar'
import type { NorthStarStatus } from '@/types'
import {
  STATUS_LABELS,
  computeMonthlyStarMetrics,
  mergeNorthStarRows,
  monthlyStarToInput,
  nextNorthStarSlot,
  periodMonth,
  periodWeek,
  type MonthlyStarInput,
  type NorthStarDisplayRow,
} from './NorthStar.helpers'

interface RowFormState {
  pillar: string
  owner: string
  north_star: string
  plan_value: string
  actual_mtd: string
  forecast: string
  constraint_now: string
  weekly_move: string
  last_week_result: string
  status: NorthStarStatus
}

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

export default function NorthStar() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const currentMonth = useMemo(() => periodMonth(), [])
  const currentWeek = useMemo(() => periodWeek(), [])
  const { data: savedRows = [], isLoading: rowsLoading, error: rowsError } = useNorthStarRows()
  const { data: monthlyStar = null, isLoading: monthlyLoading, error: monthlyError } = useMonthlyStar(currentMonth)
  const updateRow = useUpdateNorthStarRow()
  const deleteRow = useDeleteNorthStarRow()
  const updateMonthly = useUpdateMonthlyStar()
  const [editingRow, setEditingRow] = useState<NorthStarDisplayRow | null>(null)
  const [rowForm, setRowForm] = useState<RowFormState | null>(null)
  const [unlockedRows, setUnlockedRows] = useState<Set<number>>(() => new Set())
  const [monthlyForm, setMonthlyForm] = useState<MonthlyFormState | null>(null)

  const rows = useMemo(
    () => mergeNorthStarRows(savedRows, currentMonth, currentWeek),
    [savedRows, currentMonth, currentWeek]
  )
  const monthlyInput = useMemo(() => monthlyStarToInput(monthlyStar, currentMonth), [monthlyStar, currentMonth])
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

  if (rowsLoading || monthlyLoading) return <PageLoader />

  const error = rowsError ?? monthlyError
  if (error) {
    return (
      <div className="card text-center py-16">
        <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
        <div className="text-text1 font-semibold">Failed to load North Star</div>
        <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  function openRowEditor(row: NorthStarDisplayRow) {
    setEditingRow(row)
    setRowForm({
      pillar: row.pillar,
      owner: row.owner ?? '',
      north_star: row.north_star,
      plan_value: row.plan_value ?? '',
      actual_mtd: row.actual_mtd ?? '',
      forecast: row.forecast ?? '',
      constraint_now: row.constraint_now ?? '',
      weekly_move: row.weekly_move ?? '',
      last_week_result: row.last_week_result ?? '',
      status: row.status,
    })
  }

  function closeRowEditor() {
    setEditingRow(null)
    setRowForm(null)
  }

  async function saveRow() {
    if (!editingRow || !rowForm) return
    await updateRow.mutateAsync({
      id: editingRow.id,
      is_locked: true,
      period_month: editingRow.period_month,
      period_week: editingRow.period_week,
      slot_index: editingRow.slot_index,
      pillar: rowForm.pillar.trim(),
      owner: rowForm.owner.trim() || null,
      north_star: rowForm.north_star.trim(),
      plan_value: rowForm.plan_value.trim() || null,
      actual_mtd: rowForm.actual_mtd.trim() || null,
      forecast: rowForm.forecast.trim() || null,
      constraint_now: rowForm.constraint_now.trim() || null,
      weekly_move: rowForm.weekly_move.trim() || null,
      last_week_result: rowForm.last_week_result.trim() || null,
      status: rowForm.status,
    })
    setUnlockedRows(value => {
      const next = new Set(value)
      next.delete(editingRow.slot_index)
      return next
    })
    closeRowEditor()
  }

  function unlockRow(row: NorthStarDisplayRow) {
    setUnlockedRows(value => new Set(value).add(row.slot_index))
  }

  function addPillar() {
    const slot = nextNorthStarSlot(rows)
    const row: NorthStarDisplayRow = {
      id: null,
      is_set: false,
      is_locked: false,
      period_month: currentMonth,
      period_week: currentWeek,
      slot_index: slot,
      pillar: 'New pillar',
      owner: null,
      north_star: '',
      plan_value: null,
      actual_mtd: null,
      forecast: null,
      constraint_now: null,
      weekly_move: null,
      last_week_result: null,
      status: 'on_plan',
    }
    openRowEditor(row)
  }

  async function removePillar(row: NorthStarDisplayRow) {
    if (!row.id) return
    const saved = savedRows.find(savedRow => savedRow.id === row.id)
    if (!saved) return
    await deleteRow.mutateAsync(saved)
    setUnlockedRows(value => {
      const next = new Set(value)
      next.delete(row.slot_index)
      return next
    })
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
      </div>

      <MonthlyStarPanel input={monthlyDraft} isAdmin={isAdmin} />

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold text-text1">Business plan review</div>
            <div className="text-xs text-text2 mt-1">Rows persist until an admin unlocks and updates them. Saving locks the row again.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isAdmin && (
              <button type="button" className="btn-secondary gap-2" onClick={addPillar}>
                <Edit3 size={15} />
                Add pillar
              </button>
            )}
            <Badge variant="ok">On plan</Badge>
            <Badge variant="warning">At risk</Badge>
            <Badge variant="danger">Off plan</Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="bg-surface2/60 text-xs uppercase tracking-wider text-text2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Department / unit</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
                <th className="px-4 py-3 text-left font-semibold">Metric</th>
                <th className="px-4 py-3 text-left font-semibold">Plan</th>
                <th className="px-4 py-3 text-left font-semibold">Actual (MTD)</th>
                <th className="px-4 py-3 text-left font-semibold">Forecast</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Constraint now</th>
                <th className="px-4 py-3 text-left font-semibold">This week's move</th>
                <th className="px-4 py-3 text-left font-semibold">Last week</th>
                {isAdmin && <th className="px-4 py-3 text-right font-semibold">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => (
                <tr key={row.slot_index} className="group hover:bg-surface2/50">
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold text-text1">{row.pillar}</div>
                    <div className="text-xs text-text2 mt-1">#{row.slot_index}</div>
                  </td>
                  <td className="px-4 py-4 align-top text-text2">{row.owner || 'Unassigned'}</td>
                  <td className="px-4 py-4 align-top text-text1 max-w-[220px]">{row.north_star}</td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[150px]">{row.plan_value || emptyText()}</td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[150px]">{row.actual_mtd || emptyText()}</td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[150px]">{row.forecast || emptyText()}</td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                      {row.is_set && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text2">
                          {isRowUnlocked(row) ? <LockOpen size={12} /> : <Lock size={12} />}
                          {isRowUnlocked(row) ? 'Unlocked' : 'Locked'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[220px]">{row.constraint_now || emptyText()}</td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[220px]">{row.weekly_move || emptyText()}</td>
                  <td className="px-4 py-4 align-top text-text2 max-w-[220px]">{row.last_week_result || emptyText()}</td>
                  {isAdmin && (
                    <td className="px-4 py-4 align-top text-right">
                      {row.is_set && !isRowUnlocked(row) ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text2 opacity-100 transition hover:bg-surface2 hover:text-text1 md:opacity-0 md:group-hover:opacity-100"
                          onClick={() => unlockRow(row)}
                          title={`Unlock ${row.pillar}`}
                          aria-label={`Unlock ${row.pillar}`}
                        >
                          <LockOpen size={14} />
                          Unlock
                        </button>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text2 opacity-100 transition hover:bg-surface2 hover:text-text1 md:opacity-0 md:group-hover:opacity-100"
                            onClick={() => openRowEditor(row)}
                            title={`${row.is_set ? 'Edit' : 'Set'} ${row.pillar}`}
                            aria-label={`${row.is_set ? 'Edit' : 'Set'} ${row.pillar}`}
                          >
                            <Edit3 size={14} />
                            {row.is_set ? 'Edit' : 'Set'}
                          </button>
                          {row.id && (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-xs font-semibold text-danger opacity-100 transition hover:bg-danger/10 md:opacity-0 md:group-hover:opacity-100"
                              onClick={() => removePillar(row)}
                              disabled={deleteRow.isPending}
                              title={`Remove ${row.pillar}`}
                              aria-label={`Remove ${row.pillar}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={Boolean(editingRow && rowForm)} onClose={closeRowEditor} title="Edit North Star Row" width="max-w-2xl">
        {editingRow && rowForm && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Pillar</span>
                <input className="input mt-1" value={rowForm.pillar} onChange={e => setRowForm({ ...rowForm, pillar: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Owner</span>
                <input className="input mt-1" value={rowForm.owner} onChange={e => setRowForm({ ...rowForm, owner: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-text2">Metric</span>
              <textarea className="input mt-1 min-h-[78px]" value={rowForm.north_star} onChange={e => setRowForm({ ...rowForm, north_star: e.target.value })} />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Plan</span>
                <input className="input mt-1" value={rowForm.plan_value} onChange={e => setRowForm({ ...rowForm, plan_value: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Actual (MTD)</span>
                <input className="input mt-1" value={rowForm.actual_mtd} onChange={e => setRowForm({ ...rowForm, actual_mtd: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Forecast</span>
                <input className="input mt-1" value={rowForm.forecast} onChange={e => setRowForm({ ...rowForm, forecast: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-text2">Constraint now</span>
              <textarea className="input mt-1 min-h-[78px]" value={rowForm.constraint_now} onChange={e => setRowForm({ ...rowForm, constraint_now: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-text2">Weekly move</span>
              <textarea className="input mt-1 min-h-[78px]" value={rowForm.weekly_move} onChange={e => setRowForm({ ...rowForm, weekly_move: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-text2">Last week result</span>
              <textarea className="input mt-1 min-h-[78px]" value={rowForm.last_week_result} onChange={e => setRowForm({ ...rowForm, last_week_result: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-text2">Status</span>
              <select className="input mt-1" value={rowForm.status} onChange={e => setRowForm({ ...rowForm, status: e.target.value as NorthStarStatus })}>
                <option value="on_plan">On plan</option>
                <option value="at_risk">At risk</option>
                <option value="off_plan">Off plan</option>
              </select>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={closeRowEditor}>Cancel</button>
              <button type="button" className="btn-primary" onClick={saveRow} disabled={updateRow.isPending}>
                {updateRow.isPending ? 'Saving...' : 'Save row'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )

  function MonthlyStarPanel({ input, isAdmin }: { input: MonthlyStarViewInput; isAdmin: boolean }) {
    const projectedVariant = monthlyMetrics.onTrack ? 'success' : 'warning'
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KPICard label="Monthly target" value={fmtCurrency(input.target_sales)} sub={`${fmtNumber(input.days_remaining)} selling days left`} icon={<Target size={17} />} />
          <KPICard label="MTD actual" value={fmtCurrency(input.mtd_actual)} sub={`${fmtCurrency(monthlyMetrics.dailyPace)} daily pace`} variant="info" icon={<TrendingUp size={17} />} />
          <KPICard
            label="Projected month-end"
            value={fmtCurrency(monthlyMetrics.projectedMonthEnd)}
            sub={monthlyMetrics.onTrack ? 'On pace to target' : `${fmtCurrency(monthlyMetrics.remainingToTarget)} remaining`}
            variant={projectedVariant}
            icon={<Target size={17} />}
          />
          <KPICard
            label="YoY MTD"
            value={fmtCurrency(monthlyMetrics.yoyDelta)}
            sub={monthlyMetrics.yoyPct === null ? 'No LY baseline' : `${monthlyMetrics.yoyPct.toFixed(1)}% vs LY`}
            variant={monthlyMetrics.yoyDelta >= 0 ? 'success' : 'danger'}
            icon={monthlyMetrics.yoyDelta >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text1">Monthly Star</div>
                <div className="text-xs text-text2 mt-1">Sales goal progress for {input.period_month.slice(0, 7)}</div>
              </div>
              {isAdmin && (
                <button type="button" className="btn-primary" onClick={saveMonthly} disabled={updateMonthly.isPending}>
                  {updateMonthly.isPending ? 'Saving...' : 'Save Monthly Star'}
                </button>
              )}
            </div>
            {isAdmin && monthlyForm && (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <MoneyInput label="Monthly sales target" value={monthlyForm.target_sales} onChange={target_sales => setMonthlyForm({ ...monthlyForm, target_sales })} />
                <MoneyInput label="Month-to-date actual" value={monthlyForm.mtd_actual} onChange={mtd_actual => setMonthlyForm({ ...monthlyForm, mtd_actual })} />
                <MoneyInput label="Last year MTD actual" value={monthlyForm.ly_mtd_actual} onChange={ly_mtd_actual => setMonthlyForm({ ...monthlyForm, ly_mtd_actual })} />
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text2">Days elapsed</span>
                  <input className="input mt-1" inputMode="numeric" value={monthlyForm.days_elapsed} onChange={e => setMonthlyForm({ ...monthlyForm, days_elapsed: e.target.value })} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text2">Days remaining</span>
                  <input className="input mt-1" inputMode="numeric" value={monthlyForm.days_remaining} onChange={e => setMonthlyForm({ ...monthlyForm, days_remaining: e.target.value })} />
                </label>
              </div>
            )}
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <MetricBlock label="Daily needed" value={fmtCurrency(monthlyMetrics.dailyNeeded)} />
              <MetricBlock label="Pace lift needed" value={monthlyMetrics.liftNeededPct === null ? 'N/A' : `${monthlyMetrics.liftNeededPct.toFixed(1)}%`} />
              <MetricBlock label="Status" value={monthlyMetrics.onTrack ? 'On track' : 'Needs lift'} tone={monthlyMetrics.onTrack ? 'success' : 'warning'} />
            </div>
          </div>

          <div className="card">
            <div className="text-sm font-semibold text-text1">Dragging channel</div>
            {isAdmin && monthlyForm && (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-text2">Open text</span>
                <textarea
                  className="input mt-1 min-h-[118px]"
                  value={monthlyForm.dragging_channel_notes}
                  onChange={e => setMonthlyForm({ ...monthlyForm, dragging_channel_notes: e.target.value })}
                  placeholder="FBA is trailing plan because inventory is constrained.&#10;WFS: -50000"
                />
              </label>
            )}
            {!isAdmin && input.dragging_channel_notes && (
              <div className="mt-4 rounded-lg bg-surface2 p-4 text-sm text-text1 whitespace-pre-wrap">{input.dragging_channel_notes}</div>
            )}
            <div className="mt-4 space-y-3">
              {monthlyMetrics.draggingChannels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-text2">No negative channel deltas recorded.</div>
              ) : (
                monthlyMetrics.draggingChannels.map(channel => (
                  <div key={channel.channel} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2">
                    <span className="text-sm text-text1">{channel.channel}</span>
                    <span className="text-sm font-semibold text-danger">{fmtCurrency(channel.delta)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function isRowUnlocked(row: NorthStarDisplayRow): boolean {
    return !row.is_set || !row.is_locked || unlockedRows.has(row.slot_index)
  }
}

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-text2">{label}</span>
      <input className="input mt-1" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function MetricBlock({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-text1'
  return (
    <div className="rounded-lg bg-surface2 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function emptyText() {
  return <span className="text-text2/70">Not set</span>
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
