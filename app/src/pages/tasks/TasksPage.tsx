import { useState, useMemo } from 'react'
import { useTasks, useUpdateTaskStatus, useDeleteTask } from '@/hooks/useTasks'
import { useAuth } from '@/contexts/AuthContext'
import TaskModal from '@/components/tasks/TaskModal'
import Badge, { priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { fmtDate, isOverdue } from '@/lib/utils'
import { Plus, Trash2, CheckCircle, Circle, Clock, AlertCircle, Pencil, LayoutList, Columns3, Tag, Store, Layers } from 'lucide-react'
import { Task, TaskStatus } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLS: { key: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'todo',        label: 'To Do',      icon: <Circle      size={14} className="text-text2" /> },
  { key: 'in_progress', label: 'In Progress', icon: <Clock       size={14} className="text-accent" /> },
  { key: 'done',        label: 'Done',        icon: <CheckCircle size={14} className="text-success" /> },
  { key: 'cancelled',   label: 'Cancelled',   icon: <AlertCircle size={14} className="text-text2" /> },
]

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo:        'in_progress',
  in_progress: 'done',
  done:        'done',
  cancelled:   'cancelled',
}

type GroupMode = 'status' | 'vendor' | 'category'

/** Extract vendor name from task description that starts with "Vendor: <name>" */
function extractVendor(task: Task): string | null {
  if (!task.description) return null
  const match = task.description.match(/^Vendor:\s*(.+)/m)
  return match ? match[1].trim() : null
}

// ── TaskCard (standalone — not nested, to avoid React remount on every render) ──

interface TaskCardProps {
  task: Task
  profile: { id: string; role: string; department: string | null } | null
  showDept: boolean
  updateStatus: ReturnType<typeof useUpdateTaskStatus>
  deleteTask: ReturnType<typeof useDeleteTask>
  onEdit: (task: Task) => void
}

function TaskCard({ task, profile, showDept, updateStatus, deleteTask, onEdit }: TaskCardProps) {
  const overdue    = isOverdue(task.due_date)
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
          {task.status === 'done'
            ? <CheckCircle size={16} className="text-success" />
            : <Circle size={16} />}
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
          onClick={() => onEdit(task)}
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
        {showDept && task.department && (
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { profile }                         = useAuth()
  const { data: tasks = [], isLoading, error } = useTasks()
  const updateStatus = useUpdateTaskStatus()
  const deleteTask   = useDeleteTask()

  const [modal, setModal]             = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deptFilter, setDeptFilter]   = useState('all')
  const [groupMode, setGroupMode]   = useState<GroupMode>('status')
  const [view, setView]               = useState<'board' | 'list'>('list')

  if (isLoading) return <PageLoader />

  if (error) return (
    <div className="card text-center py-16">
      <AlertCircle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold mb-1">Failed to load tasks</div>
      <div className="text-text2 text-sm">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  const isAllAccess  = profile?.role === 'admin' || profile?.role === 'csuite'
  const departments  = isAllAccess
    ? Array.from(new Set(tasks.map(t => t.department).filter(Boolean))).sort() as string[]
    : []

  const filtered = deptFilter === 'all' ? tasks : tasks.filter(t => t.department === deptFilter)

  const cardProps = { profile, showDept: isAllAccess && groupMode === 'status', updateStatus, deleteTask, onEdit: setEditingTask }

  // ── Board view (always by status) ──────────────────────────────────────────
  function BoardView() {
    return (
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
                {colTasks.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Grouped section renderer ────────────────────────────────────────────────
  function GroupSection({ label, icon, tasks: group }: { label: string; icon: React.ReactNode; tasks: Task[] }) {
    if (group.length === 0) return null
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h2 className="text-[13px] font-semibold text-text1">{label}</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{group.length}</span>
        </div>
        {group.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  function ListView() {
    if (groupMode === 'status') {
      return (
        <div className="space-y-6">
          {STATUS_COLS
            .filter(col => col.key !== 'cancelled' || filtered.some(t => t.status === 'cancelled'))
            .map(col => (
              <GroupSection
                key={col.key}
                label={col.label}
                icon={col.icon}
                tasks={filtered.filter(t => t.status === col.key)}
              />
            ))}
        </div>
      )
    }

    if (groupMode === 'vendor') {
      // Group by vendor extracted from description; fallback to "Other"
      const vendorMap: Record<string, Task[]> = { Other: [] }
      for (const t of filtered) {
        const v = extractVendor(t)
        if (v) {
          (vendorMap[v] ||= []).push(t)
        } else {
          vendorMap['Other'].push(t)
        }
      }
      const vendors = Object.keys(vendorMap)
        .filter(k => k !== 'Other')
        .sort()

      return (
        <div className="space-y-6">
          {vendors.map(v => (
            <GroupSection
              key={v}
              label={v}
              icon={<Store size={14} className="text-accent" />}
              tasks={vendorMap[v]}
            />
          ))}
          {vendorMap['Other'].length > 0 && (
            <GroupSection
              label="Other"
              icon={<Tag size={14} className="text-text2" />}
              tasks={vendorMap['Other']}
            />
          )}
        </div>
      )
    }

    if (groupMode === 'category') {
      // Group by department (= category); tasks without department go to "Other"
      const deptMap: Record<string, Task[]> = { Other: [] }
      for (const t of filtered) {
        const d = t.department
        if (d) {
          (deptMap[d] ||= []).push(t)
        } else {
          deptMap['Other'].push(t)
        }
      }
      const depts = Object.keys(deptMap)
        .filter(k => k !== 'Other')
        .sort()

      return (
        <div className="space-y-6">
          {depts.map(d => (
            <GroupSection
              key={d}
              label={d}
              icon={<Layers size={14} className="text-accent" />}
              tasks={deptMap[d]}
            />
          ))}
          {deptMap['Other'].length > 0 && (
            <GroupSection
              label="Other"
              icon={<Tag size={14} className="text-text2" />}
              tasks={deptMap['Other']}
            />
          )}
        </div>
      )
    }

    return null
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-text1">Tasks</h1>
          <p className="text-text2 text-sm mt-0.5">
            {isAllAccess ? 'All departments' : `${profile?.department ?? 'Your'} department`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAllAccess && (
            <select className="select text-xs" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {/* Group by toggle */}
          {view === 'list' && (
            <div className="flex rounded-lg border border-border overflow-hidden text-[12px]">
              <button
                onClick={() => setGroupMode('status')}
                className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${groupMode === 'status' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
                title="Group by status"
              >
                <LayoutList size={12} /> Status
              </button>
              <button
                onClick={() => setGroupMode('vendor')}
                className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${groupMode === 'vendor' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
                title="Group by vendor"
              >
                <Store size={12} /> Vendor
              </button>
              <button
                onClick={() => setGroupMode('category')}
                className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${groupMode === 'category' ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
                title="Group by department / category"
              >
                <Layers size={12} /> Category
              </button>
            </div>
          )}

          <button
            onClick={() => setView(v => v === 'board' ? 'list' : 'board')}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            {view === 'list' ? <><Columns3 size={13} /> Board</> : <><LayoutList size={13} /> List</>}
          </button>

          {(profile?.role === 'admin' || profile?.role === 'purchasing') && (
            <button onClick={() => setModal(true)} className="btn-primary text-xs">
              <Plus size={14} /> New Task
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-text2 text-sm">No tasks</div>
      ) : view === 'board' ? (
        <BoardView />
      ) : (
        <ListView />
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
