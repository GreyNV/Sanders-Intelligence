import { useMemo } from 'react'
import { useInboundItems, useInventoryKPIs } from '@/hooks/useInventory'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency, estimatedArrivalMonth, parseMonthLabel, groupBy } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Truck } from 'lucide-react'

export default function InboundPipeline() {
  const { data: inbound = [], isLoading } = useInboundItems()
  const kpis = useInventoryKPIs()

  const totalUnitsOnOrder = inbound.reduce((s, r) => s + r.on_order, 0)
  const totalOrderValue   = inbound.reduce((s, r) => s + r.cost_price * r.on_order, 0)

  // Group by estimated arrival month using lt_days
  const byMonth = useMemo(() => {
    const grouped = groupBy(inbound, r => estimatedArrivalMonth(r.lt_days))
    return Object.entries(grouped)
      .map(([month, items]) => ({
        month,
        units: items.reduce((s, r) => s + r.on_order, 0),
        skus:  items.length,
      }))
      .sort((a, b) => parseMonthLabel(a.month) - parseMonthLabel(b.month))
  }, [inbound])

  // Near-term: arriving within 30 days (lt_days <= 30)
  const nearTerm = inbound.filter(r => r.lt_days <= 30).reduce((s, r) => s + r.on_order, 0)
  const midTerm  = inbound.filter(r => r.lt_days > 30 && r.lt_days <= 90).reduce((s, r) => s + r.on_order, 0)

  if (isLoading) return <PageLoader />

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1 flex items-center gap-2">
          <Truck size={20} className="text-accent" /> Inbound Pipeline
        </h1>
        <p className="text-text2 text-sm mt-0.5">
          Open purchase orders · arrival estimated from lead time days
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="SKUs On Order"    value={fmtNumber(inbound.length)}       sub="unique SKUs" />
        <KPICard label="Units On Order"   value={fmtNumber(totalUnitsOnOrder)}    sub="total units" variant="info" />
        <KPICard label="Arriving ≤ 30d"   value={fmtNumber(nearTerm)}             sub="units near-term" variant="success" />
        <KPICard label="Arriving 31–90d"  value={fmtNumber(midTerm)}             sub="units mid-term" />
      </div>

      {/* Chart */}
      <div className="card mb-6">
        <h3 className="text-[13px] font-semibold mb-4">Units by Estimated Arrival Month</h3>
        {byMonth.length === 0 ? (
          <div className="text-center py-10 text-text2">No inbound items</div>
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

      {/* Table */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-text1">All Inbound Items</h3>
        <span className="text-xs text-text2">{fmtNumber(inbound.length)} SKUs · {fmtCurrency(totalOrderValue)} est. value</span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Description</th>
              <th>Brand</th>
              <th>On Order (units)</th>
              <th>Lead Time</th>
              <th>Est. Arrival</th>
              <th>On Hand</th>
              <th>Days on Hand</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {inbound.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-text2">No items on order</td></tr>
            ) : (
              inbound
                .sort((a, b) => a.lt_days - b.lt_days)
                .map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-[11px] text-accent">{r.product_code}</td>
                    <td className="max-w-[260px]">
                      <span className="block truncate" title={r.description}>{r.description}</span>
                    </td>
                    <td className="text-xs text-text2">{r.brand_name}</td>
                    <td className="tabular-nums font-semibold">{fmtNumber(r.on_order)}</td>
                    <td className="tabular-nums text-text2">{r.lt_days}d</td>
                    <td className="text-xs">{estimatedArrivalMonth(r.lt_days)}</td>
                    <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                    <td className="tabular-nums">{r.days_on_hand}d</td>
                    <td className="text-xs">
                      <span className={
                        r.status === 'Potential s/o' ? 'text-danger font-semibold' :
                        r.status === 'Ok' ? 'text-success' : 'text-text2'
                      }>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
