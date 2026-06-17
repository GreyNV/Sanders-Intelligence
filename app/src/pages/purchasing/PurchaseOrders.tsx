import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, PackageCheck,
  RefreshCw, Search, ShoppingCart, TriangleAlert,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePurchaseOrderItems, usePurchaseOrders, useSyncPurchaseOrders } from '@/hooks/usePurchaseOrders'
import Badge from '@/components/ui/Badge'
import KPICard from '@/components/ui/KPICard'
import Modal from '@/components/ui/Modal'
import StatusMultiSelect from '@/components/ui/StatusMultiSelect'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtCurrency, fmtCurrencyFull, fmtDate, fmtNumber } from '@/lib/utils'
import type { POItem, PurchaseOrder } from '@/types'
import {
  countUnmatchedPOItems,
  filterPurchaseOrders,
  formatPOStatus,
  parsePurchaseOrderParam,
  poLineTotal,
  poStatusVariant,
  PurchaseOrderSortField,
  PurchaseOrderSortState,
  summarizePurchaseOrders,
  sortPurchaseOrders,
} from './PurchaseOrders.helpers'

const PAGE_SIZE = 100

function SortIcon({ field, sort }: { field: PurchaseOrderSortField; sort: PurchaseOrderSortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={11} className="text-text2/50 ml-0.5" />
  return sort.dir === 'asc'
    ? <ArrowUp size={11} className="text-accent ml-0.5" />
    : <ArrowDown size={11} className="text-accent ml-0.5" />
}

function SortableTh({
  field, label, sort, onSort, className = '',
}: { field: PurchaseOrderSortField; label: string; sort: PurchaseOrderSortState; onSort: (field: PurchaseOrderSortField) => void; className?: string }) {
  return (
    <th className={`cursor-pointer select-none hover:text-text1 transition-colors ${className}`} onClick={() => onSort(field)}>
      <span className={`flex items-center gap-0.5 whitespace-nowrap ${className.includes('right') ? 'justify-end' : ''}`}>
        {label}
        <SortIcon field={field} sort={sort} />
      </span>
    </th>
  )
}

function dateText(value: string | null) {
  return value ? fmtDate(value) : '-'
}

function moneyText(value: number | null) {
  return value == null ? '-' : fmtCurrency(value)
}

export default function PurchaseOrders() {
  const { profile } = useAuth()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<PurchaseOrderSortState>({ field: 'date_ordered', dir: 'desc' })
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)

  const { data: orders = [], isLoading, error } = usePurchaseOrders({ statuses, dateFrom, dateTo })
  const syncPOs = useSyncPurchaseOrders()
  const urlPOId = useMemo(() => parsePurchaseOrderParam(new URLSearchParams(location.search).get('po')), [location.search])

  const statusOptions = useMemo(() =>
    Array.from(new Set(orders.map(order => order.po_status))).filter(Boolean).sort()
  , [orders])

  const filteredOrders = useMemo(() =>
    filterPurchaseOrders(orders, { query: search, statuses, dateFrom, dateTo })
  , [orders, search, statuses, dateFrom, dateTo])

  const sortedOrders = useMemo(() => sortPurchaseOrders(filteredOrders, sort), [filteredOrders, sort])
  const summary = useMemo(() => summarizePurchaseOrders(filteredOrders), [filteredOrders])
  const totalPages = Math.ceil(sortedOrders.length / PAGE_SIZE)
  const pagedOrders = sortedOrders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    if (!urlPOId || selected?.id === urlPOId) return
    const order = orders.find(candidate => candidate.id === urlPOId)
    if (order) {
      setSelected(order)
      setSearch(String(urlPOId))
      setPage(0)
    }
  }, [orders, selected?.id, urlPOId])

  function toggleSort(field: PurchaseOrderSortField) {
    setSort(current => current.field === field
      ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' })
  }

  function clearFilters() {
    setSearch('')
    setStatuses([])
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  const hasFilters = !!search || statuses.length > 0 || !!dateFrom || !!dateTo

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load purchase orders</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text1 flex items-center gap-2">
            <ShoppingCart size={20} className="text-accent" /> Purchase Orders
          </h1>
          <p className="text-text2 text-sm mt-0.5">
            SellerCloud PO cache with line-item drill-through and Inventory Browser links.
          </p>
        </div>
        {profile?.role === 'admin' && (
          <button
            onClick={() => syncPOs.mutate()}
            disabled={syncPOs.isPending}
            className="btn-primary text-xs"
            title="Sync purchase orders from SellerCloud"
          >
            <RefreshCw size={13} className={syncPOs.isPending ? 'animate-spin' : ''} />
            {syncPOs.isPending ? 'Syncing' : 'Sync'}
          </button>
        )}
      </div>

      {syncPOs.isError && (
        <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(syncPOs.error as Error)?.message ?? 'Purchase order sync failed.'}
        </div>
      )}
      {syncPOs.isSuccess && (
        <div className="mb-4 rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
          Synced {fmtNumber(syncPOs.data.active ?? syncPOs.data.synced)} active purchase orders and {fmtNumber(syncPOs.data.items)} line items.
          {syncPOs.data.itemFailures && syncPOs.data.itemFailures.length > 0
            ? ` ${syncPOs.data.itemFailures.length} PO item refreshes need retry.`
            : ''}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Purchase Orders" value={fmtNumber(summary.total)} sub="filtered POs" icon={<PackageCheck size={15} />} />
        <KPICard label="Ordered" value={fmtNumber(summary.ordered)} sub="currently ordered" variant="info" />
        <KPICard label="Received" value={fmtNumber(summary.received)} sub="received or completed" variant="success" />
        <KPICard label="PO Value" value={fmtCurrency(summary.value)} sub={`${fmtNumber(summary.units)} units`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
          <input
            className="input w-full pl-8 text-sm"
            placeholder="Search PO, vendor, memo..."
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(0) }}
          />
        </div>
        <StatusMultiSelect options={statusOptions} selected={statuses} onChange={next => { setStatuses(next); setPage(0) }} />
        <input className="input text-sm w-40" type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(0) }} />
        <input className="input text-sm w-40" type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(0) }} />
        {hasFilters && <button className="btn-ghost text-xs text-danger" onClick={clearFilters}>Clear filters</button>}
        <span className="ml-auto text-xs text-text2">{fmtNumber(sortedOrders.length)} PO{sortedOrders.length === 1 ? '' : 's'}</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <SortableTh field="id" label="PO" sort={sort} onSort={toggleSort} />
              <SortableTh field="purchase_title" label="Title" sort={sort} onSort={toggleSort} />
              <SortableTh field="vendor_id" label="Vendor" sort={sort} onSort={toggleSort} />
              <SortableTh field="po_status" label="Status" sort={sort} onSort={toggleSort} />
              <SortableTh field="date_ordered" label="Ordered" sort={sort} onSort={toggleSort} />
              <SortableTh field="expected_delivery_date" label="Expected" sort={sort} onSort={toggleSort} />
              <SortableTh field="receiving_status" label="Receiving" sort={sort} onSort={toggleSort} />
              <SortableTh field="unit_counts" label="Units" sort={sort} onSort={toggleSort} className="text-right" />
              <SortableTh field="grand_total" label="Total" sort={sort} onSort={toggleSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-text2">
                  No purchase orders match the current filters.
                </td>
              </tr>
            ) : pagedOrders.map(order => (
              <tr key={order.id} className="cursor-pointer" onClick={() => setSelected(order)}>
                <td className="font-mono text-[11px] text-accent">#{order.id}</td>
                <td className="max-w-[260px]">
                  <span className="block truncate" title={order.purchase_title ?? undefined}>{order.purchase_title ?? 'Untitled PO'}</span>
                </td>
                <td className="text-xs text-text2">{order.vendor_name ?? order.vendor_id ?? '-'}</td>
                <td><Badge variant={poStatusVariant(order.po_status)}>{formatPOStatus(order.po_status)}</Badge></td>
                <td className="text-xs text-text2">{dateText(order.date_ordered)}</td>
                <td className="text-xs text-text2">{dateText(order.expected_delivery_date)}</td>
                <td className="text-xs text-text2">{order.receiving_status ?? '-'}</td>
                <td className="tabular-nums text-right">{fmtNumber(order.unit_counts ?? 0)}</td>
                <td className="tabular-nums text-right">{moneyText(order.grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-text2">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Prev</button>
            <button className="btn-secondary py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(value => value + 1)}>Next</button>
          </div>
        </div>
      )}

      <PODetailPanel order={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function PODetailPanel({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const { data: items = [], isLoading, error } = usePurchaseOrderItems(order?.id ?? null)
  const unmatched = countUnmatchedPOItems(items)

  return (
    <Modal open={!!order} onClose={onClose} title={order ? `Purchase Order #${order.id}` : 'Purchase Order'} width="max-w-6xl">
      {!order ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <DetailStat label="Status" value={<Badge variant={poStatusVariant(order.po_status)}>{formatPOStatus(order.po_status)}</Badge>} />
            <DetailStat label="Vendor" value={order.vendor_name ?? order.vendor_id ?? '-'} />
            <DetailStat label="Ordered" value={dateText(order.date_ordered)} />
            <DetailStat label="Expected" value={dateText(order.expected_delivery_date)} />
            <DetailStat label="Grand Total" value={moneyText(order.grand_total)} />
            <DetailStat label="Units" value={fmtNumber(order.unit_counts ?? 0)} />
            <DetailStat label="Receiving" value={order.receiving_status ?? '-'} />
            <DetailStat label="Synced" value={fmtDate(order.synced_at)} />
          </div>

          {order.memo && <div className="text-sm text-text2 border border-border rounded-lg px-3 py-2">{order.memo}</div>}

          {unmatched > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
              <TriangleAlert size={15} />
              {unmatched} line item{unmatched === 1 ? '' : 's'} do not have a planning SKU match yet.
            </div>
          )}

          {isLoading ? <PageLoader /> : error ? (
            <div className="text-danger text-sm">Failed to load PO items: {(error as Error)?.message}</div>
          ) : <POItemsTable items={items} />}
        </div>
      )}
    </Modal>
  )
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-text2">{label}</div>
      <div className="mt-1 text-text1">{value}</div>
    </div>
  )
}

function POItemsTable({ items }: { items: POItem[] }) {
  if (items.length === 0) return <div className="text-center py-10 text-text2">No line items cached for this PO.</div>

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Open Qty</th>
            <th>Ordered</th>
            <th>Received</th>
            <th>Unit Price</th>
            <th>Line Total</th>
            <th>Expected</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const lineTotal = poLineTotal(item)
            return (
              <tr key={item.id}>
                <td>
                  {item.planning_sku ? (
                    <Link
                      to={`/purchasing/inventory?search=${encodeURIComponent(item.planning_sku)}`}
                      className="font-mono text-[11px] text-accent hover:underline inline-flex items-center gap-1"
                    >
                      {item.planning_sku}
                      <ExternalLink size={10} />
                    </Link>
                  ) : (
                    <div>
                      <div className="font-mono text-[11px] text-warning">{item.source_sku}</div>
                      <div className="text-[10px] text-text2">Unmatched source SKU</div>
                    </div>
                  )}
                </td>
                <td className="max-w-[360px]">
                  <span className="block truncate" title={item.product_name ?? undefined}>{item.product_name ?? '-'}</span>
                </td>
                <td className="tabular-nums text-right font-semibold">{fmtNumber(item.qty_units_open ?? item.qty_units_ordered ?? 0)}</td>
                <td className="tabular-nums text-right">{fmtNumber(item.qty_units_ordered ?? 0)}</td>
                <td className="tabular-nums text-right">{fmtNumber(item.qty_units_received ?? 0)}</td>
                <td className="tabular-nums text-right">{item.unit_price == null ? '-' : fmtCurrencyFull(item.unit_price)}</td>
                <td className="tabular-nums text-right">{lineTotal == null ? '-' : fmtCurrencyFull(lineTotal)}</td>
                <td className="text-xs text-text2">{dateText(item.expected_delivery_date)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
