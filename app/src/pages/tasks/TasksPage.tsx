import { useState } from 'react'
import { useTasks, useUpdateTaskStatus, useDeleteTask } from '@/hooks/useTasks'
import { useAuth } from '@/contexts/AuthContext'
import TaskModal from '@/components/tasks/TaskModal'
import Badge, { priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtDate, isOverdue } from '@/lib/utils'
import { Plus, Trash2, CheckCircle, Circle, Clock, AlertCircle, Pencil } from 'lucide-react'
import { Task, TaskStatus } from '@/types'

const STATUS_COLS: { key: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'todo',        label: 'To Do',      icon: <Circle size={14} className="text-text2" /> },
  { key: 'in_progress', label: 'In Progress', icon: <Clock size={14} className="text-accent" /> },
  { key: 'done',        label: 'Done',        icon: <CheckCircle size={14} className="text-success" /> },
  { key: 'cancelled',   label: 'Cancelled',   icon: <AlertCircle size={14} className="text-text2" /> },
]

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'done',
  cancelled: 'cancelled',
}

export default function TasksPage() {
  const { profile }         = useAuth()
  const { data: tasks = [], isLoading } = useTasks()
  const updateStatus = useUpdateTaskStatus()
  const deleteTask   = useDeleteTask()
  const [modal, setModal]       = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deptFilter, setDeptFilter] = useState('all')
  const [view, setView]         = useState<'board' | 'list'>('list')

  if (isLoading) return <PageLoader />

  const isAllAccess = profile?.role === 'admin' || profile?.role === 'csuite'
  const departments = isAllAccess
    ? Array.from(new Set(tasks.map(t => t.department))).sort()
    : []

  const filtered = deptFilter === 'all' ? tasks : tasks.filter(t => t.department === deptFilter)

  function TaskCard({ task }: { task: Task }) {
    const overdue = isOverdue(task.due_date)
    const canAdvance = task.status !== 'done' && task.status !== 'cancelled'
    const canDelete  = profile?.role === 'admin' || task.created_by === profile?.id

    return (
      <div className="card mb-2 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <button
            onClick={() => canAdvance && updateStatus.mutate({ id: task.id, status: NEXT_STATUS[task.status] })}
            className="mt-0.5 flex-shrink-0 text-text2 hover:text-success transition-colors disabled:opacity-40"
            disabled={!canAdvance}
            title={canAdvance ? `Mark as ${NEXT_STATUS[task.status]}` : undefined}
          >
            {task.status === 'done' ? <CheckCircle size={16} className="text-success" /> : <Circle size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <div className={`text-[13px] font-medium ${task.status === 'done' ? 'line-through text-text2' : 'text-text1'}`}>
              {task.title}
            </div>
            {task.description && (
              <div className="text-[11px] text-text2 mt-0.5 line-clamp-2">{task.description}</div>
            )}
          </div>
          <button
            onClick={() => setEditingTask(task)}
            className="p-1 text-text2 hover:text-accent transition-colors flex-shrink-0"
            title="Edit task"
          >
            <Pencil size={13} />
          </button>
          {canDelete && (
            <button
              onClick={() => deleteTask.mutate(task.id)}
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
          {isAllAccess && task.department && (
            <span className="text-[10px] bg-surface2 text-text2 px-1.5 py-0.5 rounded">{task.department}</span>
          )}
          {task.sku_code && (
            <span className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">{task.sku_code}</span>
          )}
          {task.due_date && (
            <span className={`text-[11px] ${overdue && task.status !== 'done' ? 'text-danger font-semibold' : 'text-text2'}`}>
              {overdue && task.status !== 'done' ? '⚠ ' : ''}Due {fmtDate(task.due_date)}
            </span>
          )}
          {task.assignee && (
            <span className="text-[11px] text-text2">→ {task.assignee.name}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text1">Tasks</h1>
          <p className="text-text2 text-sm mt-0.5">
            {isAllAccess ? 'All departments' : `${profile?.department ?? 'Your'} department`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAllAccess && (
            <select className="select text-xs" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <button onClick={() => setView(v => v === 'board' ? 'list' : 'board')} className="btn-secondary text-xs">
            {view === 'list' ? 'Board View' : 'List View'}
          </button>
          {(profile?.role === 'admin' || profile?.role === 'purchasing') && (
            <button onClick={() => setModal(true)} className="btn-primary text-xs">
              <Plus size={14} /> New Task
            </button>
          )}
        </div>
      </div>

      {view === 'list' ? (
        // List view grouped by status
        <div className="space-y-6">
          {STATUS_COLS.filter(col => col.key !== 'cancelled' || filtered.some(t => t.status === 'cancelled')).map(col => {
            const colTasks = filtered.filter(t => t.status === col.key)
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 mb-3">
                  {col.icon}
                  <h2 className="text-[13px] font-semibold text-text1">{col.label}</h2>
                  <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                {colTasks.length === 0 ? (
                  <div className="text-xs text-text2 pl-5">No tasks</div>
                ) : (
                  colTasks.map(t => <TaskCard key={t.id} task={t} />)
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // Board view
        <div className="grid grid-cols-4 gap-4">
          {STATUS_COLS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="bg-surface2 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-3">
                  {col.icon}
                  <span className="text-[12px] font-semibold text-text1">{col.label}</span>
                  <span className="text-[10px] text-text2 bg-surface px-1.5 py-0.5 rounded-full ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(t => <TaskCard key={t.id} task={t} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && <TaskModal open={modal} onClose={() => setModal(false)} />}
      {editingTask && (
        <TaskModal
          open={!!editingTask}
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  )
}
