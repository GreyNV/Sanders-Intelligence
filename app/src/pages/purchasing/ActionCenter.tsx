import { useState } from 'react'
import { useAtRiskItems, useBackorderItems, useInventoryKPIs } from '@/hooks/useInventory'
import { useTasks } from '@/hooks/useTasks'
import KPICard from '@/components/ui/KPICard'
import Badge, { statusVariant, priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import TaskModal from '@/components/tasks/TaskModal'
import { fmtNumber, fmtCurrency, fmtDate, isOverdue } from '@/lib/utils'
import { AlertTriangle, ShoppingCart, Clock, DollarSign, Plus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { InventoryRecord } from '@/types'

export default function ActionCenter() {
  const { data: atRisk = [],    isLoading: l1 } = useAtRiskItems()
  const { data: backorders = [], isLoading: l2 } = useBackorderItems()
  const kpis = useInventoryKPIs()
  const { data: tasks = [] }                     = useTasks()
  const [taskModal, setTaskModal]                = useState(false)
  const [prefillSku, setPrefillSku]              = useState<InventoryRecord | null>(null)
  const navigate = useNavigate()

  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')

  if (l1 || l2 || kpis.isLoading) return <PageLoader />

  function openTaskForSku(record: InventoryRecord) {
    setPrefillSku(record)
    setTaskModal(true)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">Action Center</h1>
        <p className="text-text2 text-sm mt-0.5">Items requiring purchasing attention today</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard
          label="Needs Ordering"
          value={fmtNumber(kpis.atRiskCount)}
          sub="potential stockout items"
          variant="danger"
          icon={<AlertTriangle size={16} />}
        />
        <KPICard
          label="Recommended Order Value"
          value={fmtCurrency(kpis.recOrderValue)}
          sub="total value to order"
          variant="warning"
          icon={<ShoppingCart size={16} />}
        />
        <KPICard
          label="Active Backorders"
          value={fmtNumber(kpis.backorderCount)}
          sub={`${fmtCurrency(kpis.totalBackorderValue)} in value`}
          variant="danger"
          icon={<Clock size={16} />}
        />
        <KPICard
          label="Open Tasks"
          value={openTasks.length}
          sub="purchasing department"
          variant="info"
          icon={<DollarSign size={16} />}
        />
      </div>

      {/* Attention Required */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2">
            <AlertTriangle size={15} className="text-danger" />
            Attention Required
            <span className="text-xs font-normal text-text2">— potential stockouts with recommended orders</span>
          </h2>
          <button onClick={() => navigate('/purchasing/inventory')} className="btn-ghost text-xs">
            View all inventory <ChevronRight size={13} />
          </button>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Brand</th>
                <th>On Hand</th>
                <th>Days on Hand</th>
                <th>Avg Sales/mo</th>
                <th>Rec. Order Qty</th>
                <th>Rec. Order Value</th>
                <th>Backorders</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {atRisk.length === 0 ? (
                <tr><td colSpan={11} className="py-10 text-center text-text2">No at-risk items — great job!</td></tr>
              ) : (
                atRisk
                  .sort((a, b) => a.days_on_hand - b.days_on_hand)
                  .slice(0, 100)
                  .map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-[11px] text-accent">{r.product_code}</td>
                      <td className="max-w-[260px]">
                        <span className="block truncate text-text1" title={r.description}>{r.description}</span>
                      </td>
                      <td className="text-text2 text-xs">{r.brand_name}</td>
                      <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                      <td className="tabular-nums">
                        <span className={r.days_on_hand <= 7 ? 'text-danger font-semibold' : r.days_on_hand <= 14 ? 'text-warning' : ''}>
                          {r.days_on_hand}d
                        </span>
                      </td>
                      <td className="tabular-nums text-text2">{r.average_sales.toFixed(1)}</td>
                      <td className="tabular-nums font-semibold">{fmtNumber(r.recommended_order)}</td>
                      <td className="tabular-nums">{fmtCurrency(r.recommended_order_value)}</td>
                      <td className="tabular-nums">
                        {r.unsatisfied_customer_orders_units > 0
                          ? <span className="text-danger font-semibold">{fmtNumber(r.unsatisfied_customer_orders_units)}</span>
                          : <span className="text-text2">—</span>
                        }
                      </td>
                      <td><Badge variant={statusVariant(r.status)} value={r.status} /></td>
                      <td>
                        <button
                          onClick={() => openTaskForSku(r)}
                          className="btn-ghost text-[11px] py-1 px-2"
                          title="Create task"
                        >
                          <Plus size={12} /> Task
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        {atRisk.length > 100 && (
          <p className="text-xs text-text2 mt-2 pl-1">Showing top 100 of {atRisk.length}. Use Inventory Browser for full view.</p>
        )}
      </div>

      {/* Backorders */}
      <div className="mb-6">
        <h2 className="text-[14px] font-semibold text-text1 flex items-center gap-2 mb-3">
          <Clock size={15} className="text-warning" />
          Open Backorders
          <span className="text-xs font-normal text-text2">— unsatisfied customer orders</span>
        </h2>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Brand</th>
                <th>On Hand</th>
                <th>Unsatisfied Units</th>
                <th>Backorder Value</th>
                <th>On Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {backorders.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-text2">No open backorders</td></tr>
              ) : (
                backorders
                  .sort((a, b) => b.unsatisfied_customer_orders_value - a.unsatisfied_customer_orders_value)
                  .slice(0, 50)
                  .map(r => (
                    <tr key={r.id}>
                      <td className="font-mono text-[11px] text-accent">{r.product_code}</td>
                      <td className="max-w-[260px]">
                        <span className="block truncate" title={r.description}>{r.description}</span>
                      </td>
                      <td className="text-text2 text-xs">{r.brand_name}</td>
                      <td className="tabular-nums">{fmtNumber(r.on_hand)}</td>
                      <td className="tabular-nums text-danger font-semibold">
                        {fmtNumber(r.unsatisfied_customer_orders_units)}
                      </td>
                      <td className="tabular-nums">{fmtCurrency(r.unsatisfied_customer_orders_value)}</td>
                      <td className="tabular-nums">{fmtNumber(r.on_order)}</td>
                      <td><Badge variant={statusVariant(r.status)} value={r.status} /></td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Open Tasks Widget */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-text1">Open Tasks</h2>
          <div className="flex gap-2">
            <button onClick={() => setTaskModal(true)} className="btn-secondary text-xs">
              <Plus size={13} /> New Task
            </button>
            <button onClick={() => navigate('/tasks')} className="btn-ghost text-xs">
              View all <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {openTasks.length === 0 ? (
          <div className="card text-center py-8 text-text2 text-sm">No open tasks</div>
        ) : (
          <div className="space-y-2">
            {openTasks.slice(0, 5).map(task => (
              <div key={task.id} className="card flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text1 truncate">{task.title}</span>
                    {task.sku_code && <span className="text-[10px] text-text2 font-mono">{task.sku_code}</span>}
                  </div>
                  {task.due_date && (
                    <span className={`text-[11px] ${isOverdue(task.due_date) ? 'text-danger' : 'text-text2'}`}>
                      Due {fmtDate(task.due_date)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={priorityVariant(task.priority)} value={task.priority} />
                  <Badge variant={taskStatusVariant(task.status)} value={task.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {taskModal && (
        <TaskModal
          open={taskModal}
          onClose={() => { setTaskModal(false); setPrefillSku(null) }}
          prefillSku={prefillSku?.product_code}
          prefillTitle={prefillSku ? `Order: ${prefillSku.description}` : ''}
        />
      )}
    </div>
  )
}
