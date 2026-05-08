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
  task?: Task                           // edit mode when provided
  prefillSku?: string                   // single-SKU mode (from row-level task button)
  prefillTitle?: string
  prefillVendor?: string                // vendor-order mode
  prefillVendorSkus?: InventoryRecord[] // pre-loaded SKUs for that vendor
  atRiskByVendor?: Record<string, InventoryRecord[]> // all at-risk grouped by vendor
}

type Mode = 'single' | 'vendor'

/** Parse "Vendor: XXX" from the first line of a description */
function parseVendorLine(desc: string | null | undefined): string {
  if (!desc) return ''
  const m = desc.match(/^Vendor:\s*(.+)/m)
  return m ? m[1].trim() : ''
}

/** Replace or prepend the "Vendor: XXX" first line in a description */
function replaceVendorLine(desc: string, newVendor: string): string {
  if (/^Vendor:\s*.+/m.test(desc)) {
    return desc.replace(/^Vendor:\s*.+/m, `Vendor: ${newVendor}`)
  }
  return `Vendor: ${newVendor}\n${desc}`
}

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

  // Vendor context exists in create mode when at-risk data or prefill is present
  const hasVendorContext = !isEdit && (!!prefillVendor || Object.keys(atRiskByVendor).length > 0)

  const [mode, setMode] = useState<Mode>(
    (!isEdit && (prefillVendor || prefillVendorSkus.length > 0)) ? 'vendor' : 'single'
  )

  // Shared fields
  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [priority, setPriority]     = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]       = useState('')
  const [assignedTo, setAssigned]   = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError]           = useState<string | null>(null)

  // Single-SKU mode
  const [skuCode, setSkuCode] = useState('')

  // Create/vendor mode — vendor selector
  const vendorList = useMemo(() => Object.keys(atRiskByVendor).sort(), [atRiskByVendor])
  const [selectedVendor, setSelectedVendor] = useState(prefillVendor ?? '')

  // Edit mode — vendor line exposed as separate field
  const [editVendor, setEditVendor] = useState('')

  const vendorSkus: InventoryRecord[] = useMemo(() => {
    if (prefillVendorSkus.length > 0 && selectedVendor === (prefillVendor ?? selectedVendor)) {
      return prefillVendorSkus
    }
    return atRiskByVendor[selectedVendor] ?? []
  }, [selectedVendor, atRiskByVendor, prefillVendorSkus, prefillVendor])

  // Distinct departments from all users for dropdown
  const departments = useMemo(
    () => Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort() as string[],
    [users]
  )

  // ── Re-initialise when modal opens ───────────────────────────
  useEffect(() => {
    if (!open) return

    if (task) {
      setMode('single')
      setTitle(task.title)
      setDesc(task.description ?? '')
      setPriority(task.priority)
      setDueDate(task.due_date ?? '')
      setAssigned(task.assigned_to ?? '')
      setSkuCode(task.sku_code ?? '')
      setDepartment(task.department ?? profile?.department ?? '')
      setEditVendor(parseVendorLine(task.description))
    } else {
      const isVendorMode = !!prefillVendor || prefillVendorSkus.length > 0
      setMode(isVendorMode ? 'vendor' : 'single')
      setSelectedVendor(prefillVendor ?? '')
      setTitle(prefillTitle)
      setDesc('')
      setPriority('medium')
      setDueDate('')
      setAssigned('')
      setSkuCode(prefillSku)
      setDepartment(profile?.department ?? 'purchasing')
      setEditVendor('')
    }
    setError(null)
  }, [open, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill title when vendor changes (create / vendor mode)
  useEffect(() => {
    if (mode !== 'vendor' || isEdit) return
    setTitle(selectedVendor ? `Order: ${selectedVendor}` : '')
  }, [selectedVendor, mode, isEdit])

  // Sync editVendor field → description first line (edit mode)
  useEffect(() => {
    if (!isEdit || !open) return
    if (editVendor.trim()) {
      setDesc(prev => replaceVendorLine(prev, editVendor.trim()))
    }
  }, [editVendor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build auto-generated vendor task description (create mode)
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

  // Users eligible to be assigned — same dept as task, or all if admin
  const deptUsers = users.filter(u =>
    u.is_active && (u.department === (department || profile?.department) || profile?.role === 'admin')
  )

  // Does the task being edited have a vendor prefix?
  const editHasVendor = isEdit && !!parseVendorLine(task?.description)

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
      title:       title.trim(),
      description: finalDescription,
      priority,
      due_date:    dueDate,
      assigned_to: assignedTo,
      sku_code:    finalSkuCode,
      department:  department || profile?.department || 'purchasing',
    }

    try {
      if (isEdit) {
        await updateTask.mutateAsync({ id: task!.id, values })
      } else {
        await createTask.mutateAsync(values)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? 'Failed to update task' : 'Failed to create task')
    }
  }

  const isPending = createTask.isPending || updateTask.isPending

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Task'}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Mode switcher — create mode, vendor context available */}
        {!isEdit && hasVendorContext && (
          <div className="flex rounded-lg border border-border overflow-hidden text-[13px]">
            <button type="button" onClick={() => setMode('single')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'single' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}>
              Single SKU
            </button>
            <button type="button" onClick={() => setMode('vendor')}
              className={`flex-1 py-1.5 transition-colors ${mode === 'vendor' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}>
              Vendor Order
            </button>
          </div>
        )}

        {/* Vendor selector — create / vendor mode */}
        {mode === 'vendor' && !isEdit && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Vendor *</label>
            {vendorList.length > 0 ? (
              <select className="select w-full" value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)} required>
                <option value="">Select a vendor…</option>
                {vendorList.map(v => (
                  <option key={v} value={v}>{v} ({atRiskByVendor[v]?.length ?? 0} at-risk SKUs)</option>
                ))}
              </select>
            ) : (
              <div className="input w-full text-text2 text-sm">{selectedVendor || '—'}</div>
            )}

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

        {/* Vendor field — edit mode, only for tasks that have a vendor prefix */}
        {editHasVendor && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Vendor</label>
            <input
              className="input w-full"
              value={editVendor}
              onChange={e => setEditVendor(e.target.value)}
              placeholder="Vendor name…"
            />
            <p className="text-[10px] text-text2 mt-1">Updates the vendor reference in the description.</p>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Title *</label>
          <input
            className="input w-full"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={mode === 'vendor' && !isEdit ? 'Auto-filled from vendor name…' : 'Task title…'}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">
            {mode === 'vendor' && !isEdit ? 'Additional Notes' : 'Description'}
          </label>
          {mode === 'vendor' && !isEdit && vendorSkus.length > 0 && (
            <p className="text-[11px] text-text2 mb-1.5">SKU list will be auto-included in task details.</p>
          )}
          <textarea
            className="input w-full resize-none"
            rows={editHasVendor ? 5 : 3}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder={mode === 'vendor' && !isEdit ? 'Add any additional notes or context…' : 'Optional details…'}
          />
        </div>

        {/* Priority + Due Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Priority</label>
            <select className="select w-full" value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Due Date</label>
            <input type="date" className="input w-full" value={dueDate}
              onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Assign to + SKU / Department */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Assign to</label>
            <select className="select w-full" value={assignedTo}
              onChange={e => setAssigned(e.target.value)}>
              <option value="">Unassigned</option>
              {deptUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {mode === 'single' && !isEdit && (
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
              <input className="input w-full" value={skuCode}
                onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
            </div>
          )}
          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
              <input className="input w-full" value={skuCode}
                onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
            </div>
          )}
        </div>

        {/* Department / Category — always shown */}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Department / Category</label>
          <select className="select w-full" value={department}
            onChange={e => setDepartment(e.target.value)}>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
            {/* Ensure current value is always present even if not in user list */}
            {department && !departments.includes(department) && (
              <option value={department}>{department}</option>
            )}
            {departments.length === 0 && (
              <option value={profile?.department ?? 'purchasing'}>{profile?.department ?? 'purchasing'}</option>
            )}
          </select>
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
