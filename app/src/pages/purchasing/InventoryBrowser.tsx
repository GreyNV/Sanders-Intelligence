import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useInventory, useInventoryKPIs } from '@/hooks/useInventory'
import KPICard from '@/components/ui/KPICard'
import Badge, { statusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency } from '@/lib/utils'
import { downloadCsv, inventoryToExportRows } from '@/lib/exportCsv'
import { Search, Download } from 'lucide-react'

const STATUS_OPTIONS    = ['All', 'Ok', 'Excess stock', 'Surplus orders', 'Potential s/o', 'Stocked out', 'New item']
const CLASS_OPTIONS     = ['All', 'A', 'B', 'C', 'X', 'S']
const VELOCITY_OPTIONS  = ['All', 'H', 'M', 'L', 'X']
const PAGE_SIZE         = 100

export default function InventoryBrowser() {
  const { data: records = [], isLoading, error } = useInventory()
  const kpis = useInventoryKPIs()
  const location = useLocation()

  // Pre-fill filters from URL params (used by chart drill-throughs and SKU links)
  const urlParams    = new URLSearchParams(location.search)
  const initStatus   = urlParams.get('status') ?? 'All'
  const initSearch   = urlParams.get('search') ?? ''
  const initBrand    = urlParams.get('brand')  ?? 'All'
  const initVendor   = urlParams.get('vendor') ?? 'All'

  const [search, setSearch]       = useState(initSearch)
  const [status, setStatus]       = useState(initStatus)
  const [cls, setCls]             = useState('All')
  const [velocity, setVelocity]   = useState('All')
  const [brand, setBrand]         = useState(initBrand)
  const [vendor, setVendor]       = useState(initVendor)
  const [page, setPage]           = useState(0)
  const [sortKey, setSortKey]     = useState<string>('days_on_hand')
  const [sortAsc, setSortAsc]     = useState(true)

  // Re-apply URL params when location changes (e.g. navigating from Vendor View)
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    setSearch(p.get('search') ?? '')
    setStatus(p.get('status') ?? 'All')
    setBrand(p.get('brand')  ?? 'All')
    setVendor(p.get('vendor') ?? 'All')
    setPage(0)
  }, [location.search])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      if (status !== 'All' && r.status !== status) return false
      if (cls !== 'All' && r.classification !== cls) return false
      if (velocity !== 'All' && r.velocity !== velocity) return false
      if (brand !== 'All' && r.brand_name !== brand) return false
      if (vendor !== 'All' && r.supplier_description !== vendor) return false
      if (q) {
        return (
          r.product_code.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.supplier_description.toLowerCase().includes(q) ||
          r.brand_name.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [records, search, status, cls, velocity, brand, vendor])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string,unknown>)[sortKey]
      const bv = (b as unknown as Record<string,unknown>)[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortAsc])

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <div className="text-danger font-semibold mb-2">Failed to load inventory</div>
      <div className="text-text2 text-sm">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  // Unique brands and vendors from data
  const brands  = ['All', ...Array.from(new Set(records.map(r => r.brand_name))).filter(Boolean).sort()]
  const vendors = ['All', ...Array.from(new Set(records.map(r => r.supplier_description))).filter(Boolean).sort()]

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  function SortTh({ col, label }: { col: string; label: string }) {
    const active = sortKey === col
    return (
      <th onClick={() => toggleSort(col)} className="cursor-pointer select-none">
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    )
  }

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function resetPage() { setPage(0) }

  function handleExport() {
    const rows = inventoryToExportRows(sorted)
    const label = status !== 'All' ? status.replace(/\s/g, '_') : 'all'
    downloadCsv(rows, `inventory_${label}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text1">Inventory Browser</h1>
          <p className="text-text2 text-sm mt-0.5">{fmtNumber(filtered.length)} SKUs shown · {fmtNumber(records.length)} total</p>
        </div>
        <button
          onClick={handleExport}
          className="btn-secondary text-xs flex items-center gap-1.5"
          title="Export current filtered view to CSV (opens in Excel)"
        >
          <Download size={13} /> Export to Excel
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KPICard label="Total SKUs"       value={fmtNumber(kpis.totalSkus)}       sub="in this upload" />
        <KPICard label="Total On-Hand"    value={fmtNumber(kpis.totalUnits)}       sub="units" variant="default" />
        <KPICard label="Inventory Value"  value={fmtCurrency(kpis.totalOnHandValue)} sub="at cost" />
        <KPICard label="Fill Rate"        value={`${kpis.fillRate.toFixed(1)}%`}   sub="SKUs with adequate stock" variant={kpis.fillRate >= 80 ? 'success' : 'warning'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
          <input
            className="input w-full pl-9"
            placeholder="Search SKU, description, brand, supplier…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
          />
        </div>
        <select className="select" value={status} onChange={e => { setStatus(e.target.value); resetPage() }}>
          {STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select className="select" value={brand} onChange={e => { setBrand(e.target.value); resetPage() }}>
          {brands.map(o => <option key={o}>{o}</option>)}
        </select>
        <select className="select" value={vendor} onChange={e => { setVendor(e.target.value); resetPage() }}>
          {vendors.map(o => <option key={o} value={o}>{o === 'All' ? 'All vendors' : o}</option>)}
        </select>
        <select className="select" value={cls} onChange={e => { setCls(e.target.value); resetPage() }}>
          {CLASS_OPTIONS.map(o => <option key={o} value={o}>Class: {o}</option>)}
        </select>
        <select className="select" value={velocity} onChange={e => { setVelocity(e.target.value); resetPage() }}>
          {VELOCITY_OPTIONS.map(o => <option key={o} value={o}>Velocity: {o}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <SortTh col="product_code"  label="SKU" />
              <th>Description</th>
              <SortTh col="brand_name"    label="Brand" />
              <SortTh col="on_hand"       label="On Hand" />
              <SortTh col="days_on_hand"  label="Days OH" />
              <th>Status</th>
              <SortTh col="recommended_order"       label="Rec. Order" />
              <SortTh col="average_sales"           label="Avg/mo" />
              <th>Avg/day</th>
              <SortTh col="on_order"                label="On Order" />
              <SortTh col="unsatisfied_customer_orders_units" label="Backorders" />
              <SortTh col="cost_price"              label="Cost" />
              <th>Cls</th>
              <th>Vel</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={14} className="py-10 text-center text-text2">No records match filters</td></tr>
            ) : (
              paged.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-[11px] text-accent whitespace-nowrap">{r.product_code}</td>
                  <td className="max-w-[240px]">
                    <span className="block truncate text-text1 text-[12px]" title={r.description}>{r.description}</span>
                    <span className="text-[10px] text-text2">{r.supplier_description}</span>
                  </td>
                  <td className="text-xs text-text2 whitespace-nowrap">{r.brand_name}</td>
                  <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                  <td className="tabular-nums">
                    <span className={r.days_on_hand <= 7 ? 'text-danger font-semibold' : r.days_on_hand <= 14 ? 'text-warning' : ''}>
                      {r.days_on_hand}
                    </span>
                  </td>
                  <td><Badge variant={statusVariant(r.status)} value={r.status} /></td>
                  <td className="tabular-nums">
                    {r.recommended_order > 0
                      ? <span className="font-semibold">{fmtNumber(r.recommended_order)}</span>
                      : <span className="text-text2">—</span>
                    }
                  </td>
                  <td className="tabular-nums text-text2">{r.average_sales.toFixed(1)}</td>
                  <td className="tabular-nums text-text2">{(r.average_sales / 30).toFixed(2)}</td>
                  <td className="tabular-nums">{r.on_order > 0 ? fmtNumber(r.on_order) : <span className="text-text2">—</span>}</td>
                  <td className="tabular-nums">
                    {r.unsatisfied_customer_orders_units > 0
                      ? <span className="text-danger font-semibold">{fmtNumber(r.unsatisfied_customer_orders_units)}</span>
                      : <span className="text-text2">—</span>
                    }
                  </td>
                  <td className="tabular-nums text-text2">{fmtCurrency(r.cost_price)}</td>
                  <td className="text-xs text-text2">{r.classification}</td>
                  <td className="text-xs text-text2">{r.velocity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-text2">
          <span>Page {page + 1} of {totalPages} · {fmtNumber(filtered.length)} results</span>
          <div className="flex gap-2">
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
