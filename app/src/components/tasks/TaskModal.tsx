import { useState, FormEvent } from 'react'
import Modal from '@/components/ui/Modal'
import { useCreateTask } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/contexts/AuthContext'
import { TaskPriority } from '@/types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface TaskModalProps {
  open: boolean
  onClose: () => void
  prefillSku?: string
  prefillTitle?: string
}

export default function TaskModal({ open, onClose, prefillSku = '', prefillTitle = '' }: TaskModalProps) {
  const { profile }  = useAuth()
  const { data: users = [] } = useUsers()
  const createTask = useCreateTask()

  const [title, setTitle]         = useState(prefillTitle)
  const [description, setDesc]    = useState('')
  const [priority, setPriority]   = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]     = useState('')
  const [assignedTo, setAssigned] = useState('')
  const [skuCode, setSkuCode]     = useState(prefillSku)
  const [error, setError]         = useState<string | null>(null)

  const deptUsers = users.filter(u =>
    u.is_active && (u.department === profile?.department || profile?.role === 'admin')
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setError(null)
    try {
      await createTask.mutateAsync({
        title: title.trim(),
        description,
        priority,
        due_date: dueDate,
        assigned_to: assignedTo,
        sku_code: skuCode,
        department: profile?.department ?? 'purchasing',
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Title *</label>
          <input className="input w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title…" required />
        </div>

        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">Description</label>
          <textarea
            className="input w-full resize-none"
            rows={3}
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Optional details…"
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
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">SKU (optional)</label>
            <input className="input w-full" value={skuCode} onChange={e => setSkuCode(e.target.value)} placeholder="product-code" />
          </div>
        </div>

        {error && (
          <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={createTask.isPending} className="btn-primary">
            {createTask.isPending ? <LoadingSpinner size="sm" /> : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
