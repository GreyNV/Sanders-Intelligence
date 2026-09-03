import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  RotateCcw,
  Save,
  WalletCards,
} from 'lucide-react'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { useInventoryBalance, useUpdateInventoryBalanceSettings } from '@/hooks/useInventoryBalance'
import { cn, fmtCurrency, fmtCurrencyFull, fmtNumber } from '@/lib/utils'
import {
  addMonthsToInventoryPeriod,
  parseInventoryMoney,
  periodMonthFromDate,
  type InventoryBalanceRow,
} from './InventoryBalance.helpers'

export default function InventoryBalance() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const currentMonth = useMemo(() => periodMonthFromDate(new Date().toISOString()), [])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const { data, isLoading, error } = useInventoryBalance(selectedMonth)
  const updateSettings = useUpdateInventoryBalanceSettings()
  const [draftPeriod, setDraftPeriod] = useState(currentMonth)
  const [draftValue, setDraftValue] = useState('')

  useEffect(() => {
    if (!data?.settings) return
    setDraftPeriod(periodMonthFromDate(data.settings.beginning_period_month))
    setDraftValue(fmtCurrencyFull(Number(data.settings.beginning_inventory_value ?? 0)))
  }, [data?.settings])

  const rows = data?.rows ?? []
  const selectedRow = data?.selectedRow ?? null
  const firstRow = rows[0] ?? null
  const previousMonth = addMonthsToInventoryPeriod(selectedMonth, -1)
  const nextMonth = addMonthsToInventoryPeriod(selectedMonth, 1)
  const minMonth = data?.settings ? periodMonthFromDate(data.settings.beginning_period_month) : ''
  const canGoBack = !minMonth || selectedMonth > minMonth
  const canGoForward = selectedMonth < currentMonth
  const periodDelta = selectedRow
    ? selectedRow.ending_inventory_value - selectedRow.beginning_inventory_value
    : 0

  async function handleSaveSettings() {
    const period = periodMonthFromDate(draftPeriod)
    await updateSettings.mutateAsync({
      beginning_period_month: period,
      beginning_inventory_value: parseInventoryMoney(draftValue),
    })
    setSelectedMonth(period)
  }

  if (isLoading) return <PageLoader />

  if (error) {
    return (
      <div className="card py-16 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-danger" />
        <div className="font-semibold text-text1">Failed to load inventory balance</div>
        <div className="mt-1 text-sm text-text2">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
      </div>
    )
  }

  if (data?.setupRequired) {
    return (
      <div className="card py-16 text-center">
        <AlertTriangle size={32} className="mx-auto mb-3 text-warning" />
        <div className="font-semibold text-text1">Inventory balance setup is not available</div>
        <div className="mt-1 text-sm text-text2">Run the inventory balance migration before opening this view.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-text1">
            <Calculator size={20} className="text-accent" /> Inventory Balance
          </h1>
          <p className="mt-0.5 text-sm text-text2">
            Monthly inventory value rollforward from PO receipts and sales COGS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setSelectedMonth(previousMonth)}
              disabled={!canGoBack}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[136px] border-x border-border px-3 text-center text-sm font-semibold text-text1">
              {formatInventoryPeriod(selectedMonth)}
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center text-text2 transition hover:bg-surface2 hover:text-text1 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setSelectedMonth(nextMonth)}
              disabled={!canGoForward}
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

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICard
            label="Beginning balance"
            value={selectedRow ? fmtCurrency(selectedRow.beginning_inventory_value) : '-'}
            sub={firstRow ? `From ${formatInventoryPeriod(firstRow.period_month)}` : 'Not set'}
            icon={<WalletCards size={15} />}
          />
          <KPICard
            label="PO received"
            value={selectedRow ? fmtCurrency(selectedRow.po_received_value) : '-'}
            sub={`${fmtNumber(data?.receiptMovementCount ?? 0)} receipt movements`}
            variant="info"
            icon={<Boxes size={15} />}
          />
          <KPICard
            label="COGS"
            value={selectedRow ? accountingCurrency(-selectedRow.cogs_amount) : '-'}
            sub={selectedRow && selectedRow.missing_cogs_count > 0 ? `${fmtNumber(selectedRow.missing_cogs_count)} missing rows` : 'Sales cost in period'}
            variant={selectedRow && selectedRow.cogs_amount > 0 ? 'danger' : 'default'}
            icon={<ReceiptText size={15} />}
          />
          <KPICard
            label="Ending inventory"
            value={selectedRow ? fmtCurrency(selectedRow.ending_inventory_value) : '-'}
            sub={selectedRow ? signedCurrency(periodDelta) : 'Balance result'}
            variant={periodDelta < 0 ? 'warning' : 'success'}
            icon={<Calculator size={15} />}
          />
        </div>

        <OpeningBalancePanel
          isAdmin={isAdmin}
          hasSettings={Boolean(data?.settings)}
          draftPeriod={draftPeriod}
          draftValue={draftValue}
          isSaving={updateSettings.isPending}
          saveError={updateSettings.error instanceof Error ? updateSettings.error.message : null}
          saveSuccess={updateSettings.isSuccess}
          onPeriodChange={setDraftPeriod}
          onValueChange={setDraftValue}
          onSave={handleSaveSettings}
        />
      </div>

      {!data?.settings && (
        <div className="mb-4 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          Beginning balance has not been set.
        </div>
      )}

      {(data?.missingCogsRows ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
          COGS is missing on {fmtNumber(data?.missingCogsRows ?? 0)} SellerCloud sales row{data?.missingCogsRows === 1 ? '' : 's'}.
        </div>
      )}

      <InventoryBalanceTable rows={rows} selectedPeriod={selectedRow?.period_month ?? selectedMonth} />
    </div>
  )
}

function OpeningBalancePanel({
  isAdmin,
  hasSettings,
  draftPeriod,
  draftValue,
  isSaving,
  saveError,
  saveSuccess,
  onPeriodChange,
  onValueChange,
  onSave,
}: {
  isAdmin: boolean
  hasSettings: boolean
  draftPeriod: string
  draftValue: string
  isSaving: boolean
  saveError: string | null
  saveSuccess: boolean
  onPeriodChange: (value: string) => void
  onValueChange: (value: string) => void
  onSave: () => void
}) {
  if (!isAdmin) {
    return (
      <div className="card">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text2">Opening balance</div>
        <div className="mt-2 text-lg font-bold text-text1">
          {hasSettings ? formatInventoryPeriod(draftPeriod) : 'Not set'}
        </div>
        <div className="mt-1 text-sm text-text2">{hasSettings ? draftValue : 'Admin setup required'}</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text2">Opening balance</div>
          <div className="mt-1 text-sm font-semibold text-text1">Admin setting</div>
        </div>
        <Calculator size={17} className="text-text2" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text2">Period</span>
          <input
            className="input w-full"
            type="month"
            value={draftPeriod.slice(0, 7)}
            onChange={event => onPeriodChange(`${event.target.value}-01`)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text2">Value</span>
          <input
            className="input w-full tabular-nums"
            value={draftValue}
            inputMode="decimal"
            onChange={event => onValueChange(event.target.value)}
            onBlur={() => onValueChange(fmtCurrencyFull(parseInventoryMoney(draftValue)))}
            placeholder="$0.00"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-h-5 text-xs">
          {saveError ? <span className="text-danger">{saveError}</span> : saveSuccess ? <span className="text-success">Saved</span> : null}
        </div>
        <button type="button" className="btn-primary text-xs" onClick={onSave} disabled={isSaving}>
          <Save size={14} />
          {isSaving ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function InventoryBalanceTable({ rows, selectedPeriod }: { rows: InventoryBalanceRow[]; selectedPeriod: string }) {
  return (
    <div className="tbl-wrap max-h-[calc(100vh-360px)]">
      <table className="tbl min-w-[980px]">
        <thead>
          <tr>
            <th>First date of the month</th>
            <th className="text-right">Beginning inventory value</th>
            <th className="text-right">New PO amount received</th>
            <th className="text-right">COGS in the time period</th>
            <th className="text-right">Total inventory value</th>
            <th>End of the month</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-text2">
                No inventory balance rows to show.
              </td>
            </tr>
          ) : rows.map(row => (
            <tr key={row.period_month} className={cn(row.period_month === selectedPeriod && 'bg-accent/5')}>
              <td className="whitespace-nowrap text-xs text-text2">{formatTableDate(row.first_date)}</td>
              <td className="text-right font-semibold tabular-nums text-text1">{fmtCurrencyFull(row.beginning_inventory_value)}</td>
              <td className="text-right tabular-nums text-accent">{fmtCurrencyFull(row.po_received_value)}</td>
              <td className="text-right tabular-nums text-danger">{accountingCurrency(-row.cogs_amount)}</td>
              <td className="text-right font-semibold tabular-nums text-success">{fmtCurrencyFull(row.ending_inventory_value)}</td>
              <td className="whitespace-nowrap text-xs text-text2">{formatTableDate(row.end_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatInventoryPeriod(periodMonth: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${periodMonth}T00:00:00Z`))
}

function formatTableDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`))
}

function signedCurrency(value: number): string {
  if (value === 0) return fmtCurrency(0)
  const sign = value > 0 ? '+' : '-'
  return `${sign}${fmtCurrency(Math.abs(value))} vs start`
}

function accountingCurrency(value: number): string {
  if (value < 0) return `(${fmtCurrencyFull(Math.abs(value))})`
  return fmtCurrencyFull(value)
}
