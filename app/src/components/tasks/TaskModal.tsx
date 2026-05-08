import { useState, useEffect, FormEvent, useMemo } from 'react'
import Modal from '@/components/ui/Modal'
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'
import { Task, TaskPriority, InventoryRecord } from '@/types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fmtNumber, fmtCurrency } from '@/lib/utils'
import { Package } from 'lucide-react'

interface TaskModalProps {
  open: boolean
  onClose: () => void
  task?: Task                          // edit mode when provided
  prefillSku?: string                  // single-SKU mode (from row-level task button)
  prefillTitle?: string
  prefillVendor?: string               // vendor-order mode
  prefillVendorSkus?: InventoryRecord[] // pre-loaded SKUs for that vendor
  atRiskByVendor?: Record<string, InventoryRecord[]> // all at-risk grouped by vendor
}

type Mode = 'single' | 'vendor'

export default function TaskModal({
  open, onClose, task,
  prefillSku = '', prefillTitle = '',
  prefillVendor, prefillVendorSkus = [],
  atRiskByVendor = {},
}: TaskModalProps) {
  const { profile }           = useAuth()
  const { data: users = [] }  = useUsers()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  const isEdit = !!task

  // Determine initial mode
  const hasVendorContext = !isEdit && (!!prefillVendor || Object.keys(atRiskByVendor).length > 0)
  const [mode, setMode] = useState<Mode>(
    (!isEdit && (prefillVendor || prefillVendorSkus.length > 0)) ? 'vendor' : 'single'
  )

  // Shared fields
  const [title, setTitle]       = useState('')
  const [description, setDesc]  = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]   = useState('')
  const [assignedTo, setAssigned] = useState('')
  const [error, setError]       = useState<string | null>(null)

  // Single-SKU mode
  const [skuCode, setSkuCode] = useState('')

  // Vendor mode
  const vendorList = useMemo(() => Object.keys(atRiskByVendor).sort(), [atRiskByVendor])
  const [selectedVendor, setSelectedVendor] = useState(prefillVendor ?? '')

  const vendorSkus: InventoryRecord[] = useMemo(() => {
    if (prefillVendorSkus.length > 0 && selectedVendor === (prefillVendor ?? selectedVendor)) {
      return prefillVendorSkus
    }
    return atRiskByVendor[selectedVendor] ?? []
  }, [selectedVendor, atRiskByVendor, prefillVendorSkus, prefillVendor])

  // Re-initialise when modal opens
  useEffect(() => {
    if (!open) return

    if (task) {
      // Edit mode
      setMode('single')
      setTitle(task.title)
      setDesc(task.description ?? '')
      setPriority(task.priority)
      setDueDate(task.due_date ?? '')
      setAssigned(task.assigned_to ?? '')
      setSkuCode(task.sku_code ?? '')
    } else {
      // Create mode — detect vendor vs single
      const isVendorMode = !!prefillVendor || prefillVendorSkus.length > 0
      setMode(isVendorMode ? 'vendor' : 'single')
      setSelectedVendor(prefillVendor ?? '')
      setTitle(prefillTitle)
      setDesc('')
      setPriority('medium')
      setDueDate('')
      setAssigned('')
      setSkuCode(prefillSku)
    }
    setError(null)
  }, [open, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill title when vendor changes in vendor mode
  useEffect(() => {
    if (mode !== 'vendor' || isEdit) return
    if (selectedVendor) {
      setTitle(`Order: ${selectedVendor}`)
    } else {
      setTitle('')
    }
  }, [selectedVendor, mode, isEdit])

  // Build vendor task description
  const vendorDescription = useMemo(() => {
    if (mode !== 'vendor' || !selectedVendor || vendorSkus.length === 0) return ''
    const lines = [
      `Vendor: ${selectedVendor}`,
      `At-Risk SKUs (${vendorSkus.length}):`,
      ...vendorSkus.map(r =>
        `• ${r.product_code} — ${r.description} | Days OH: ${r.days_on_hand}d | Rec. Order: ${fmtNumber(r.recommended_order)} units (${fmtCurrency(r.recommended_order_value)})`
      ),
    ]
    return lines.join('\n')
  }, [mode, selectedVendor, vendorSkus])

  const deptUsers = users.filter(u =>
    u.is_active && (u.department === profile?.department || profile?.role === 'admin')
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (mode === 'vendor' && !selectedVendor) { setError('Please select a vendor'); return }
    setError(null)

    const finalDescription = mode === 'vendor'
      ? vendorDescription + (description ? `\n\nNotes:\n${description}` : '')
      : description

    const finalSkuCode = mode === 'vendor'
      ? (vendorSkus[0]?.supplier_code ?? '')
      : skuCode

    const values = {
      title: title.trim(),
      description: finalDescription,
      priority,
      due_date:    dueDate,
      assigned_to: assignedTo,
      sku_code:    finalSkuCode,
      department:  task?.department ?? profile?.department ?? 'purchasing',
    }

    try {
      if (isEdit) {
        await updateTask.mutateAsync({ id: task!.id, values })
      } else {
        await createTask.mutateAsync(values)
      }
      onClose()
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String(err.message)
          : isEdit ? 'Failed to update task' : 'Failed to create task'
      setError(message)
    }
  }

  const isPending = createTask.isPending || updateTask.isPending

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Mode switcher — only in create mode when vendor context is available */}
        {!isEdit && hasVendorContext && (
          <div className="flex rounded-lg border border-border overflow-hidden text-[13px]">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'single' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
            >
              Single SKU
            </button>
            <button
              type="button"
              onClick={() => setMode('vendor')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'vendor' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
            >
              Vendor Order
            </button>
          </div>
        )}

        {/* Vendor selector */}
        {mode === 'vendor' && !isEdit && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Vendor *</label>
            {vendorList.length > 0 ? (
              <select
                className="select w-full"
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
                required
              >
                <option value="">Select a vendor…</option>
                {vendorList.map(v => (
                  <option key={v} value={v}>
                    {v} ({atRiskByVendor[v]?.length ?? 0} at-risk SKUs)
                  </option>
                ))}
              </select>
            ) : (
              <div className="input w-full text-text2 text-sm">{selectedVendor || '—'}</div>
            )}

            {/* SKU preview */}
            {vendorSkus.length > 0 && (
              <div className="mt-2 rounded-lg border border-border bg-surface2 p-2 max-h-32 overflow-y-auto">
                <div className="text-[10px] font-semibold text-text2 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Package size={10} /> {vendorSkus.length} at-risk SKUs included
                </div>
                {vendorSkus.map(r => (
                  <div key={r.id} className="text-[11px] text-text2 py-0.5 flex gap-2 font-mono">
                    <span className="text-accent shrink-0">{r.product_code}</span>
                    <span className="truncate text-text1">{r.description}</span>
                    <span className="shrink-0 text-warning">{r.days_on_hand}d OH</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Title *</label>
          <input
            className="input w-full"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={mode === 'vendor' ? 'Auto-filled from vendor name…' : 'Task title…'}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">
            {mode === 'vendor' ? 'Additional Notes' : 'Description'}
          </label>
          {mode === 'vendor' && vendorSkus.length > 0 && (
            <p className="text-[11px] text-text2 mb-1.5">
              SKU list will be auto-included in task details.
            </p>
          )}
          <textarea
            className="input w-full resize-none"
            rows={3}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder={mode === 'vendor' ? 'Add any additional notes or context…' : 'Optional details…'}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Priority</label>
            <select className="select w-full" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Due Date</label>
            <input type="date" className="input w-full" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Assign to</label>
            <select className="select w-full" value={assignedTo} onChange={e => setAssigned(e.target.value)}>
              <option value="">Unassigned</option>
              {deptUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {mode === 'single' && (
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
              <input className="input w-full" value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
            </div>
          )}
        </div>

        {error && (
          <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? <LoadingSpinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
