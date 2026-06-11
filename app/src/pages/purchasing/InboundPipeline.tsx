import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePOInboundItems } from '@/hooks/usePurchaseOrders'
import { useSkuMetrics } from '@/hooks/useSkuMetrics'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import StatusMultiSelect from '@/components/ui/StatusMultiSelect'
import { fmtCurrency, fmtNumber, groupBy, parseMonthLabel } from '@/lib/utils'
import { downloadCsv } from '@/lib/exportCsv'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, Download, ExternalLink, Search, Truck,
} from 'lucide-react'
import type { POInboundItem } from '@/types'

type SortDir = 'asc' | 'desc'
type SortField =
  | 'sku'
  | 'product_name'
  | 'vendor'
  | 'qty_units_open'
  | 'expected_delivery_date'
  | 'po_id'
  | 'unit_price'
  | 'receiving_status'

interface SortState {
  field: SortField
  dir: SortDir
}

const ARRIVAL_FILTERS = [
  { value: 'all', label: 'All arrivals' },
  { value: 'overdue', label: 'Overdue' },
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

function sku(item: POInboundItem): string {
  return item.planning_sku || item.source_sku
}

function vendor(item: POInboundItem): string {
  return item.purchase_order?.vendor_name || String(item.purchase_order?.vendor_id ?? '-')
}

function expectedDate(item: POInboundItem): string | null {
  return item.expected_delivery_date || item.purchase_order?.expected_delivery_date || null
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  if (!Number.isFinite(target.getTime())) return null
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function monthLabel(value: string | null): string {
  if (!value) return 'No ETA'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function dateText(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '-'
}

function sortValue(item: POInboundItem, field: SortField): string | number {
  if (field === 'sku') return sku(item)
  if (field === 'vendor') return vendor(item)
  if (field === 'expected_delivery_date') return expectedDate(item) ?? ''
  if (field === 'receiving_status') return item.receiving_status || item.purchase_order?.receiving_status || ''
  return item[field] ?? ''
}

export default function InboundPipeline() {
  const { data: inbound = [], isLoading, error } = usePOInboundItems()
  const { data: skuMetrics } = useSkuMetrics()

  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [statuses, setStatuses] = useState<string[]>([])
  const [arrival, setArrival] = useState<(typeof ARRIVAL_FILTERS)[number]['value']>('all')
  const [sort, setSort] = useState<SortState>({ field: 'expected_delivery_date', dir: 'asc' })
  const [page, setPage] = useState(0)

  const vendors = useMemo(() =>
    ['All', ...Array.from(new Set(inbound.map(vendor))).filter(Boolean).sort()]
  , [inbound])

  const statusOptions = useMemo(() =>
    Array.from(new Set(inbound.map(item => item.purchase_order?.receiving_status || item.receiving_status || 'Unknown'))).sort()
  , [inbound])

  const filteredInbound = useMemo(() => {
    const q = search.trim().toLowerCase()

    return inbound.filter(item => {
      const itemSku = sku(item)
      const itemVendor = vendor(item)
      const status = item.purchase_order?.receiving_status || item.receiving_status || 'Unknown'
      const dueDays = daysUntil(expectedDate(item))

      if (vendorFilter !== 'All' && itemVendor !== vendorFilter) return false
      if (statuses.length > 0 && !statuses.includes(status)) return false
      if (arrival === 'overdue' && (dueDays == null || dueDays >= 0)) return false
      if (arrival === 'near' && (dueDays == null || dueDays < 0 || dueDays > 30)) return false
      if (arrival === 'mid' && (dueDays == null || dueDays <= 30 || dueDays > 90)) return false
      if (arrival === 'long' && (dueDays == null || dueDays <= 90)) return false

      if (!q) return true
      return (
        itemSku.toLowerCase().includes(q) ||
        item.source_sku.toLowerCase().includes(q) ||
        String(item.po_id).includes(q) ||
        (item.product_name ?? '').toLowerCase().includes(q) ||
        itemVendor.toLowerCase().includes(q)
      )
    })
  }, [inbound, search, vendorFilter, statuses, arrival])

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
  }, [search, vendorFilter, statuses, arrival])

  const totalUnitsOpen = filteredInbound.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0)
  const totalOrderValue = filteredInbound.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0), 0)
  const overdueUnits = filteredInbound
    .filter(item => {
      const dueDays = daysUntil(expectedDate(item))
      return dueDays != null && dueDays < 0
    })
    .reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0)

  const byMonth = useMemo(() => {
    const grouped = groupBy(filteredInbound, item => monthLabel(expectedDate(item)))
    return Object.entries(grouped)
      .map(([month, items]) => ({
        month,
        units: items.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0),
        skus: new Set(items.map(sku)).size,
      }))
      .sort((a, b) => {
        if (a.month === 'No ETA') return 1
        if (b.month === 'No ETA') return -1
        return parseMonthLabel(a.month) - parseMonthLabel(b.month)
      })
  }, [filteredInbound])

  const totalPages = Math.ceil(sortedInbound.length / PAGE_SIZE)
  const pagedInbound = sortedInbound.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(field: SortField) {
    setSort(current => current.field === field ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  function clearFilters() {
    setSearch('')
    setVendorFilter('All')
    setStatuses([])
    setArrival('all')
  }

  function handleExport() {
    const rows = sortedInbound.map(item => ({
      'PO': item.po_id,
      'SKU': sku(item),
      'Source SKU': item.source_sku,
      'Product': item.product_name,
      'Vendor': vendor(item),
      'Open Qty': item.qty_units_open,
      'Ordered Qty': item.qty_units_ordered,
      'Received Qty': item.qty_units_received,
      'Unit Price': item.unit_price,
      'Open Value': Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0),
      'Expected Delivery': expectedDate(item),
      'PO Status': item.purchase_order?.po_status,
      'Shipping': item.purchase_order?.shipping_status,
      'Receiving': item.purchase_order?.receiving_status || item.receiving_status,
    }))
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(rows, `sellercloud_inbound_${date}`)
  }

  const hasFilters = !!search || vendorFilter !== 'All' || statuses.length > 0 || arrival !== 'all'

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
            Active SellerCloud purchase order lines with open units.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={sortedInbound.length === 0}
          className="btn-secondary text-xs flex items-center gap-1.5"
          title="Export filtered SellerCloud inbound rows for Excel"
        >
          <Download size={13} /> Export Excel
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Open PO Lines" value={fmtNumber(filteredInbound.length)} sub={`${fmtNumber(inbound.length)} total`} />
        <KPICard label="Open Units" value={fmtNumber(totalUnitsOpen)} sub="filtered units" variant="info" />
        <KPICard label="Overdue Units" value={fmtNumber(overdueUnits)} sub="past expected date" variant={overdueUnits > 0 ? 'warning' : 'success'} />
        <KPICard label="Open Value" value={fmtCurrency(totalOrderValue)} sub="qty open x unit cost" />
      </div>

      <div className="card mb-6">
        <h3 className="text-[13px] font-semibold mb-4">Open Units by Expected Delivery Month</h3>
        {byMonth.length === 0 ? (
          <div className="text-center py-10 text-text2">No inbound items match the current filters</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMonth} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
              <XAxis dataKey="month" tick={{ fill: '#8890b5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8890b5', fontSize: 11 }} tickFormatter={value => fmtNumber(value)} />
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                labelStyle={{ color: '#e8eaf6', fontWeight: 600 }}
                itemStyle={{ color: '#8890b5' }}
                formatter={(value: number) => [fmtNumber(value), 'Open Units']}
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
            placeholder="Search SKU, PO, vendor..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <select className="select text-sm" value={vendorFilter} onChange={event => setVendorFilter(event.target.value)}>
          {vendors.map(value => <option key={value} value={value}>{value === 'All' ? 'All vendors' : value}</option>)}
        </select>
        <StatusMultiSelect options={statusOptions} selected={statuses} onChange={setStatuses} />
        <select className="select text-sm" value={arrival} onChange={event => setArrival(event.target.value as typeof arrival)}>
          {ARRIVAL_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {hasFilters && <button onClick={clearFilters} className="btn-ghost text-xs text-danger">Clear filters</button>}
        <span className="ml-auto text-xs text-text2">
          {fmtNumber(sortedInbound.length)} line{sortedInbound.length === 1 ? '' : 's'} - {fmtCurrency(totalOrderValue)} open value
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <SortableTh field="po_id" label="PO" sort={sort} onSort={toggleSort} />
              <SortableTh field="sku" label="SKU" sort={sort} onSort={toggleSort} />
              <SortableTh field="product_name" label="Product" sort={sort} onSort={toggleSort} />
              <SortableTh field="vendor" label="Vendor" sort={sort} onSort={toggleSort} />
              <SortableTh field="qty_units_open" label="Open Qty" sort={sort} onSort={toggleSort} className="text-right" />
              <th className="text-right">Ordered</th>
              <th className="text-right">Received</th>
              <SortableTh field="expected_delivery_date" label="Expected" sort={sort} onSort={toggleSort} />
              <SortableTh field="unit_price" label="Unit Cost" sort={sort} onSort={toggleSort} className="text-right" />
              <th className="text-right">Open Value</th>
              <SortableTh field="receiving_status" label="Receiving" sort={sort} onSort={toggleSort} />
              <th>SKU Link</th>
            </tr>
          </thead>
          <tbody>
            {sortedInbound.length === 0 ? (
              <tr><td colSpan={12} className="py-10 text-center text-text2">No SellerCloud inbound items match the current filters</td></tr>
            ) : (
              pagedInbound.map(item => {
                const itemSku = sku(item)
                const metricsKey = item.planning_sku || item.source_sku
                const price = skuMetrics?.priceBySku.get(metricsKey)
                const openValue = Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0)

                return (
                  <tr key={item.id}>
                    <td className="font-mono text-[11px] text-accent">#{item.po_id}</td>
                    <td className="font-mono text-[11px]">{itemSku}</td>
                    <td className="max-w-[300px]">
                      <span className="block truncate" title={item.product_name ?? undefined}>{item.product_name ?? '-'}</span>
                    </td>
                    <td className="max-w-[220px]">
                      <span className="block truncate text-xs text-text2" title={vendor(item)}>{vendor(item)}</span>
                    </td>
                    <td className="tabular-nums font-semibold text-right">{fmtNumber(item.qty_units_open ?? 0)}</td>
                    <td className="tabular-nums text-right">{fmtNumber(item.qty_units_ordered ?? 0)}</td>
                    <td className="tabular-nums text-right">{fmtNumber(item.qty_units_received ?? 0)}</td>
                    <td className="text-xs">{dateText(expectedDate(item))}</td>
                    <td className="tabular-nums text-right" title={price?.price_source ?? undefined}>{fmtCurrency(item.unit_price ?? 0)}</td>
                    <td className="tabular-nums text-right">{fmtCurrency(openValue)}</td>
                    <td className="text-xs text-text2">{item.purchase_order?.receiving_status || item.receiving_status || '-'}</td>
                    <td>
                      {item.planning_sku ? (
                        <Link
                          to={`/purchasing/inventory?search=${encodeURIComponent(item.planning_sku)}`}
                          className="font-mono text-[11px] text-accent hover:underline inline-flex items-center gap-1"
                        >
                          Inventory <ExternalLink size={10} />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-warning">Unmatched</span>
                      )}
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
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(current => current + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
