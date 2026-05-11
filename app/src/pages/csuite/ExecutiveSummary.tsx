import { useInventoryAnalysis, useInventoryTrends } from '@/hooks/useInventory'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency } from '@/lib/utils'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { AlertTriangle, TrendingUp, Package, DollarSign, Clock } from 'lucide-react'
import { useMemo } from 'react'
import { groupBy } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

export default function ExecutiveSummary() {
  const { data: inventory, isLoading, error } = useInventoryAnalysis()
  const records = inventory.records
  const kpis = inventory.kpis
  const { data: trends = [], isLoading: trendsLoading } = useInventoryTrends()
  const navigate = useNavigate()

  // $ value breakdown — groups matching KPI buckets (Stocked out → At Risk, Surplus orders → Excess)
  const statusValueBreakdown = useMemo(() => [
    {
      name: 'OK', statusFilter: 'Ok',
      value: records.filter(r => r.status === 'Ok').reduce((s, r) => s + r.on_hand_value, 0),
      fill: '#4caf87',
    },
    {
      name: 'Excess', statusFilter: 'Excess stock',
      value: records.filter(r => r.status === 'Excess stock' || r.status === 'Surplus orders').reduce((s, r) => s + r.on_hand_value, 0),
      fill: '#6c8aff',
    },
    {
      name: 'At Risk', statusFilter: 'Potential s/o',
      value: records.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out').reduce((s, r) => s + r.on_hand_value, 0),
      fill: '#e05c7a',
    },
    {
      name: 'New Items', statusFilter: 'New item',
      value: records.filter(r => r.status === 'New item').reduce((s, r) => s + r.on_hand_value, 0),
      fill: '#8890b5',
    },
  ], [records])

  // Top 10 at-risk suppliers by recommended order value
  const topRiskSuppliers = useMemo(() => {
    const grouped = groupBy(
      records.filter(r => r.status === 'Potential s/o' || r.status === 'Stocked out'),
      r => r.supplier_description || 'Unknown supplier'
    )

    return Object.entries(grouped)
      .map(([supplier, items]) => ({
        supplier,
        skuCount: items.length,
        categoryCount: new Set(items.map(r => r.category_name).filter(Boolean)).size,
        onHand: items.reduce((s, r) => s + r.on_hand, 0),
        minDaysOnHand: Math.min(...items.map(r => r.days_on_hand)),
        recommendedOrder: items.reduce((s, r) => s + r.recommended_order, 0),
        recommendedOrderValue: items.reduce((s, r) => s + r.recommended_order_value, 0),
        backorderUnits: items.reduce((s, r) => s + r.unsatisfied_customer_orders_units, 0),
      }))
      .sort((a, b) => b.recommendedOrderValue - a.recommendedOrderValue)
      .slice(0, 10)
  }, [records])

  // Top brands by excess value
  const brandExcess = useMemo(() => {
    const grouped = groupBy(
      records.filter(r => r.status === 'Excess stock' || r.status === 'Surplus orders'),
      r => r.brand_name
    )
    return Object.entries(grouped)
      .map(([brand, items]) => ({
        brand,
        excessValue: items.reduce((s, r) => s + r.excess_value, 0),
      }))
      .sort((a, b) => b.excessValue - a.excessValue)
      .slice(0, 8)
  }, [records])

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <AlertTriangle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold">Failed to load inventory data</div>
      <div className="text-text2 text-sm mt-1">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  const totalVal   = statusValueBreakdown.reduce((s, r) => s + r.value, 0)
  const okVal      = statusValueBreakdown[0].value
  const excessVal  = statusValueBreakdown[1].value
  const riskVal    = statusValueBreakdown[2].value
  const okValPct   = totalVal > 0 ? Math.round((okVal / totalVal) * 100) : 0

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">Executive Summary</h1>
        <p className="text-text2 text-sm mt-0.5">Inventory health overview — all figures from the latest upload</p>
      </div>

      {/* $ Value Health Bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text2">Inventory Health — Value ($)</span>
          <span className="text-sm font-semibold text-text1">{okValPct}% OK</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden mb-3 cursor-pointer">
          <div
            style={{ width: totalVal > 0 ? `${(okVal / totalVal) * 100}%` : '0%' }}
            className="bg-success hover:opacity-80 transition-opacity"
            title="OK — click to filter"
            onClick={() => navigate('/purchasing/inventory?status=Ok')}
          />
          <div
            style={{ width: totalVal > 0 ? `${(excessVal / totalVal) * 100}%` : '0%' }}
            className="bg-accent hover:opacity-80 transition-opacity"
            title="Excess — click to filter"
            onClick={() => navigate('/purchasing/inventory?status=Excess+stock')}
          />
          <div
            style={{ width: totalVal > 0 ? `${(riskVal / totalVal) * 100}%` : '0%' }}
            className="bg-danger hover:opacity-80 transition-opacity"
            title="At Risk — click to filter"
            onClick={() => navigate('/purchasing/inventory?status=Potential+s%2Fo')}
          />
        </div>
        <div className="flex gap-6 text-xs text-text2">
          <span
            className="cursor-pointer hover:text-text1 transition-colors"
            onClick={() => navigate('/purchasing/inventory?status=Ok')}
          ><span className="inline-block w-2 h-2 rounded-sm bg-success mr-1.5" />OK — {fmtCurrency(okVal)}</span>
          <span
            className="cursor-pointer hover:text-text1 transition-colors"
            onClick={() => navigate('/purchasing/inventory?status=Excess+stock')}
          ><span className="inline-block w-2 h-2 rounded-sm bg-accent mr-1.5" />Excess — {fmtCurrency(excessVal)}</span>
          <span
            className="cursor-pointer hover:text-text1 transition-colors"
            onClick={() => navigate('/purchasing/inventory?status=Potential+s%2Fo')}
          ><span className="inline-block w-2 h-2 rounded-sm bg-danger mr-1.5" />At Risk — {fmtCurrency(riskVal)}</span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* $ Value Pie Chart — clickable segments */}
        <div className="card">
          <h3 className="text-[13px] font-semibold mb-1">Inventory Value Distribution ($)</h3>
          <p className="text-[11px] text-text2 mb-3">Click a segment to open filtered view</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusValueBreakdown.filter(d => d.value > 0)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={75}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                cursor="pointer"
                onClick={(entry) => navigate(`/purchasing/inventory?status=${encodeURIComponent(entry.statusFilter)}`)}
              >
                {statusValueBreakdown.filter(d => d.value > 0).map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                labelStyle={{ color: '#e8eaf6', fontWeight: 600 }}
                itemStyle={{ color: '#e8eaf6' }}
                formatter={(v: number) => [fmtCurrency(v), 'Value']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Excess Value by Brand — clickable bars */}
        <div className="card">
          <h3 className="text-[13px] font-semibold mb-1">Excess Value by Brand (Top {brandExcess.length})</h3>
          <p className="text-[11px] text-text2 mb-3">Click a bar to open filtered view</p>
          {brandExcess.length === 0 ? (
            <div className="text-center py-10 text-text2 text-sm">No excess stock</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, brandExcess.length * 36)}>
              <BarChart
                data={brandExcess}
                layout="vertical"
                margin={{ left: 20, right: 0 }}
                onClick={(data) => {
                  if (data?.activePayload?.[0]) {
                    const brand = data.activePayload[0].payload.brand
                    navigate(`/purchasing/inventory?status=Excess+stock&brand=${encodeURIComponent(brand)}`)
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="brand" tick={{ fill: '#8890b5', fontSize: 10 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                  formatter={(v: number) => [fmtCurrency(v), 'Excess Value']}
                />
                <Bar dataKey="excessValue" fill="#6c8aff" radius={[0, 4, 4, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Urgent flags */}
      <div>
        <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-danger" />
          Top Risk Supplier — Requires Attention
        </h2>
        <div className="space-y-2">
          {topRiskSuppliers.length === 0 ? (
            <div className="card text-center py-8 text-text2">No at-risk suppliers — inventory health is good</div>
          ) : (
            topRiskSuppliers.map(r => (
              <div
                key={r.supplier}
                className="card flex items-center gap-4 border-l-2 border-danger cursor-pointer hover:bg-surface2/50 transition-colors"
                onClick={() => navigate(`/purchasing/inventory?status=${encodeURIComponent('Potential s/o')}&vendor=${encodeURIComponent(r.supplier)}`)}
                title="Click to view supplier in Inventory Browser"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-text1 truncate">{r.supplier}</div>
                  <div className="text-[11px] text-text2 mt-0.5">
                    {fmtNumber(r.skuCount)} at-risk SKUs · {fmtNumber(r.categoryCount)} categories
                  </div>
                </div>
                <div className="flex gap-6 text-right flex-shrink-0">
                  <div>
                    <div className="text-xs text-text2">On Hand</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(r.onHand)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Lowest Days OH</div>
                    <div className="font-semibold text-danger tabular-nums">{r.minDaysOnHand}d</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Rec. Order</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(r.recommendedOrder)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Backorders</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(r.backorderUnits)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text2">Order Value</div>
                    <div className="font-semibold tabular-nums">{fmtCurrency(r.recommendedOrderValue)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Historical Trends */}
      <div className="mt-6">
        <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-accent" />
          Historical Trends — across uploads
        </h2>

        {trendsLoading ? (
          <div className="card text-center py-8 text-text2 text-sm">Loading trend data…</div>
        ) : trends.length < 2 ? (
          <div className="card text-center py-8">
            <TrendingUp size={28} className="text-text2 mx-auto mb-2" />
            <div className="text-text1 font-medium">Not enough data yet</div>
            <div className="text-text2 text-sm mt-1">
              Trends appear after 2+ uploads. Upload another report to start tracking inventory dynamics.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Total Inventory Value over time */}
            <div className="card">
              <h3 className="text-[13px] font-semibold mb-1">Total Inventory Value Over Time</h3>
              <p className="text-[11px] text-text2 mb-3">On-hand value ($) across uploads</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trends} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                  <XAxis dataKey="label" tick={{ fill: '#8890b5', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
                  <Tooltip
                    contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                    formatter={(v: number) => [fmtCurrency(v), 'On-Hand Value']}
                  />
                  <Line type="monotone" dataKey="totalValue" stroke="#6c8aff" strokeWidth={2} dot={{ fill: '#6c8aff', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Fill Rate + At-Risk SKU count over time */}
            <div className="card">
              <h3 className="text-[13px] font-semibold mb-1">Fill Rate & At-Risk SKUs Over Time</h3>
              <p className="text-[11px] text-text2 mb-3">Fill rate (%) and at-risk SKU count per upload</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trends} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                  <XAxis dataKey="label" tick={{ fill: '#8890b5', fontSize: 10 }} />
                  <YAxis yAxisId="left"  tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} width={40} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8890b5', fontSize: 10 }} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                    formatter={(v: number, name: string) =>
                      name === 'fillRate' ? [`${v.toFixed(1)}%`, 'Fill Rate'] : [fmtNumber(v), 'At-Risk SKUs']
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8890b5' }} />
                  <Line yAxisId="left"  type="monotone" dataKey="fillRate"    stroke="#4caf87" strokeWidth={2} dot={{ fill: '#4caf87', r: 3 }} name="fillRate" />
                  <Line yAxisId="right" type="monotone" dataKey="atRiskCount" stroke="#e05c7a" strokeWidth={2} dot={{ fill: '#e05c7a', r: 3 }} name="atRiskCount" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Excess Value over time */}
            <div className="card">
              <h3 className="text-[13px] font-semibold mb-1">Excess Inventory Value Over Time</h3>
              <p className="text-[11px] text-text2 mb-3">Capital tied up in overstock per upload</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trends} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                  <XAxis dataKey="label" tick={{ fill: '#8890b5', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
                  <Tooltip
                    contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                    formatter={(v: number) => [fmtCurrency(v), 'Excess Value']}
                  />
                  <Bar dataKey="excessValue" fill="#6c8aff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Recommended Order Value trend */}
            <div className="card">
              <h3 className="text-[13px] font-semibold mb-1">Recommended Order Value Over Time</h3>
              <p className="text-[11px] text-text2 mb-3">How much needs to be ordered per upload</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trends} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                  <XAxis dataKey="label" tick={{ fill: '#8890b5', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#8890b5', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
                  <Tooltip
                    contentStyle={{ background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8 }}
                    formatter={(v: number) => [fmtCurrency(v), 'Rec. Order Value']}
                  />
                  <Line type="monotone" dataKey="totalRecOrderValue" stroke="#e05c7a" strokeWidth={2} dot={{ fill: '#e05c7a', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
