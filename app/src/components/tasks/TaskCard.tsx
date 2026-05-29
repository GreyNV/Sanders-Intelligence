import Badge, { priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { fmtDate, isOverdue } from '@/lib/utils'
import { CheckCircle, Circle, Clock3, MessageSquare, Pencil, Trash2, XCircle } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { Task } from '@/types'

interface TaskCardProps {
  task: Task
  profile: { id: string; role: string; department: string | null } | null
  showDept: boolean
  commentCount?: number
  onAdvance: (task: Task) => void
  onCancel: (task: Task) => void
  onPostpone: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
}

export default function TaskCard({
  task,
  profile,
  showDept,
  commentCount = 0,
  onAdvance,
  onCancel,
  onPostpone,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const overdue = isOverdue(task.due_date)
  const isClosed = task.status === 'done' || task.status === 'cancelled'
  const canAdvance = task.status === 'todo' || task.status === 'in_progress'
  const canPostpone = task.status === 'todo' || task.status === 'in_progress'
  const canDelete = profile?.role === 'admin' || task.created_by === profile?.id
  const stopCardClick = (event: MouseEvent) => event.stopPropagation()

  return (
    <div
      className={`card mb-2 flex flex-col gap-2 cursor-pointer hover:bg-surface2/50 transition-colors ${task.status === 'postponed' ? 'border-warning/30 bg-warning/5' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(task)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit(task)
        }
      }}
      title="Open task"
    >
      <div className="flex items-start gap-2">
        <button
          onClick={(event) => {
            stopCardClick(event)
            if (canAdvance) onAdvance(task)
          }}
          className="mt-0.5 flex-shrink-0 text-text2 hover:text-success transition-colors disabled:opacity-40"
          disabled={!canAdvance}
          title={canAdvance ? (task.status === 'todo' ? 'Mark in progress' : 'Mark done') : undefined}
        >
          {task.status === 'done'
            ? <CheckCircle size={16} className="text-success" />
            : <Circle size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-medium ${isClosed ? 'line-through text-text2' : 'text-text1'}`}>
            {task.title}
          </div>
          {task.description && (
            <div className="text-[11px] text-text2 mt-0.5 line-clamp-2">{task.description}</div>
          )}
        </div>
        {commentCount > 0 && (
          <button
            onClick={(event) => {
              stopCardClick(event)
              onEdit(task)
            }}
            className="p-1 text-text2 hover:text-accent transition-colors flex-shrink-0"
            title={`${commentCount} notes`}
          >
            <span className="flex items-center gap-1 text-[11px]">
              <MessageSquare size={13} /> {commentCount}
            </span>
          </button>
        )}
        {canPostpone && (
          <button
            onClick={(event) => {
              stopCardClick(event)
              onPostpone(task)
            }}
            className="p-1 text-text2 hover:text-warning transition-colors flex-shrink-0"
            title="Postpone task"
          >
            <Clock3 size={13} />
          </button>
        )}
        {canAdvance && (
          <button
            onClick={(event) => {
              stopCardClick(event)
              onCancel(task)
            }}
            className="p-1 text-text2 hover:text-danger transition-colors flex-shrink-0"
            title="Cancel task"
          >
            <XCircle size={13} />
          </button>
        )}
        <button
          onClick={(event) => {
            stopCardClick(event)
            onEdit(task)
          }}
          className="p-1 text-text2 hover:text-accent transition-colors flex-shrink-0"
          title="Edit task"
        >
          <Pencil size={13} />
        </button>
        {canDelete && (
          <button
            onClick={(event) => {
              stopCardClick(event)
              onDelete(task.id)
            }}
            className="p-1 text-text2 hover:text-danger transition-colors flex-shrink-0"
            title="Delete task"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap pl-6">
        <Badge variant={priorityVariant(task.priority)} value={task.priority} />
        <Badge variant={taskStatusVariant(task.status)} value={task.status} />
        {showDept && task.department && (
          <span className="text-[10px] bg-surface2 text-text2 px-1.5 py-0.5 rounded">{task.department}</span>
        )}
        {task.sku_code && (
          <span className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">{task.sku_code}</span>
        )}
        {task.due_date && (
          <span className={`text-[11px] ${overdue && !isClosed ? 'text-danger font-semibold' : 'text-text2'}`}>
            {overdue && !isClosed ? 'Overdue: ' : 'Due '}{fmtDate(task.due_date)}
          </span>
        )}
        {task.postponed_until && (
          <span className="text-[11px] text-warning">Postponed until {fmtDate(task.postponed_until)}</span>
        )}
        {task.assignee && (
          <span className="text-[11px] text-text2">Assigned to {task.assignee.name}</span>
        )}
      </div>
    </div>
  )
}
