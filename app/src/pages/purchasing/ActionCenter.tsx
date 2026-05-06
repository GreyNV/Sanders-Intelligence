import { useState } from 'react'
import { useAtRiskItems, useBackorderItems, useInventoryKPIs } from '@/hooks/useInventory'
import { useDismissedSet, useDismissAction, useRestoreAction } from '@/hooks/useDismissedActions'
import { useTasks } from '@/hooks/useTasks'
import KPICard from '@/components/ui/KPICard'
import Modal from '@/components/ui/Modal'
import Badge, { statusVariant, priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import TaskModal from '@/components/tasks/TaskModal'
import { fmtNumber, fmtCurrency, fmtDate, isOverdue } from '@/lib/utils'
import { AlertTriangle, ShoppingCart, Clock, DollarSign, Plus, ChevronRight, AlertCircle, EyeOff, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { InventoryRecord } from '@/types'

interface DismissTarget { record: InventoryRecord; actionType: 'at_risk' | 'backorder' }

export default function ActionCenter() {
  const { data: atRisk = [],    isLoading: l1 } = useAtRiskItems()
  const { data: backorders = [], isLoading: l2 } = useBackorderItems()
  const kpis = useInventoryKPIs()
  const { data: tasks = [] }                     = useTasks()
  const dismissedAtRisk    = useDismissedSet('at_risk')
  const dismissedBackorder = useDismissedSet('backorder')
  const dismissAction  = useDismissAction()
  const restoreAction  = useRestoreAction()
  const [taskModal, setTaskModal]                = useState(false)
  const [prefillSku, setPrefillSku]              = useState<InventoryRecord | null>(null)
  const [dismissTarget, setDismissTarget]        = useState<DismissTarget | null>(null)
  const [dismissDays, setDismissDays]            = useState<string>('7')
  const [dismissReason, setDismissReason]        = useState('')
  const [showDismissed, setShowDismissed]        = useState(false)
  const navigate = useNavigate()

  const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')

  const visibleAtRisk    = showDismissed ? atRisk    : atRisk.filter(r => !dismissedAtRisk.has(r.product_code))
  const visibleBackorders = showDismissed ? backorders : backorders.filter(r => !dismissedBackorder.has(r.product_code))

  if (l1 || l2 || kpis.isLoading) return <PageLoader />

  function openTaskForSku(record: InventoryRecord) {
    setPrefillSku(record)
    setTaskModal(true)
  }

  async function handleDismiss() {
    if (!dismissTarget) return
    const days = parseInt(dismissDays)
    const dismissed_until = isNaN(days) || dismissDays === 'permanent'
      ? null
      : new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
    await dismissAction.mutateAsync({
      product_code:    dismissTarget.record.product_code,
      action_type:     dismissTarget.actionType,
      dismissed_until,
      reason:          dismissReason || undefined,
    })
    setDismissTarget(null)
    setDismissReason('')
    setDismissDays('7')
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
            {dismissedAtRisk.size > 0 && (
              <span className="text-[11px] text-text2 bg-surface2 px-2 py-0.5 rounded-full">
                {dismissedAtRisk.size} snoozed
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            {dismissedAtRisk.size > 0 && (
              <button onClick={() => setShowDismissed(v => !v)} className="btn-ghost text-xs">
                {showDismissed ? 'Hide snoozed' : 'Show snoozed'}
              </button>
            )}
            <button onClick={() => navigate('/purchasing/inventory')} className="btn-ghost text-xs">
              View all inventory <ChevronRight size={13} />
            </button>
          </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleAtRisk.length === 0 ? (
                <tr><td colSpan={12} className="py-10 text-center text-text2">No at-risk items — great job!</td></tr>
              ) : (
                visibleAtRisk
                  .sort((a, b) => a.days_on_hand - b.days_on_hand)
                  .slice(0, 100)
                  .map(r => (
                    <tr key={r.id}>
                      <td
                        className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                        onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                        title="Open in Inventory Browser"
                      >{r.product_code}</td>
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
                      <td>
                        <div className="flex items-center gap-1">
                          <Badge variant={statusVariant(r.status)} value={r.status} />
                          {(r.status === 'Excess stock' || r.status === 'Surplus orders') && r.unsatisfied_customer_orders_units > 0 && (
                            <span title="Data quality: item is excess stock but also has backorders — verify source data">
                              <AlertCircle size={13} className="text-warning" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {dismissedAtRisk.has(r.product_code) ? (
                            <button
                              onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'at_risk' })}
                              className="btn-ghost text-[11px] py-1 px-2 text-text2"
                              title="Restore alert"
                            >
                              <RotateCcw size={12} /> Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => setDismissTarget({ record: r, actionType: 'at_risk' })}
                              className="btn-ghost text-[11px] py-1 px-2"
                              title="Snooze or archive this alert"
                            >
                              <EyeOff size={12} /> Snooze
                            </button>
                          )}
                          <button
                            onClick={() => openTaskForSku(r)}
                            className="btn-ghost text-[11px] py-1 px-2"
                            title="Create task"
                          >
                            <Plus size={12} /> Task
                          </button>
                        </div>
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
          {dismissedBackorder.size > 0 && (
            <span className="text-[11px] text-text2 bg-surface2 px-2 py-0.5 rounded-full">
              {dismissedBackorder.size} snoozed
            </span>
          )}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleBackorders.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-text2">No open backorders</td></tr>
              ) : (
                visibleBackorders
                  .sort((a, b) => b.unsatisfied_customer_orders_value - a.unsatisfied_customer_orders_value)
                  .slice(0, 50)
                  .map(r => (
                    <tr key={r.id}>
                      <td
                        className="font-mono text-[11px] text-accent cursor-pointer hover:underline"
                        onClick={() => navigate(`/purchasing/inventory?search=${encodeURIComponent(r.product_code)}`)}
                        title="Open in Inventory Browser"
                      >{r.product_code}</td>
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
                      <td>
                        <div className="flex items-center gap-1">
                          <Badge variant={statusVariant(r.status)} value={r.status} />
                          {(r.status === 'Excess stock' || r.status === 'Surplus orders') && (
                            <span title="Data quality: item has backorders but is flagged as excess — verify source data">
                              <AlertCircle size={13} className="text-warning" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {dismissedBackorder.has(r.product_code) ? (
                          <button
                            onClick={() => restoreAction.mutate({ product_code: r.product_code, action_type: 'backorder' })}
                            className="btn-ghost text-[11px] py-1 px-2 text-text2"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => setDismissTarget({ record: r, actionType: 'backorder' })}
                            className="btn-ghost text-[11px] py-1 px-2"
                          >
                            <EyeOff size={12} /> Snooze
                          </button>
                        )}
                      </td>
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

      {/* Snooze / Archive Modal */}
      {dismissTarget && (
        <Modal
          open={!!dismissTarget}
          onClose={() => setDismissTarget(null)}
          title={`Snooze alert — ${dismissTarget.record.product_code}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-text2 truncate">{dismissTarget.record.description}</p>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Snooze duration</label>
              <select
                className="select w-full"
                value={dismissDays}
                onChange={e => setDismissDays(e.target.value)}
              >
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="permanent">Permanently (known / intentional)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">Reason (optional)</label>
              <input
                className="input w-full"
                placeholder="e.g. Liquidation in progress, PO placed manually…"
                value={dismissReason}
                onChange={e => setDismissReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setDismissTarget(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleDismiss}
                disabled={dismissAction.isPending}
                className="btn-primary"
              >
                {dismissDays === 'permanent' ? 'Archive alert' : `Snooze ${dismissDays}d`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
