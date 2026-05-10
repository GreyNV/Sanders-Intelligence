import { useState, useMemo } from 'react'
import { useInventoryAnalysis } from '@/hooks/useInventory'
import { useDismissedSet, useDismissAction, useRestoreAction } from '@/hooks/useDismissedActions'
import { useTasks } from '@/hooks/useTasks'
import KPICard from '@/components/ui/KPICard'
import Modal from '@/components/ui/Modal'
import Badge, { statusVariant, priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import TaskModal from '@/components/tasks/TaskModal'
import { fmtNumber, fmtCurrency, fmtDate, isOverdue } from '@/lib/utils'
import {
  AlertTriangle, ShoppingCart, Clock, DollarSign, Plus, ChevronRight,
  AlertCircle, EyeOff, RotateCcw, ArrowUp, ArrowDown, ChevronsUpDown,
  Filter, Download, PackageX, Ban, Truck, TrendingDown,
} from 'lucide-react'
import { downloadCsv, inventoryToExportRows } from '@/lib/exportCsv'
import { useNavigate } from 'react-router-dom'
import { InventoryRecord } from '@/types'
import type { DismissActionType } from '@/hooks/useDismissedActions'

interface DismissTarget { record: InventoryRecord; actionType: DismissActionType }
type SortDir = 'asc' | 'desc'
interface SortState { field: string; dir: SortDir }

function sortRecords(records: InventoryRecord[], sort: SortState): InventoryRecord[] {
  return [...records].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sort.field] as number
    const bv = (b as unknown as Record<string, unknown>)[sort.field] as number
    return sort.dir === 'asc' ? av - bv : bv - av
  })
}

function SortIcon({ field, sort }: { field: string; sort: SortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={11} className="text-text2/50 ml-0.5" />
  return sort.dir === 'asc'
    ? <ArrowUp size={11} className="text-accent ml-0.5" />
    : <ArrowDown size={11} className="text-accent ml-0.5" />
}

function SortableTh({
  field, label, sort, onSort, className = '',
}: { field: string; label: string; sort: SortState; onSort: (f: string) => void; className?: string }) {
  return (
    <th
      className={`cursor-pointer select-none hover:text-text1 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-0.5 whitespace-nowrap">
        {label}
        <SortIcon field={field} sort={sort} />
      </span>
    </th>
  )
}

export default function ActionCenter() {
  const { data: inventory, isLoading, error } = useInventoryAnalysis()
  const atRisk = inventory.atRiskItems
  const backorders = inventory.backorderItems
  const excess = inventory.excessItems
  const kpis = inventory.kpis
  const { data: tasks = [] }                      = useTasks()
  const dismissedAtRisk    = useDismissedSet('at_risk')
  const dismissedBackorder = useDismissedSet('backorder')
  const dismissedOverstock = useDismissedSet('overstock')
  const dismissAction  = useDismissAction()
  const restoreAction  = useRestoreAction()
  const navigate = useNavigate()

  // Task modal
  const [taskModal, setTaskModal]   = useState(false)
  const [prefillRecord, setPrefill] = useState<InventoryRecord | null>(null)
  const [prefillVendor, setPrefillVendor] = useState<string | undefined>()
  const [prefillSkus, setPrefillSkus]     = useState<InventoryRecord[]>([])
  const [prefillTitle, setPrefillTitle]   = useState('')

  // Dismiss modal
  const [dismissTarget, setDismissTarget]  = useState<DismissTarget | null>(null)
  const [dismissDays, setDismissDays]      = useState<string>('7')
  const [dismissReason, setDismissReason]  = useState('')

  // ── At-Risk table state ──────────────────────────────────────
  const [arSort, setArSort]         = useState<SortState>({ field: 'days_on_hand', dir: 'asc' })
  const [arVendor, setArVendor]     = useState('')
  const [arCategory, setArCategory] = useState('')
  const [arShowFilters, setArShowFilters] = useState(false)
  const [arShowDismissed, setArShowDismissed] = useState(false)

  // ── Backorders table state ───────────────────────────────────
  const [boSort, setBoSort]         = useState<SortState>({ field: 'unsatisfied_customer_orders_value', dir: 'desc' })
  const [boVendor, setBoVendor]     = useState('')
  const [boCategory, setBoCategory] = useState('')
  const [boShowFilters, setBoShowFilters] = useState(false)

  // ── Overstock table state ────────────────────────────────────
  const [osSort, setOsSort]         = useState<SortState>({ field: 'excess_value', dir: 'desc' })
  const [osVendor, setOsVendor]     = useState('')
  const [osCategory, setOsCategory] = useState('')
  const [osShowFilters, setOsShowFilters] = useState(false)
  const [osShowDismissed, setOsShowDismissed] = useState(false)

  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')

  // Distinct vendor/category lists
  const arVendors    = useMemo(() => [...new Set(atRisk.map(r => r.supplier_description))].filter(Boolean).sort(), [atRisk])
  const arCategories = useMemo(() => [...new Set(atRisk.map(r => r.category_name))].filter(Boolean).sort(), [atRisk])
  const boVendors    = useMemo(() => [...new Set(backorders.map(r => r.supplier_description))].filter(Boolean).sort(), [backorders])
  const boCategories = useMemo(() => [...new Set(backorders.map(r => r.category_name))].filter(Boolean).sort(), [backorders])
  const osVendors    = useMemo(() => [...new Set(excess.map(r => r.supplier_description))].filter(Boolean).sort(), [excess])
  const osCategories = useMemo(() => [...new Set(excess.map(r => r.category_name))].filter(Boolean).sort(), [excess])

  // Base sets (dismissed filter applied)
  const baseAtRisk     = arShowDismissed ? atRisk    : atRisk.filter(r => !dismissedAtRisk.has(r.product_code))
  const baseBackorders = backorders.filter(r => !dismissedBackorder.has(r.product_code))
  const baseOverstock  = osShowDismissed ? excess    : excess.filter(r => !dismissedOverstock.has(r.product_code))

  // Apply vendor/category filters + sort
  const visibleAtRisk = useMemo(() => {
    let rows = baseAtRisk
    if (arVendor)   rows = rows.filter(r => r.supplier_description === arVendor)
    if (arCategory) rows = rows.filter(r => r.category_name === arCategory)
    return sortRecords(rows, arSort).slice(0, 100)
  }, [baseAtRisk, arVendor, arCategory, arSort])

  const visibleBackorders = useMemo(() => {
    let rows = baseBackorders
    if (boVendor)   rows = rows.filter(r => r.supplier_description === boVendor)
    if (boCategory) rows = rows.filter(r => r.category_name === boCategory)
    return sortRecords(rows, boSort).slice(0, 50)
  }, [baseBackorders, boVendor, boCategory, boSort])

  const visibleOverstock = useMemo(() => {
    let rows = baseOverstock
    if (osVendor)   rows = rows.filter(r => r.supplier_description === osVendor)
    if (osCategory) rows = rows.filter(r => r.category_name === osCategory)
    return sortRecords(rows, osSort).slice(0, 100)
  }, [baseOverstock, osVendor, osCategory, osSort])

  // Overstock split by on_order status
  const overstockWithOrders = useMemo(() => visibleOverstock.filter(r => r.on_order > 0), [visibleOverstock])
  const overstockNoOrders   = useMemo(() => visibleOverstock.filter(r => r.on_order === 0), [visibleOverstock])

  // Group visible at-risk by vendor (for vendor-level task creation)
  const atRiskByVendor = useMemo(() => {
    const map: Record<string, InventoryRecord[]> = {}
    baseAtRisk.forEach(r => {
      const v = r.supplier_description || 'Unknown'
      ;(map[v] ||= []).push(r)
    })
    return map
  }, [baseAtRisk])

  if (isLoading || kpis.isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load inventory data</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Unknown error - try refreshing the page.'}</div>
    </div>
  )

  function toggleArSort(field: string) {
    setArSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }
  function toggleBoSort(field: string) {
    setBoSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }
  function toggleOsSort(field: string) {
    setOsSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  function openTaskForSku(record: InventoryRecord, title?: string) {
    setPrefill(record)
    setPrefillVendor(undefined)
    setPrefillSkus([])
    setPrefillTitle(title ?? `Order: ${record.description}`)
    setTaskModal(true)
  }

  function openVendorTask(vendor: string, records: InventoryRecord[]) {
    setPrefill(null)
    setPrefillVendor(vendor)
    setPrefillSkus(records)
    setPrefillTitle('')
    setTaskModal(true)
  }

  async function handleDismiss() {
    if (!dismissTarget) return
    const days = parseInt(dismissDays)
    const dismissed_until = isNaN(days) || dismissDays === 'permanent'
      ? null
      : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    await dismissAction.mutateAsync({
      product_code:    dismissTarget.record.product_code,
      action_type:     dismissTarget.actionType,
      dismissed_until,
      reason:          dismissReason || undefined,
    })
    setDismissTarget(null)
    setDismissReason('')
    setDismissDays('7')
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">Action Center</h1>
        <p className="text-text2 text-sm mt-0.5">Items requiring purchasing attention today</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Needs Ordering"          value={fmtNumber(kpis.atRiskCount)}          sub="potential stockout items"          variant="danger"  icon={<AlertTriangle size={16} />} />
        <KPICard label="Recommended Order Value" value={fmtCurrency(kpis.recOrderValue)}      sub="total value to order"              variant="warning" icon={<ShoppingCart size={16} />} />
        <KPICard label="Active Backorders"       value={fmtNumber(kpis.backorderCount)}        sub={`${fmtCurrency(kpis.totalBackorderValue)} in value`} variant="danger" icon={<Clock size={16} />} />
        <KPICard label="Open Tasks"              value={openTasks.length}                      sub="purchasing department"             variant="info"    icon={<DollarSign size={16} />} />
      </div>

      {/* ── Attention Required ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2">
            <AlertTriangle size={15} className="text-danger" />
            Attention Required
            <span className="text-xs font-normal text-text2">— potential stockouts with recommended orders</span>
            {dismissedAtRisk.size > 0 && (
              <span className="text-[11px] text-text2 bg-surface2 px-2 py-0.5 rounded-full">
                {dismissedAtRisk.size} snoozed
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setArShowFilters(v => !v)}
              className={`btn-ghost text-xs flex items-center gap-1 ${(arVendor || arCategory) ? 'text-accent' : ''}`}
            >
              <Filter size={12} /> Filters {(arVendor || arCategory) ? '●' : ''}
            </button>
            <button
              onClick={() => downloadCsv(inventoryToExportRows(visibleAtRisk), `at_risk_${new Date().toISOString().slice(0,10)}.csv`)}
              className="btn-ghost text-xs flex items-center gap-1"
              title="Export at-risk items to Excel"
            >
              <Download size={12} /> Export
            </button>
            {dismissedAtRisk.size > 0 && (
              <button onClick={() => setArShowDismissed(v => !v)} className="btn-ghost text-xs">
                {arShowDismissed ? 'Hide snoozed' : 'Show snoozed'}
              </button>
            )}
            <button onClick={() => navigate('/purchasing/inventory')} className="btn-ghost text-xs">
              View all inventory <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {arShowFilters && (
          <div className="flex gap-3 mb-3 p-3 bg-surface2 rounded-lg border border-border">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Vendor</label>
              <select className="select w-full text-sm" value={arVendor} onChange={e => setArVendor(e.target.value)}>
                <option value="">All vendors</option>
                {arVendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Category</label>
              <select className="select w-full text-sm" value={arCategory} onChange={e => setArCategory(e.target.value)}>
                <option value="">All categories</option>
                {arCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(arVendor || arCategory) && (
              <div className="flex items-end">
                <button onClick={() => { setArVendor(''); setArCategory('') }} className="btn-ghost text-xs text-danger">
                  Clear
                </button>
              </div>
            )}
            {arVendor && (
              <div className="flex items-end">
                <button
                  onClick={() => openVendorTask(arVendor, baseAtRisk.filter(r => r.supplier_description === arVendor))}
                  className="btn-secondary text-xs flex items-center gap-1"
                  title="Create one task for all at-risk SKUs from this vendor"
                >
                  <Plus size={12} /> Vendor Task
                </button>
              </div>
            )}
          </div>
        )}

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Vendor</th>
                <SortableTh field="on_hand"                label="On Hand"          sort={arSort} onSort={toggleArSort} />
                <SortableTh field="days_on_hand"           label="Days on Hand"      sort={arSort} onSort={toggleArSort} />
                <SortableTh field="average_sales"          label="Avg Sales/mo"      sort={arSort} onSort={toggleArSort} />
                <SortableTh field="recommended_order"      label="Rec. Order Qty"    sort={arSort} onSort={toggleArSort} />
                <SortableTh field="recommended_order_value" label="Rec. Order Value" sort={arSort} onSort={toggleArSort} />
                <SortableTh field="unsatisfied_customer_orders_units" label="Backorders" sort={arSort} onSort={toggleArSort} />
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleAtRisk.length === 0 ? (
                <tr><td colSpan={11} className="py-10 text-center text-text2">
                  {arVendor || arCategory ? 'No results for selected filters' : 'No at-risk items — great job!'}
                </td></tr>
              ) : (
                visibleAtRisk.map(r => (
                  <tr key={r.id}>
                    <td
                      className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                      onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                      title="Open in Inventory Browser"
                    >{r.product_code}</td>
                    <td className="max-w-[220px]">
                      <span className="block truncate text-text1" title={r.description}>{r.description}</span>
                    </td>
                    <td className="text-text2 text-xs max-w-[120px]">
                      <span className="block truncate" title={r.supplier_description}>{r.supplier_description}</span>
                    </td>
                    <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                    <td className="tabular-nums">
                      <span className={r.days_on_hand <= 7 ? 'text-danger font-semibold' : r.days_on_hand <= 14 ? 'text-warning' : ''}>
                        {r.days_on_hand}d
                      </span>
                    </td>
                    <td className="tabular-nums text-text2">{r.average_sales.toFixed(1)}</td>
                    <td className="tabular-nums font-semibold">{fmtNumber(r.recommended_order)}</td>
                    <td className="tabular-nums">{fmtCurrency(r.recommended_order_value)}</td>
                    <td className="tabular-nums">
                      {r.unsatisfied_customer_orders_units > 0
                        ? <span className="text-danger font-semibold">{fmtNumber(r.unsatisfied_customer_orders_units)}</span>
                        : <span className="text-text2">—</span>
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Badge variant={statusVariant(r.status)} value={r.status} />
                        {(r.status === 'Excess stock' || r.status === 'Surplus orders') && r.unsatisfied_customer_orders_units > 0 && (
                          <span title="Data quality: item is excess stock but also has backorders — verify source data">
                            <AlertCircle size={13} className="text-warning" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {dismissedAtRisk.has(r.product_code) ? (
                          <button
                            onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'at_risk' })}
                            className="btn-ghost text-[11px] py-1 px-2 text-text2 flex items-center gap-1"
                            title="Restore alert"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => setDismissTarget({ record: r, actionType: 'at_risk' })}
                            className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                            title="Snooze or archive this alert"
                          >
                            <EyeOff size={12} /> Snooze
                          </button>
                        )}
                        <button
                          onClick={() => openTaskForSku(r)}
                          className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                          title="Create task"
                        >
                          <Plus size={12} /> Task
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {baseAtRisk.length > 100 && (
          <p className="text-xs text-text2 mt-2 pl-1">Showing top 100 of {baseAtRisk.length}. Use Inventory Browser for full view.</p>
        )}
      </div>

      {/* ── Open Backorders ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2">
            <Clock size={15} className="text-warning" />
            Open Backorders
            <span className="text-xs font-normal text-text2">— unsatisfied customer orders</span>
            {dismissedBackorder.size > 0 && (
              <span className="text-[11px] text-text2 bg-surface2 px-2 py-0.5 rounded-full">
                {dismissedBackorder.size} snoozed
              </span>
            )}
          </h2>
          <button
            onClick={() => setBoShowFilters(v => !v)}
            className={`btn-ghost text-xs flex items-center gap-1 ${(boVendor || boCategory) ? 'text-accent' : ''}`}
          >
            <Filter size={12} /> Filters {(boVendor || boCategory) ? '●' : ''}
          </button>
        </div>

        {boShowFilters && (
          <div className="flex gap-3 mb-3 p-3 bg-surface2 rounded-lg border border-border">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Vendor</label>
              <select className="select w-full text-sm" value={boVendor} onChange={e => setBoVendor(e.target.value)}>
                <option value="">All vendors</option>
                {boVendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Category</label>
              <select className="select w-full text-sm" value={boCategory} onChange={e => setBoCategory(e.target.value)}>
                <option value="">All categories</option>
                {boCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(boVendor || boCategory) && (
              <div className="flex items-end">
                <button onClick={() => { setBoVendor(''); setBoCategory('') }} className="btn-ghost text-xs text-danger">Clear</button>
              </div>
            )}
          </div>
        )}

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Vendor</th>
                <SortableTh field="on_hand"                            label="On Hand"           sort={boSort} onSort={toggleBoSort} />
                <SortableTh field="unsatisfied_customer_orders_units"  label="Unsatisfied Units" sort={boSort} onSort={toggleBoSort} />
                <SortableTh field="unsatisfied_customer_orders_value"  label="Backorder Value"   sort={boSort} onSort={toggleBoSort} />
                <SortableTh field="on_order"                           label="On Order"          sort={boSort} onSort={toggleBoSort} />
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleBackorders.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-text2">
                  {boVendor || boCategory ? 'No results for selected filters' : 'No open backorders'}
                </td></tr>
              ) : (
                visibleBackorders.map(r => (
                  <tr key={r.id}>
                    <td
                      className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                      onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                      title="Open in Inventory Browser"
                    >{r.product_code}</td>
                    <td className="max-w-[220px]">
                      <span className="block truncate" title={r.description}>{r.description}</span>
                    </td>
                    <td className="text-text2 text-xs max-w-[120px]">
                      <span className="block truncate" title={r.supplier_description}>{r.supplier_description}</span>
                    </td>
                    <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                    <td className="tabular-nums text-danger font-semibold">
                      {fmtNumber(r.unsatisfied_customer_orders_units)}
                    </td>
                    <td className="tabular-nums">{fmtCurrency(r.unsatisfied_customer_orders_value)}</td>
                    <td className="tabular-nums">{fmtNumber(r.on_order)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <Badge variant={statusVariant(r.status)} value={r.status} />
                        {(r.status === 'Excess stock' || r.status === 'Surplus orders') && (
                          <span title="Data quality: item has backorders but is flagged as excess — verify source data">
                            <AlertCircle size={13} className="text-warning" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {dismissedBackorder.has(r.product_code) ? (
                        <button
                          onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'backorder' })}
                          className="btn-ghost text-[11px] py-1 px-2 text-text2 flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => setDismissTarget({ record: r, actionType: 'backorder' })}
                          className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                        >
                          <EyeOff size={12} /> Snooze
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

      {/* ── Overstock Suggested Actions ── */}
      {(excess.length > 0) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2">
              <PackageX size={15} className="text-accent" />
              Overstock Actions
              <span className="text-xs font-normal text-text2">— excess stock &amp; surplus orders requiring review</span>
              {dismissedOverstock.size > 0 && (
                <span className="text-[11px] text-text2 bg-surface2 px-2 py-0.5 rounded-full">
                  {dismissedOverstock.size} snoozed
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setOsShowFilters(v => !v)}
                className={`btn-ghost text-xs flex items-center gap-1 ${(osVendor || osCategory) ? 'text-accent' : ''}`}
              >
                <Filter size={12} /> Filters {(osVendor || osCategory) ? '●' : ''}
              </button>
              {dismissedOverstock.size > 0 && (
                <button onClick={() => setOsShowDismissed(v => !v)} className="btn-ghost text-xs">
                  {osShowDismissed ? 'Hide snoozed' : 'Show snoozed'}
                </button>
              )}
            </div>
          </div>

          {osShowFilters && (
            <div className="flex gap-3 mb-3 p-3 bg-surface2 rounded-lg border border-border">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Vendor</label>
                <select className="select w-full text-sm" value={osVendor} onChange={e => setOsVendor(e.target.value)}>
                  <option value="">All vendors</option>
                  {osVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1">Category</label>
                <select className="select w-full text-sm" value={osCategory} onChange={e => setOsCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {osCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {(osVendor || osCategory) && (
                <div className="flex items-end">
                  <button onClick={() => { setOsVendor(''); setOsCategory('') }} className="btn-ghost text-xs text-danger">Clear</button>
                </div>
              )}
            </div>
          )}

          {/* Sub-section A: Items with open orders → Delay / Cancel */}
          {overstockWithOrders.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Truck size={13} className="text-warning" />
                <span className="text-[12px] font-semibold text-warning">Open orders exist</span>
                <span className="text-[11px] text-text2">({overstockWithOrders.length} SKUs) — consider delaying or cancelling inbound</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Description</th>
                      <th>Vendor</th>
                      <SortableTh field="on_hand"      label="On Hand"       sort={osSort} onSort={toggleOsSort} />
                      <SortableTh field="excess_value" label="Excess Value"  sort={osSort} onSort={toggleOsSort} />
                      <SortableTh field="on_order"     label="On Order"      sort={osSort} onSort={toggleOsSort} />
                      <th>Status</th>
                      <th>Suggested Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overstockWithOrders.map(r => (
                      <tr key={r.id} className={dismissedOverstock.has(r.product_code) ? 'opacity-50' : ''}>
                        <td
                          className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                          onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                          title="Open in Inventory Browser"
                        >{r.product_code}</td>
                        <td className="max-w-[200px]">
                          <span className="block truncate text-text1" title={r.description}>{r.description}</span>
                        </td>
                        <td className="text-text2 text-xs max-w-[110px]">
                          <span className="block truncate" title={r.supplier_description}>{r.supplier_description}</span>
                        </td>
                        <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                        <td className="tabular-nums text-accent font-semibold">{fmtCurrency(r.excess_value)}</td>
                        <td className="tabular-nums font-semibold">{fmtNumber(r.on_order)}</td>
                        <td><Badge variant={statusVariant(r.status)} value={r.status} /></td>
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {dismissedOverstock.has(r.product_code) ? (
                              <button
                                onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'overstock' })}
                                className="btn-ghost text-[11px] py-1 px-2 text-text2 flex items-center gap-1"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => openTaskForSku(r, `Delay Order: ${r.description}`)}
                                  className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1 text-warning border-warning/30 hover:bg-warning/10"
                                  title="Create task to delay incoming order"
                                >
                                  <Truck size={11} /> Delay Order
                                </button>
                                <button
                                  onClick={() => openTaskForSku(r, `Cancel Order: ${r.description}`)}
                                  className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1 text-danger border-danger/30 hover:bg-danger/10"
                                  title="Create task to cancel incoming order"
                                >
                                  <Ban size={11} /> Cancel Order
                                </button>
                                <button
                                  onClick={() => setDismissTarget({ record: r, actionType: 'overstock' })}
                                  className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                                  title="Snooze this overstock alert"
                                >
                                  <EyeOff size={11} /> Snooze
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-section B: No open orders → Liquidation */}
          {overstockNoOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <TrendingDown size={13} className="text-accent" />
                <span className="text-[12px] font-semibold text-accent">No inbound orders</span>
                <span className="text-[11px] text-text2">({overstockNoOrders.length} SKUs) — consider liquidation or promotion</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Description</th>
                      <th>Vendor</th>
                      <SortableTh field="on_hand"      label="On Hand"      sort={osSort} onSort={toggleOsSort} />
                      <SortableTh field="excess_value" label="Excess Value" sort={osSort} onSort={toggleOsSort} />
                      <SortableTh field="days_on_hand" label="Days OH"      sort={osSort} onSort={toggleOsSort} />
                      <th>Status</th>
                      <th>Suggested Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overstockNoOrders.map(r => (
                      <tr key={r.id} className={dismissedOverstock.has(r.product_code) ? 'opacity-50' : ''}>
                        <td
                          className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                          onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                          title="Open in Inventory Browser"
                        >{r.product_code}</td>
                        <td className="max-w-[200px]">
                          <span className="block truncate text-text1" title={r.description}>{r.description}</span>
                        </td>
                        <td className="text-text2 text-xs max-w-[110px]">
                          <span className="block truncate" title={r.supplier_description}>{r.supplier_description}</span>
                        </td>
                        <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                        <td className="tabular-nums text-accent font-semibold">{fmtCurrency(r.excess_value)}</td>
                        <td className="tabular-nums">
                          <span className={r.days_on_hand > 90 ? 'text-danger font-semibold' : ''}>
                            {r.days_on_hand}d
                          </span>
                        </td>
                        <td><Badge variant={statusVariant(r.status)} value={r.status} /></td>
                        <td>
                          <div className="flex gap-1">
                            {dismissedOverstock.has(r.product_code) ? (
                              <button
                                onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'overstock' })}
                                className="btn-ghost text-[11px] py-1 px-2 text-text2 flex items-center gap-1"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => openTaskForSku(r, `Liquidation: ${r.description}`)}
                                  className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1 text-accent border-accent/30 hover:bg-accent/10"
                                  title="Create task to run a liquidation campaign"
                                >
                                  <TrendingDown size={11} /> Liquidation
                                </button>
                                <button
                                  onClick={() => setDismissTarget({ record: r, actionType: 'overstock' })}
                                  className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1"
                                  title="Snooze this overstock alert"
                                >
                                  <EyeOff size={11} /> Snooze
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {visibleOverstock.length === 0 && (
            <div className="card text-center py-8 text-text2 text-sm">
              {osVendor || osCategory ? 'No results for selected filters' : 'No overstock items'}
            </div>
          )}
        </div>
      )}

      {/* ── Open Tasks Widget ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-text1">Open Tasks</h2>
          <div className="flex gap-2">
            <button onClick={() => { setPrefill(null); setPrefillVendor(undefined); setPrefillSkus([]); setPrefillTitle(''); setTaskModal(true) }} className="btn-secondary text-xs">
              <Plus size={13} /> New Task
            </button>
            <button onClick={() => navigate('/tasks')} className="btn-ghost text-xs">
              View all <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {openTasks.length === 0 ? (
          <div className="card text-center py-8 text-text2 text-sm">No open tasks</div>
        ) : (
          <div className="space-y-2">
            {openTasks.slice(0, 5).map(task => (
              <div key={task.id} className="card flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text1 truncate">{task.title}</span>
                    {task.sku_code && <span className="text-[10px] text-text2 font-mono">{task.sku_code}</span>}
                  </div>
                  {task.due_date && (
                    <span className={`text-[11px] ${isOverdue(task.due_date) ? 'text-danger' : 'text-text2'}`}>
                      Due {fmtDate(task.due_date)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={priorityVariant(task.priority)} value={task.priority} />
                  <Badge variant={taskStatusVariant(task.status)} value={task.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Modal */}
      {taskModal && (
        <TaskModal
          open={taskModal}
          onClose={() => { setTaskModal(false); setPrefill(null); setPrefillVendor(undefined); setPrefillSkus([]); setPrefillTitle('') }}
          prefillSku={prefillRecord?.product_code}
          prefillTitle={prefillTitle || (prefillRecord ? `Order: ${prefillRecord.description}` : '')}
          prefillVendor={prefillVendor}
          prefillVendorSkus={prefillSkus}
          atRiskByVendor={atRiskByVendor}
        />
      )}

      {/* Snooze / Archive Modal */}
      {dismissTarget && (
        <Modal
          open={!!dismissTarget}
          onClose={() => setDismissTarget(null)}
          title={`Snooze alert — ${dismissTarget.record.product_code}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-text2 truncate">{dismissTarget.record.description}</p>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Snooze duration</label>
              <select
                className="select w-full"
                value={dismissDays}
                onChange={e => setDismissDays(e.target.value)}
              >
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="permanent">Permanently (known / intentional)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Reason (optional)</label>
              <input
                className="input w-full"
                placeholder="e.g. Liquidation in progress, PO placed manually…"
                value={dismissReason}
                onChange={e => setDismissReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setDismissTarget(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleDismiss}
                disabled={dismissAction.isPending}
                className="btn-primary"
              >
                {dismissDays === 'permanent' ? 'Archive alert' : `Snooze ${dismissDays}d`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
