import { useInventory, useInventoryKPIs } from '@/hooks/useInventory'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { AlertTriangle, TrendingUp, Package, DollarSign, Clock } from 'lucide-react'
import { useMemo } from 'react'
import { groupBy } from '@/lib/utils'

export default function ExecutiveSummary() {
  const { data: records = [], isLoading } = useInventory()
  const kpis = useInventoryKPIs()

  const statusBreakdown = useMemo(() => {
    const grouped = groupBy(records, r => r.status)
    return [
      { name: 'OK',         value: grouped['Ok']?.length ?? 0,              fill: '#4caf87' },
      { name: 'Excess',     value: grouped['Excess stock']?.length ?? 0,    fill: '#6c8aff' },
      { name: 'At Risk',    value: grouped['Potential s/o']?.length ?? 0,   fill: '#e05c7a' },
    ]
  }, [records])

  const statusValueBreakdown = useMemo(() => [
    { name: 'OK',     value: records.filter(r => r.status === 'Ok').reduce((s, r) => s + r.on_hand_value, 0),           fill: '#4caf87' },
    { name: 'Excess', value: records.filter(r => r.status === 'Excess stock').reduce((s, r) => s + r.on_hand_value, 0), fill: '#6c8aff' },
    { name: 'At Risk',value: records.filter(r => r.status === 'Potential s/o').reduce((s, r) => s + r.on_hand_value, 0),fill: '#e05c7a' },
  ], [records])

  // Top 10 at-risk by recommended order value
  const topRisk = useMemo(() =>
    records
      .filter(r => r.status === 'Potential s/o')
      .sort((a, b) => b.recommended_order_value - a.recommended_order_value)
      .slice(0, 10),
  [records])

  // Top brands by excess value
  const brandExcess = useMemo(() => {
    const grouped = groupBy(records.filter(r => r.status === 'Excess stock'), r => r.brand_name)
    return Object.entries(grouped)
      .map(([brand, items]) => ({
        brand,
        excessValue: items.reduce((s, r) => s + r.excess_value, 0),
      }))
      .sort((a, b) => b.excessValue - a.excessValue)
      .slice(0, 8)
  }, [records])

  if (isLoading) return <PageLoader />

  const healthPct = kpis.totalSkus > 0 ? Math.round((kpis.okCount / kpis.totalSkus) * 100) : 0

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">Executive Summary</h1>
        <p className="text-text2 text-sm mt-0.5">Inventory health overview — all figures from the latest upload</p>
      </div>

      {/* Health Bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text2">Inventory Health</span>
          <span className="text-sm font-semibold text-text1">{healthPct}% OK</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden mb-3">
          <div style={{ width: `${(kpis.okCount / kpis.totalSkus) * 100}%` }} className="bg-success" />
          <div style={{ width: `${(kpis.excessCount / kpis.totalSkus) * 100}%` }} className="bg-accent" />
          <div style={{ width: `${(kpis.atRiskCount / kpis.totalSkus) * 100}%` }} className="bg-danger" />
        </div>
        <div className="flex gap-6 text-xs text-text2">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-success mr-1.5" />OK — {fmtNumber(kpis.okCount)} SKUs</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-accent mr-1.5" />Excess — {fmtNumber(kpis.excessCount)} SKUs</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-danger mr-1.5" />At Risk — {fmtNumber(kpis.atRiskCount)} SKUs</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <KPICard
          label="Inventory Value"
          value={fmtCurrency(kpis.totalOnHandValue)}
          sub="total at cost"
          icon={<DollarSign size={15} />}
        />
        <KPICard
          label="Fill Rate"
          value={`${kpis.fillRate.toFixed(1)}%`}
          sub="SKUs adequately stocked"
          variant={kpis.fillRate >= 80 ? 'success' : kpis.fillRate >= 60 ? 'warning' : 'danger'}
          icon={<TrendingUp size={15} />}
        />
        <KPICard
          label="SKUs at Risk"
          value={fmtNumber(kpis.atRiskCount)}
          sub="potential stockouts"
          variant="danger"
          icon={<AlertTriangle size={15} />}
        />
        <KPICard
          label="Excess Value"
          value={fmtCurrency(kpis.excessValue)}
          sub="tied up in overstock"
          variant="info"
          icon={<Package size={15} />}
        />
        <KPICard
          label="Backorder Value"
          value={fmtCurrency(kpis.totalBackorderValue)}
          sub={`${fmtNumber(kpis.backorderCount)} open items`}
          variant={kpis.backorderCount > 0 ? 'danger' : 'default'}
          icon={<Clock size={15} />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        <div className="card">
          <h3 className="text-[13px] font-semibold mb-4">SKU Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {statusBreakdown.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                formatter={(v: number) => [fmtNumber(v), 'SKUs']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-[13px] font-semibold mb-4">Excess Value by Brand (Top 8)</h3>
          {brandExcess.length === 0 ? (
            <div className="text-center py-10 text-text2 text-sm">No excess stock</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={brandExcess} layout="vertical" margin={{ left: 20, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="brand" tick={{ fill: '#8890b5', fontSize: 10 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                  formatter={(v: number) => [fmtCurrency(v), 'Excess Value']}
                />
                <Bar dataKey="excessValue" fill="#6c8aff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Urgent flags */}
      <div>
        <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-danger" />
          Top Risk Items — Requires Attention
        </h2>
        <div className="space-y-2">
          {topRisk.length === 0 ? (
            <div className="card text-center py-8 text-text2">No at-risk items — inventory health is good</div>
          ) : (
            topRisk.map(r => (
              <div key={r.id} className="card flex items-center gap-4 border-l-2 border-danger">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-text1 truncate">{r.description}</div>
                  <div className="text-[11px] text-text2 mt-0.5">
                    {r.brand_name} · SKU: <span className="font-mono text-accent">{r.product_code}</span>
                  </div>
                </div>
                <div className="flex gap-6 text-right flex-shrink-0">
                  <div>
                    <div className="text-xs text-text2">On Hand</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(r.on_hand)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Days OH</div>
                    <div className="font-semibold text-danger tabular-nums">{r.days_on_hand}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Rec. Order</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(r.recommended_order)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Order Value</div>
                    <div className="font-semibold tabular-nums">{fmtCurrency(r.recommended_order_value)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Trend placeholder */}
      <div className="card mt-6 text-center py-8">
        <TrendingUp size={28} className="text-text2 mx-auto mb-2" />
        <div className="text-text1 font-medium">Historical Trends</div>
        <div className="text-text2 text-sm mt-1">
          Available after 7+ days of daily uploads. Week-over-week KPI movement will appear here.
        </div>
      </div>
    </div>
  )
}
