import { useState, useMemo, Fragment } from 'react'
import { useInventory, useAtRiskItems } from '@/hooks/useInventory'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency, groupBy } from '@/lib/utils'
import TaskModal from '@/components/tasks/TaskModal'
import {
  ArrowUp, ArrowDown, ChevronsUpDown, Plus, Search, Store,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { InventoryRecord } from '@/types'

type SortDir = 'asc' | 'desc'
interface SortState { field: string; dir: SortDir }

interface VendorRow {
  supplier_code: string
  supplier_description: string
  totalSkus: number
  okCount: number
  atRiskCount: number
  excessCount: number
  newItemCount: number
  stockedOutCount: number
  surplusCount: number
  totalOnHandValue: number
  totalRecommendedQty: number
  totalRecommendedValue: number
  totalBackorderUnits: number
  records: InventoryRecord[]
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

export default function VendorView() {
  const { data: records = [], isLoading }      = useInventory()
  const { data: atRisk = [], isLoading: l2 }   = useAtRiskItems()
  const navigate = useNavigate()

  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategory] = useState('')
  const [sort, setSort]           = useState<SortState>({ field: 'totalRecommendedValue', dir: 'desc' })
  const [taskModal, setTaskModal] = useState(false)
  const [taskVendor, setTaskVendor]   = useState('')
  const [taskVendorSkus, setTaskVendorSkus] = useState<InventoryRecord[]>([])
  const [expandedVendor, setExpanded] = useState<string | null>(null)

  // Distinct categories
  const categories = useMemo(() =>
    [...new Set(records.map(r => r.category_name))].filter(Boolean).sort()
  , [records])

  // Build vendor summary rows
  const vendorRows: VendorRow[] = useMemo(() => {
    let filtered = records
    if (categoryFilter) filtered = filtered.filter(r => r.category_name === categoryFilter)

    const grouped = groupBy(filtered, r => r.supplier_code || r.supplier_description || 'Unknown')
    return Object.entries(grouped).map(([, items]) => {
      const first = items[0]
      return {
        supplier_code:        first.supplier_code,
        supplier_description: first.supplier_description || 'Unknown',
        totalSkus:            items.length,
        okCount:              items.filter(r => r.status === 'Ok').length,
        atRiskCount:          items.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out').length,
        excessCount:          items.filter(r => r.status === 'Excess stock' || r.status === 'Surplus orders').length,
        newItemCount:         items.filter(r => r.status === 'New item').length,
        stockedOutCount:      items.filter(r => r.status === 'Stocked out').length,
        surplusCount:         items.filter(r => r.status === 'Surplus orders').length,
        totalOnHandValue:     items.reduce((s, r) => s + r.on_hand_value, 0),
        totalRecommendedQty:  items.reduce((s, r) => s + r.recommended_order, 0),
        totalRecommendedValue: items.reduce((s, r) => s + r.recommended_order_value, 0),
        totalBackorderUnits:  items.reduce((s, r) => s + r.unsatisfied_customer_orders_units, 0),
        records:              items,
      }
    })
  }, [records, categoryFilter])

  // At-risk map per vendor (for task creation)
  const atRiskByVendor = useMemo(() => {
    return groupBy(atRisk, r => r.supplier_description || 'Unknown')
  }, [atRisk])

  // Filter + sort
  const displayRows = useMemo(() => {
    let rows = vendorRows
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.supplier_description.toLowerCase().includes(q) ||
        r.supplier_code.toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.field] as number | string
      const bv = (b as unknown as Record<string, unknown>)[sort.field] as number | string
      if (typeof av === 'string') {
        return sort.dir === 'asc'
          ? (av as string).localeCompare(bv as string)
          : (bv as string).localeCompare(av as string)
      }
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [vendorRows, search, sort])

  function toggleSort(field: string) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
  }

  function openVendorTask(row: VendorRow) {
    setTaskVendor(row.supplier_description)
    setTaskVendorSkus(atRiskByVendor[row.supplier_description] ?? [])
    setTaskModal(true)
  }

  if (isLoading || l2) return <PageLoader />

  // Summary KPIs
  const totalVendors  = vendorRows.length
  const vendorsAtRisk = vendorRows.filter(r => r.atRiskCount > 0).length
  const totalRecQty   = vendorRows.reduce((s, r) => s + r.totalRecommendedQty, 0)
  const totalRecVal   = vendorRows.reduce((s, r) => s + r.totalRecommendedValue, 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1 flex items-center gap-2">
          <Store size={20} className="text-accent" /> Vendor View
        </h1>
        <p className="text-text2 text-sm mt-0.5">Inventory status grouped by vendor — sortable & filterable</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="text-[11px] text-text2 font-semibold uppercase tracking-wider">Total Vendors</div>
          <div className="text-2xl font-bold text-text1 mt-1">{fmtNumber(totalVendors)}</div>
        </div>
        <div className="card border-danger/30">
          <div className="text-[11px] text-danger font-semibold uppercase tracking-wider">Vendors w/ At-Risk</div>
          <div className="text-2xl font-bold text-danger mt-1">{fmtNumber(vendorsAtRisk)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] text-text2 font-semibold uppercase tracking-wider">Total Rec. Order Qty</div>
          <div className="text-2xl font-bold text-text1 mt-1">{fmtNumber(totalRecQty)}</div>
        </div>
        <div className="card">
          <div className="text-[11px] text-text2 font-semibold uppercase tracking-wider">Total Rec. Order Value</div>
          <div className="text-2xl font-bold text-text1 mt-1">{fmtCurrency(totalRecVal)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
          <input
            className="input w-full pl-8 text-sm"
            placeholder="Search vendor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select text-sm" value={categoryFilter} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || categoryFilter) && (
          <button onClick={() => { setSearch(''); setCategory('') }} className="btn-ghost text-xs text-danger">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-text2 self-center">
          {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <SortableTh field="supplier_description" label="Vendor"              sort={sort} onSort={toggleSort} />
              <th className="text-center">Supplier Code</th>
              <SortableTh field="totalSkus"            label="Total SKUs"         sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="okCount"              label="OK"                 sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="atRiskCount"          label="At Risk"            sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="excessCount"          label="Excess"             sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="newItemCount"         label="New Items"          sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="totalBackorderUnits"  label="Backorder Units"    sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="totalRecommendedQty"  label="Rec. Order Qty"     sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="totalRecommendedValue" label="Rec. Order Value"  sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="totalOnHandValue"     label="On-Hand Value"      sort={sort} onSort={toggleSort} className="text-right" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-10 text-center text-text2">
                  {search || categoryFilter ? 'No vendors match the selected filters' : 'No inventory data available'}
                </td>
              </tr>
            ) : (
              displayRows.map(row => (
                <Fragment key={row.supplier_code || row.supplier_description}>
                  <tr
                    className={`cursor-pointer ${expandedVendor === row.supplier_description ? 'bg-surface2/60' : ''}`}
                    onClick={() => setExpanded(v => v === row.supplier_description ? null : row.supplier_description)}
                  >
                    <td className="font-medium text-text1">{row.supplier_description}</td>
                    <td className="text-center font-mono text-xs text-text2">{row.supplier_code}</td>
                    <td className="tabular-nums text-right">{fmtNumber(row.totalSkus)}</td>
                    <td className="tabular-nums text-right text-success">{fmtNumber(row.okCount)}</td>
                    <td className="tabular-nums text-right">
                      {row.atRiskCount > 0
                        ? <span className="text-danger font-semibold">{fmtNumber(row.atRiskCount)}</span>
                        : <span className="text-text2">—</span>}
                    </td>
                    <td className="tabular-nums text-right">
                      {row.excessCount > 0
                        ? <span className="text-accent">{fmtNumber(row.excessCount)}</span>
                        : <span className="text-text2">—</span>}
                    </td>
                    <td className="tabular-nums text-right text-text2">{row.newItemCount > 0 ? fmtNumber(row.newItemCount) : '—'}</td>
                    <td className="tabular-nums text-right">
                      {row.totalBackorderUnits > 0
                        ? <span className="text-danger font-semibold">{fmtNumber(row.totalBackorderUnits)}</span>
                        : <span className="text-text2">—</span>}
                    </td>
                    <td className="tabular-nums text-right font-semibold">
                      {row.totalRecommendedQty > 0 ? fmtNumber(row.totalRecommendedQty) : <span className="text-text2">—</span>}
                    </td>
                    <td className="tabular-nums text-right">
                      {row.totalRecommendedValue > 0
                        ? <span className="font-semibold">{fmtCurrency(row.totalRecommendedValue)}</span>
                        : <span className="text-text2">—</span>}
                    </td>
                    <td className="tabular-nums text-right text-text2">{fmtCurrency(row.totalOnHandValue)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => navigate(`/purchasing/inventory?vendor=${encodeURIComponent(row.supplier_description)}`)}
                          className="btn-ghost text-[11px] py-1 px-2"
                          title="Open this vendor in Inventory Browser"
                        >
                          Browse
                        </button>
                        {row.atRiskCount > 0 && (
                          <button
                            onClick={() => openVendorTask(row)}
                            className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1"
                            title="Create vendor order task"
                          >
                            <Plus size={11} /> Task
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded SKU rows */}
                  {expandedVendor === row.supplier_description && (
                    <tr>
                      <td colSpan={12} className="p-0 bg-surface2/40">
                        <div className="px-4 py-2 overflow-x-auto">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-text2 border-b border-border">
                                <th className="text-left py-1 pr-3 font-semibold">SKU</th>
                                <th className="text-left py-1 pr-3 font-semibold">Description</th>
                                <th className="text-left py-1 pr-3 font-semibold">Category</th>
                                <th className="text-right py-1 pr-3 font-semibold">On Hand</th>
                                <th className="text-right py-1 pr-3 font-semibold">Days OH</th>
                                <th className="text-right py-1 pr-3 font-semibold">Rec. Order</th>
                                <th className="text-left py-1 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.records
                                .sort((a, b) => {
                                  // Sort: at-risk first, then by days on hand
                                  const aRisk = (a.status === 'Potential s/o' || a.status === 'Stocked out') ? 0 : 1
                                  const bRisk = (b.status === 'Potential s/o' || b.status === 'Stocked out') ? 0 : 1
                                  if (aRisk !== bRisk) return aRisk - bRisk
                                  return a.days_on_hand - b.days_on_hand
                                })
                                .map(r => (
                                  <tr
                                    key={r.id}
                                    className="border-b border-border/50 hover:bg-surface2 cursor-pointer"
                                    onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                                  >
                                    <td className="py-1 pr-3 font-mono text-accent">{r.product_code}</td>
                                    <td className="py-1 pr-3 text-text1 max-w-[200px] truncate">{r.description}</td>
                                    <td className="py-1 pr-3 text-text2 max-w-[140px] truncate">{r.category_name}</td>
                                    <td className="py-1 pr-3 tabular-nums text-right">{fmtNumber(r.on_hand)}</td>
                                    <td className="py-1 pr-3 tabular-nums text-right">
                                      <span className={r.days_on_hand <= 7 ? 'text-danger font-semibold' : r.days_on_hand <= 14 ? 'text-warning' : ''}>
                                        {r.days_on_hand}d
                                      </span>
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums text-right font-semibold">
                                      {r.recommended_order > 0 ? fmtNumber(r.recommended_order) : '—'}
                                    </td>
                                    <td className="py-1">
                                      <span className={
                                        r.status === 'Potential s/o' || r.status === 'Stocked out' ? 'text-danger font-semibold' :
                                        r.status === 'Ok' ? 'text-success' :
                                        r.status === 'Excess stock' || r.status === 'Surplus orders' ? 'text-accent' :
                                        'text-text2'
                                      }>{r.status}</span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {taskModal && (
        <TaskModal
          open={taskModal}
          onClose={() => { setTaskModal(false); setTaskVendor(''); setTaskVendorSkus([]) }}
          prefillVendor={taskVendor}
          prefillVendorSkus={taskVendorSkus}
          atRiskByVendor={atRiskByVendor}
        />
      )}
    </div>
  )
}
