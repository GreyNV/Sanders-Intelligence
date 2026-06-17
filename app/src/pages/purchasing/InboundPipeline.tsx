import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePOInboundItems } from '@/hooks/usePurchaseOrders'
import { useSkuMetrics } from '@/hooks/useSkuMetrics'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import StatusMultiSelect from '@/components/ui/StatusMultiSelect'
import { fmtCurrency, fmtNumber } from '@/lib/utils'
import { downloadCsv } from '@/lib/exportCsv'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, Download, ExternalLink, Search, Truck,
} from 'lucide-react'
import {
  buildInboundMonthBuckets,
  filterInboundItems,
  inboundDateText,
  inboundDaysUntil,
  inboundExpectedDate,
  inboundSku,
  inboundVendor,
  sortInboundItems,
  type InboundSortField,
  type InboundSortState,
} from './InboundPipeline.helpers'
import { buildPurchaseOrderHref } from './PurchaseOrders.helpers'

const ARRIVAL_FILTERS = [
  { value: 'all', label: 'All arrivals' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'near', label: '0-30 days' },
  { value: 'mid', label: '31-90 days' },
  { value: 'long', label: '90+ days' },
] as const
const PAGE_SIZE = 100

function SortIcon({ field, sort }: { field: InboundSortField; sort: InboundSortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={11} className="text-text2/50 ml-0.5" />
  return sort.dir === 'asc'
    ? <ArrowUp size={11} className="text-accent ml-0.5" />
    : <ArrowDown size={11} className="text-accent ml-0.5" />
}

function SortableTh({
  field, label, sort, onSort, className = '',
}: { field: InboundSortField; label: string; sort: InboundSortState; onSort: (f: InboundSortField) => void; className?: string }) {
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

export default function InboundPipeline() {
  const { data: inbound = [], isLoading, error } = usePOInboundItems()
  const { data: skuMetrics } = useSkuMetrics()

  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('All')
  const [statuses, setStatuses] = useState<string[]>([])
  const [arrival, setArrival] = useState<(typeof ARRIVAL_FILTERS)[number]['value']>('all')
  const [sort, setSort] = useState<InboundSortState>({ field: 'expected_delivery_date', dir: 'asc' })
  const [page, setPage] = useState(0)

  const vendors = useMemo(() =>
    ['All', ...Array.from(new Set(inbound.map(inboundVendor))).filter(Boolean).sort()]
  , [inbound])

  const statusOptions = useMemo(() =>
    Array.from(new Set(inbound.map(item => item.purchase_order?.receiving_status || item.receiving_status || 'Unknown'))).sort()
  , [inbound])

  const filteredInbound = useMemo(() =>
    filterInboundItems(inbound, { search, vendorFilter, statuses, arrival })
  , [inbound, search, vendorFilter, statuses, arrival])

  const sortedInbound = useMemo(() => sortInboundItems(filteredInbound, sort), [filteredInbound, sort])

  useEffect(() => {
    setPage(0)
  }, [search, vendorFilter, statuses, arrival])

  const totalUnitsOpen = filteredInbound.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0)
  const totalOrderValue = filteredInbound.reduce((sum, item) => sum + Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0), 0)
  const overdueUnits = filteredInbound
    .filter(item => {
      const dueDays = inboundDaysUntil(inboundExpectedDate(item))
      return dueDays != null && dueDays < 0
    })
    .reduce((sum, item) => sum + Number(item.qty_units_open ?? 0), 0)

  const byMonth = useMemo(() => buildInboundMonthBuckets(filteredInbound), [filteredInbound])

  const totalPages = Math.ceil(sortedInbound.length / PAGE_SIZE)
  const pagedInbound = sortedInbound.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(field: InboundSortField) {
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
      'SKU': inboundSku(item),
      'Source SKU': item.source_sku,
      'Product': item.product_name,
      'Vendor': inboundVendor(item),
      'Open Qty': item.qty_units_open,
      'Ordered Qty': item.qty_units_ordered,
      'Received Qty': item.qty_units_received,
      'Unit Price': item.unit_price,
      'Open Value': Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0),
      'Expected Delivery': inboundExpectedDate(item),
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
                const itemSku = inboundSku(item)
                const metricsKey = item.planning_sku || item.source_sku
                const price = skuMetrics?.priceBySku.get(metricsKey)
                const openValue = Number(item.qty_units_open ?? 0) * Number(item.unit_price ?? 0)

                return (
                  <tr key={item.id}>
                    <td>
                      <Link
                        to={buildPurchaseOrderHref(item.po_id)}
                        className="font-mono text-[11px] text-accent hover:underline inline-flex items-center gap-1"
                      >
                        #{item.po_id}
                        <ExternalLink size={10} />
                      </Link>
                    </td>
                    <td className="font-mono text-[11px]">{itemSku}</td>
                    <td className="max-w-[300px]">
                      <span className="block truncate" title={item.product_name ?? undefined}>{item.product_name ?? '-'}</span>
                    </td>
                    <td className="max-w-[220px]">
                      <span className="block truncate text-xs text-text2" title={inboundVendor(item)}>{inboundVendor(item)}</span>
                    </td>
                    <td className="tabular-nums font-semibold text-right">{fmtNumber(item.qty_units_open ?? 0)}</td>
                    <td className="tabular-nums text-right">{fmtNumber(item.qty_units_ordered ?? 0)}</td>
                    <td className="tabular-nums text-right">{fmtNumber(item.qty_units_received ?? 0)}</td>
                    <td className="text-xs">{inboundDateText(inboundExpectedDate(item))}</td>
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
