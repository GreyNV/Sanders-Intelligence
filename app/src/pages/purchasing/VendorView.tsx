import { useEffect, useState, useMemo, Fragment } from 'react'
import { useInventoryAnalysis } from '@/hooks/useInventory'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { StatusBadges } from '@/components/ui/Badge'
import { fmtNumber, fmtCurrency, groupBy } from '@/lib/utils'
import TaskModal from '@/components/tasks/TaskModal'
import {
  AlertTriangle, ArrowUp, ArrowDown, ChevronsUpDown, Plus, Search, Store,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { InventoryRecord } from '@/types'
import { getVendorSkuRows, getVendorViewAtRiskSkus, type VendorSkuSortState } from './VendorView.helpers'

type SortDir = 'asc' | 'desc'
interface SortState { field: string; dir: SortDir }
const PAGE_SIZE = 50

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
  const { data: inventory, isLoading, error } = useInventoryAnalysis()
  const records = inventory.records
  const navigate = useNavigate()

  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategory] = useState('')
  const [sort, setSort]           = useState<SortState>({ field: 'totalRecommendedValue', dir: 'desc' })
  const [taskModal, setTaskModal] = useState(false)
  const [taskVendor, setTaskVendor]   = useState('')
  const [taskVendorSkus, setTaskVendorSkus] = useState<InventoryRecord[]>([])
  const [expandedVendor, setExpanded] = useState<string | null>(null)
  const [expandedSkuSearch, setExpandedSkuSearch] = useState('')
  const [expandedSkuSort, setExpandedSkuSort] = useState<VendorSkuSortState>({ field: 'recommended_order_value', dir: 'desc' })
  const [expandedSkuStatus, setExpandedSkuStatus] = useState('')
  const [expandedSkuCategory, setExpandedSkuCategory] = useState('')
  const [page, setPage] = useState(0)

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
        atRiskCount:          getVendorViewAtRiskSkus(items).length,
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

  // At-risk map per vendor uses the same scoped rows and status definition as the displayed count.
  const atRiskByVendor = useMemo(() => {
    return Object.fromEntries(
      vendorRows.map(row => [
        row.supplier_description,
        getVendorViewAtRiskSkus(row.records),
      ])
    )
  }, [vendorRows])

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

  useEffect(() => {
    setPage(0)
    setExpanded(null)
  }, [search, categoryFilter, sort])

  function toggleSort(field: string) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
  }

  function toggleSkuSort(field: VendorSkuSortState['field']) {
    setExpandedSkuSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: field === 'recommended_order_value' ? 'desc' : 'asc' })
  }

  function openVendorTask(row: VendorRow) {
    setTaskVendor(row.supplier_description)
    setTaskVendorSkus(getVendorViewAtRiskSkus(row.records))
    setTaskModal(true)
  }

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load vendor data</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  // Summary KPIs
  const totalVendors  = vendorRows.length
  const vendorsAtRisk = vendorRows.filter(r => r.atRiskCount > 0).length
  const totalRecQty   = vendorRows.reduce((s, r) => s + r.totalRecommendedQty, 0)
  const totalRecVal   = vendorRows.reduce((s, r) => s + r.totalRecommendedValue, 0)
  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE)
  const pagedRows = displayRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
              pagedRows.map(row => {
                const expandedSkuRows = getVendorSkuRows(row.records, expandedSkuSearch, expandedSkuSort, {
                  status: expandedSkuStatus,
                  category: expandedSkuCategory,
                })
                const expandedCategories = Array.from(new Set(row.records.map(r => r.category_name).filter(Boolean))).sort()

                return (
                <Fragment key={row.supplier_code || row.supplier_description}>
                  <tr
                    className={`cursor-pointer ${expandedVendor === row.supplier_description ? 'bg-surface2/60' : ''}`}
                    onClick={() => {
                      setExpanded(v => v === row.supplier_description ? null : row.supplier_description)
                      setExpandedSkuSearch('')
                      setExpandedSkuSort({ field: 'recommended_order_value', dir: 'desc' })
                      setExpandedSkuStatus('')
                      setExpandedSkuCategory('')
                    }}
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
                        <div className="px-4 py-2">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className="relative max-w-xs flex-1 min-w-0">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text2" />
                              <input
                                className="input w-full pl-8 py-1.5 text-xs"
                                placeholder="Filter SKUs, description, category…"
                                value={expandedSkuSearch}
                                onChange={e => setExpandedSkuSearch(e.target.value)}
                              />
                            </div>
                            <select
                              className="select py-1.5 text-xs"
                              value={expandedSkuStatus}
                              onChange={e => setExpandedSkuStatus(e.target.value)}
                            >
                              <option value="">All statuses</option>
                              {[...new Set(row.records.map(r => r.status))].sort().map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            <select
                              className="select py-1.5 text-xs"
                              value={expandedSkuCategory}
                              onChange={e => setExpandedSkuCategory(e.target.value)}
                            >
                              <option value="">All categories</option>
                              {expandedCategories.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            {(expandedSkuSearch || expandedSkuStatus || expandedSkuCategory) && (
                              <button
                                className="btn-ghost text-xs text-danger"
                                onClick={() => { setExpandedSkuSearch(''); setExpandedSkuStatus(''); setExpandedSkuCategory('') }}
                              >
                                Clear
                              </button>
                            )}
                            <span className="ml-auto text-xs text-text2">
                              {fmtNumber(expandedSkuRows.length)} SKU{expandedSkuRows.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-text2 border-b border-border">
                                <SortableTh field="product_code" label="SKU" sort={expandedSkuSort} onSort={() => toggleSkuSort('product_code')} className="text-left py-1 pr-3 font-semibold" />
                                <SortableTh field="description" label="Description" sort={expandedSkuSort} onSort={() => toggleSkuSort('description')} className="text-left py-1 pr-3 font-semibold" />
                                <SortableTh field="category_name" label="Category" sort={expandedSkuSort} onSort={() => toggleSkuSort('category_name')} className="text-left py-1 pr-3 font-semibold" />
                                <SortableTh field="status" label="Status" sort={expandedSkuSort} onSort={() => toggleSkuSort('status')} className="text-left py-1 pr-3 font-semibold" />
                                <SortableTh field="on_hand" label="On Hand" sort={expandedSkuSort} onSort={() => toggleSkuSort('on_hand')} className="text-right py-1 pr-3 font-semibold" />
                                <SortableTh field="days_on_hand" label="Days OH" sort={expandedSkuSort} onSort={() => toggleSkuSort('days_on_hand')} className="text-right py-1 pr-3 font-semibold" />
                                <SortableTh field="recommended_order" label="Rec. Order Qty" sort={expandedSkuSort} onSort={() => toggleSkuSort('recommended_order')} className="text-right py-1 pr-3 font-semibold" />
                                <SortableTh field="recommended_order_value" label="Rec. Order Value" sort={expandedSkuSort} onSort={() => toggleSkuSort('recommended_order_value')} className="text-right py-1 font-semibold" />
                              </tr>
                            </thead>
                            <tbody>
                              {expandedSkuRows.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="py-6 text-center text-text2">
                                    No SKUs match this filter
                                  </td>
                                </tr>
                              ) : (
                                expandedSkuRows.map(r => (
                                  <tr
                                    key={r.id}
                                    className="border-b border-border/50 hover:bg-surface2 cursor-pointer"
                                    onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                                  >
                                    <td className="py-1 pr-3 font-mono text-accent">{r.product_code}</td>
                                    <td className="py-1 pr-3 text-text1 max-w-[200px] truncate">{r.description}</td>
                                    <td className="py-1 pr-3 text-text2 max-w-[140px] truncate">{r.category_name}</td>
                                    <td className="py-1 pr-3">
                                      <StatusBadges record={r} />
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums text-right">{fmtNumber(r.on_hand)}</td>
                                    <td className="py-1 pr-3 tabular-nums text-right">
                                      <span className={r.days_on_hand <= 7 ? 'text-danger font-semibold' : r.days_on_hand <= 14 ? 'text-warning' : ''}>
                                        {r.days_on_hand}d
                                      </span>
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums text-right font-semibold">
                                      {r.recommended_order > 0 ? fmtNumber(r.recommended_order) : '—'}
                                    </td>
                                    <td className="py-1 tabular-nums text-right">{fmtCurrency(r.recommended_order_value)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-text2">
          <span>Page {page + 1} of {totalPages} - {fmtNumber(displayRows.length)} vendors</span>
          <div className="flex gap-2">
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {taskModal && (
        <TaskModal
          open={taskModal}
          onClose={() => { setTaskModal(false); setTaskVendor(''); setTaskVendorSkus([]) }}
          prefillVendor={taskVendor}
          prefillVendorSkus={taskVendorSkus}
          atRiskByVendor={atRiskByVendor}
          availableSkus={records}
        />
      )}
    </div>
  )
}
