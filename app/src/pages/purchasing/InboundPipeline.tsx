import { useEffect, useMemo, useState } from 'react'
import { useInboundItems, useLatestUploadMeta } from '@/hooks/useInventory'
import { useSkuMetrics } from '@/hooks/useSkuMetrics'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import StatusMultiSelect from '@/components/ui/StatusMultiSelect'
import { fmtNumber, fmtCurrency, estimatedArrivalMonth, parseMonthLabel, groupBy } from '@/lib/utils'
import { downloadCsv, inventoryToExportRows } from '@/lib/exportCsv'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, Truck,
} from 'lucide-react'
import { InventoryRecord } from '@/types'

type SortDir = 'asc' | 'desc'
type SortField =
  | 'product_code'
  | 'description'
  | 'brand_name'
  | 'supplier_description'
  | 'on_order'
  | 'lt_days'
  | 'on_hand'
  | 'days_on_hand'
  | 'status'

interface SortState {
  field: SortField
  dir: SortDir
}

const ARRIVAL_FILTERS = [
  { value: 'all', label: 'All arrivals' },
  { value: 'near', label: '0-30 days' },
  { value: 'mid', label: '31-90 days' },
  { value: 'long', label: '90+ days' },
] as const
const PAGE_SIZE = 100

function SortIcon({ field, sort }: { field: SortField; sort: SortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={11} className="text-text2/50 ml-0.5" />
  return sort.dir === 'asc'
    ? <ArrowUp size={11} className="text-accent ml-0.5" />
    : <ArrowDown size={11} className="text-accent ml-0.5" />
}

function SortableTh({
  field, label, sort, onSort, className = '',
}: { field: SortField; label: string; sort: SortState; onSort: (f: SortField) => void; className?: string }) {
  return (
    <th
      className={`cursor-pointer select-none hover:text-text1 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <span className={`flex items-center gap-0.5 whitespace-nowrap ${className.includes('right') ? 'justify-end' : ''}`}>
        {label}
        <SortIcon field={field} sort={sort} />
      </span>
    </th>
  )
}

function sortValue(record: InventoryRecord, field: SortField): string | number {
  return record[field] ?? ''
}

export default function InboundPipeline() {
  const { data: inbound = [], isLoading, error } = useInboundItems()
  const { data: latestUpload } = useLatestUploadMeta()
  const { data: skuMetrics } = useSkuMetrics()
  const etaBaseline = latestUpload?.uploaded_at ?? new Date()

  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('All')
  const [vendor, setVendor] = useState('All')
  const [statuses, setStatuses] = useState<string[]>([])
  const [arrival, setArrival] = useState<(typeof ARRIVAL_FILTERS)[number]['value']>('all')
  const [sort, setSort] = useState<SortState>({ field: 'lt_days', dir: 'asc' })
  const [page, setPage] = useState(0)

  const brands = useMemo(() =>
    ['All', ...Array.from(new Set(inbound.map(r => r.brand_name))).filter(Boolean).sort()]
  , [inbound])

  const vendors = useMemo(() =>
    ['All', ...Array.from(new Set(inbound.map(r => r.supplier_description))).filter(Boolean).sort()]
  , [inbound])

  const statusOptions = useMemo(() =>
    Array.from(new Set(inbound.map(r => r.status))).filter(Boolean).sort()
  , [inbound])

  const filteredInbound = useMemo(() => {
    const q = search.trim().toLowerCase()

    return inbound.filter(r => {
      if (brand !== 'All' && r.brand_name !== brand) return false
      if (vendor !== 'All' && r.supplier_description !== vendor) return false
      if (statuses.length > 0 && !statuses.includes(r.status)) return false
      if (arrival === 'near' && r.lt_days > 30) return false
      if (arrival === 'mid' && (r.lt_days <= 30 || r.lt_days > 90)) return false
      if (arrival === 'long' && r.lt_days <= 90) return false

      if (!q) return true
      return (
        r.product_code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.brand_name.toLowerCase().includes(q) ||
        r.supplier_description.toLowerCase().includes(q)
      )
    })
  }, [inbound, search, brand, vendor, statuses, arrival])

  const sortedInbound = useMemo(() => {
    return [...filteredInbound].sort((a, b) => {
      const av = sortValue(a, sort.field)
      const bv = sortValue(b, sort.field)

      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av
      }

      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filteredInbound, sort])

  useEffect(() => {
    setPage(0)
  }, [search, brand, vendor, statuses, arrival])

  const totalUnitsOnOrder = filteredInbound.reduce((s, r) => s + r.on_order, 0)
  const totalOrderValue = filteredInbound.reduce((s, r) => s + r.cost_price * r.on_order, 0)

  const byMonth = useMemo(() => {
    const grouped = groupBy(filteredInbound, r => estimatedArrivalMonth(r.lt_days, etaBaseline))
    const raw = Object.entries(grouped)
      .map(([month, items]) => ({
        month,
        units: items.reduce((s, r) => s + r.on_order, 0),
        skus: items.length,
      }))
      .sort((a, b) => parseMonthLabel(a.month) - parseMonthLabel(b.month))

    // Fill in every calendar month between first and last so the x-axis has no gaps
    if (raw.length < 2) return raw
    const dataMap = new Map(raw.map(r => [r.month, r]))
    const filled: typeof raw = []
    const cursor = new Date(parseMonthLabel(raw[0].month))
    const endTs  = parseMonthLabel(raw[raw.length - 1].month)
    while (cursor.getTime() <= endTs) {
      const label = cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      filled.push(dataMap.get(label) ?? { month: label, units: 0, skus: 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return filled
  }, [filteredInbound, etaBaseline])

  const nearTerm = filteredInbound.filter(r => r.lt_days <= 30).reduce((s, r) => s + r.on_order, 0)
  const midTerm = filteredInbound.filter(r => r.lt_days > 30 && r.lt_days <= 90).reduce((s, r) => s + r.on_order, 0)
  const totalPages = Math.ceil(sortedInbound.length / PAGE_SIZE)
  const pagedInbound = sortedInbound.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(field: SortField) {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  function clearFilters() {
    setSearch('')
    setBrand('All')
    setVendor('All')
    setStatuses([])
    setArrival('all')
  }

  function MetricCurrency({ value }: { value: number | null | undefined }) {
    if (value == null || !Number.isFinite(value)) return <span className="text-text2">-</span>
    return <span className={value < 0 ? 'text-danger' : ''}>{fmtCurrency(value)}</span>
  }

  function handleExport() {
    const rows = inventoryToExportRows(sortedInbound)
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(rows, `inbound_pipeline_${date}.csv`)
  }

  const hasFilters = !!search || brand !== 'All' || vendor !== 'All' || statuses.length > 0 || arrival !== 'all'

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load inbound inventory</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text1 flex items-center gap-2">
            <Truck size={20} className="text-accent" /> Inbound Pipeline
          </h1>
          <p className="text-text2 text-sm mt-0.5">
            Open purchase orders - arrival estimated from lead time days
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={sortedInbound.length === 0}
          className="btn-secondary text-xs flex items-center gap-1.5"
          title="Export filtered inbound rows for Excel"
        >
          <Download size={13} /> Export Excel
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="SKUs On Order" value={fmtNumber(filteredInbound.length)} sub={`${fmtNumber(inbound.length)} total`} />
        <KPICard label="Units On Order" value={fmtNumber(totalUnitsOnOrder)} sub="filtered units" variant="info" />
        <KPICard label="Arriving <= 30d" value={fmtNumber(nearTerm)} sub="units near-term" variant="success" />
        <KPICard label="Arriving 31-90d" value={fmtNumber(midTerm)} sub="units mid-term" />
      </div>

      <div className="card mb-6">
        <h3 className="text-[13px] font-semibold mb-4">Units by Estimated Arrival Month</h3>
        {byMonth.length === 0 ? (
          <div className="text-center py-10 text-text2">No inbound items match the current filters</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMonth} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
              <XAxis dataKey="month" tick={{ fill: '#8890b5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8890b5', fontSize: 11 }} tickFormatter={v => fmtNumber(v)} />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                labelStyle={{ color: '#e8eaf6', fontWeight: 600 }}
                itemStyle={{ color: '#8890b5' }}
                formatter={(v: number) => [fmtNumber(v), 'Units']}
              />
              <Bar dataKey="units" fill="#6c8aff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
          <input
            className="input w-full pl-8 text-sm"
            placeholder="Search SKU, vendor, brand..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select text-sm" value={brand} onChange={e => setBrand(e.target.value)}>
          {brands.map(b => <option key={b} value={b}>{b === 'All' ? 'All brands' : b}</option>)}
        </select>
        <select className="select text-sm" value={vendor} onChange={e => setVendor(e.target.value)}>
          {vendors.map(v => <option key={v} value={v}>{v === 'All' ? 'All vendors' : v}</option>)}
        </select>
        <StatusMultiSelect options={statusOptions} selected={statuses} onChange={setStatuses} />
        <select className="select text-sm" value={arrival} onChange={e => setArrival(e.target.value as typeof arrival)}>
          {ARRIVAL_FILTERS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="btn-ghost text-xs text-danger">
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-text2">
          {fmtNumber(sortedInbound.length)} SKU{sortedInbound.length !== 1 ? 's' : ''} - {fmtCurrency(totalOrderValue)} est. value
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <SortableTh field="product_code" label="SKU" sort={sort} onSort={toggleSort} />
              <SortableTh field="description" label="Description" sort={sort} onSort={toggleSort} />
              <SortableTh field="brand_name" label="Brand" sort={sort} onSort={toggleSort} />
              <SortableTh field="supplier_description" label="Vendor" sort={sort} onSort={toggleSort} />
              <SortableTh field="on_order" label="On Order" sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="lt_days" label="Lead Time" sort={sort} onSort={toggleSort} className="text-right" />
              <th>Est. Arrival</th>
              <SortableTh field="on_hand" label="On Hand" sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="days_on_hand" label="Days OH" sort={sort} onSort={toggleSort} className="text-right" />
              <th>Sell Price</th>
              <th>Profit Today</th>
              <th>Profit 7d</th>
              <th>Profit 30d</th>
              <SortableTh field="status" label="Status" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedInbound.length === 0 ? (
              <tr><td colSpan={14} className="py-10 text-center text-text2">No inbound items match the current filters</td></tr>
            ) : (
              pagedInbound.map(r => {
                const profit = skuMetrics?.profitBySku.get(r.product_code)
                const price = skuMetrics?.priceBySku.get(r.product_code)

                return (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px] text-accent">{r.product_code}</td>
                    <td className="max-w-[260px]">
                      <span className="block truncate" title={r.description}>{r.description}</span>
                    </td>
                    <td className="text-xs text-text2">{r.brand_name}</td>
                    <td className="max-w-[220px]">
                      <span className="block truncate text-xs text-text2" title={r.supplier_description}>{r.supplier_description}</span>
                    </td>
                    <td className="tabular-nums font-semibold text-right">{fmtNumber(r.on_order)}</td>
                    <td className="tabular-nums text-text2 text-right">{r.lt_days}d</td>
                    <td className="text-xs">{estimatedArrivalMonth(r.lt_days, etaBaseline)}</td>
                    <td className="tabular-nums text-right">{fmtNumber(r.on_hand)}</td>
                    <td className="tabular-nums text-right">{r.days_on_hand}d</td>
                    <td className="tabular-nums" title={price?.price_source ?? undefined}>
                      <MetricCurrency value={price?.selling_price} />
                    </td>
                    <td className="tabular-nums"><MetricCurrency value={profit?.accrual_profit_today} /></td>
                    <td className="tabular-nums"><MetricCurrency value={profit?.accrual_profit_7d} /></td>
                    <td className="tabular-nums"><MetricCurrency value={profit?.accrual_profit_30d} /></td>
                    <td className="text-xs">
                      <span className={
                        r.status === 'Potential s/o' || r.status === 'Stocked out' ? 'text-danger font-semibold' :
                        r.status === 'Ok' ? 'text-success' :
                        r.status === 'Excess stock' || r.status === 'Surplus orders' ? 'text-accent' :
                        'text-text2'
                      }>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-text2">
          <span>Page {page + 1} of {totalPages} - {fmtNumber(sortedInbound.length)} results</span>
          <div className="flex gap-2">
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
