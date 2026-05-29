import { useMemo, useState } from 'react'
import { useTasks, useUpdateTaskStatus, useDeleteTask } from '@/hooks/useTasks'
import { useAddTaskComment, useTaskCommentCounts } from '@/hooks/useTaskComments'
import { useAuth } from '@/contexts/AuthContext'
import TaskModal from '@/components/tasks/TaskModal'
import TaskCard from '@/components/tasks/TaskCard'
import TaskActionNoteModal from '@/components/tasks/TaskActionNoteModal'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { Plus, CheckCircle, Circle, Clock, AlertCircle, LayoutList, Columns3, Tag, Store, Layers, User } from 'lucide-react'
import type { Task, TaskStatus } from '@/types'
import { calculatePostponedUntil, extractVendor, groupTasksByAssignee } from './TasksPage.helpers'

const STATUS_COLS: { key: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'todo',        label: 'To Do',       icon: <Circle      size={14} className="text-text2" /> },
  { key: 'in_progress', label: 'In Progress', icon: <Clock       size={14} className="text-accent" /> },
  { key: 'postponed',   label: 'Postponed',   icon: <Clock       size={14} className="text-warning" /> },
  { key: 'done',        label: 'Done',        icon: <CheckCircle size={14} className="text-success" /> },
  { key: 'cancelled',   label: 'Cancelled',   icon: <AlertCircle size={14} className="text-text2" /> },
]

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  postponed: 'todo',
  done: 'done',
  cancelled: 'cancelled',
}

type GroupMode = 'status' | 'vendor' | 'category' | 'assignee'
type ActionModal = { type: 'cancel' | 'postpone'; task: Task } | null

export default function TasksPage() {
  const { profile } = useAuth()
  const { data: tasks = [], isLoading, error } = useTasks()
  const updateStatus = useUpdateTaskStatus()
  const deleteTask = useDeleteTask()
  const addComment = useAddTaskComment()

  const [modal, setModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [actionModal, setActionModal] = useState<ActionModal>(null)
  const [postponeDays, setPostponeDays] = useState(7)
  const [deptFilter, setDeptFilter] = useState('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('status')
  const [view, setView] = useState<'board' | 'list'>('list')
  const [showPostponed, setShowPostponed] = useState(false)

  const taskIds = useMemo(() => tasks.map(task => task.id), [tasks])
  const { data: commentCounts = new Map<string, number>() } = useTaskCommentCounts(taskIds)

  if (isLoading) return <PageLoader />

  if (error) return (
    <div className="card text-center py-16">
      <AlertCircle size={32} className="text-danger mx-auto mb-3" />
      <div className="text-text1 font-semibold mb-1">Failed to load tasks</div>
      <div className="text-text2 text-sm">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  const isAllAccess = profile?.role === 'admin' || profile?.role === 'csuite'
  const departments = isAllAccess
    ? Array.from(new Set(tasks.map(t => t.department).filter(Boolean))).sort() as string[]
    : []

  const departmentFiltered = deptFilter === 'all' ? tasks : tasks.filter(t => t.department === deptFilter)
  const postponedCount = departmentFiltered.filter(t => t.status === 'postponed').length
  const filtered = showPostponed
    ? departmentFiltered
    : departmentFiltered.filter(t => t.status !== 'postponed')

  function handleAdvance(task: Task) {
    updateStatus.mutate({ id: task.id, status: NEXT_STATUS[task.status] })
  }

  async function handleActionSubmit(note: string) {
    if (!actionModal) return
    const { task, type } = actionModal
    const status = type === 'cancel' ? 'cancelled' : 'postponed'
    const postponed_until = type === 'postpone' ? calculatePostponedUntil(postponeDays) : null

    await updateStatus.mutateAsync({ id: task.id, status, postponed_until })
    if (note.trim()) {
      await addComment.mutateAsync({ task_id: task.id, body: note, kind: type })
    }
    setActionModal(null)
  }

  const cardProps = {
    profile,
    showDept: isAllAccess && groupMode === 'status',
    onAdvance: handleAdvance,
    onCancel: (task: Task) => setActionModal({ type: 'cancel', task }),
    onPostpone: (task: Task) => {
      setPostponeDays(7)
      setActionModal({ type: 'postpone', task })
    },
    onEdit: setEditingTask,
    onDelete: (id: string) => deleteTask.mutate(id),
  }

  function renderTask(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        commentCount={commentCounts.get(task.id) ?? 0}
        {...cardProps}
      />
    )
  }

  function BoardView() {
    return (
      <div className="grid grid-cols-4 gap-4">
        {STATUS_COLS.filter(col => showPostponed || col.key !== 'postponed').map(col => {
          const colTasks = filtered.filter(t => t.status === col.key)
          return (
            <div key={col.key} className="bg-surface2 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                {col.icon}
                <span className="text-[12px] font-semibold text-text1">{col.label}</span>
                <span className="text-[10px] text-text2 bg-surface px-1.5 py-0.5 rounded-full ml-auto">{colTasks.length}</span>
              </div>
              <div className="space-y-2">{colTasks.map(renderTask)}</div>
            </div>
          )
        })}
      </div>
    )
  }

  function GroupSection({ label, icon, tasks: group }: { label: string; icon: React.ReactNode; tasks: Task[] }) {
    if (group.length === 0) return null
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h2 className="text-[13px] font-semibold text-text1">{label}</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{group.length}</span>
        </div>
        {group.map(renderTask)}
      </div>
    )
  }

  function ListView() {
    if (groupMode === 'status') {
      return (
        <div className="space-y-6">
          {STATUS_COLS
            .filter(col => (showPostponed || col.key !== 'postponed') && (col.key !== 'cancelled' || filtered.some(t => t.status === 'cancelled')))
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
      const vendorMap: Record<string, Task[]> = { Other: [] }
      for (const task of filtered) {
        const vendor = extractVendor(task)
        if (vendor) (vendorMap[vendor] ||= []).push(task)
        else vendorMap.Other.push(task)
      }
      const vendors = Object.keys(vendorMap).filter(k => k !== 'Other').sort()

      return (
        <div className="space-y-6">
          {vendors.map(vendor => <GroupSection key={vendor} label={vendor} icon={<Store size={14} className="text-accent" />} tasks={vendorMap[vendor]} />)}
          {vendorMap.Other.length > 0 && <GroupSection label="Other" icon={<Tag size={14} className="text-text2" />} tasks={vendorMap.Other} />}
        </div>
      )
    }

    if (groupMode === 'category') {
      const deptMap: Record<string, Task[]> = { Other: [] }
      for (const task of filtered) {
        if (task.department) (deptMap[task.department] ||= []).push(task)
        else deptMap.Other.push(task)
      }
      const depts = Object.keys(deptMap).filter(k => k !== 'Other').sort()

      return (
        <div className="space-y-6">
          {depts.map(dept => <GroupSection key={dept} label={dept} icon={<Layers size={14} className="text-accent" />} tasks={deptMap[dept]} />)}
          {deptMap.Other.length > 0 && <GroupSection label="Other" icon={<Tag size={14} className="text-text2" />} tasks={deptMap.Other} />}
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {groupTasksByAssignee(filtered).map(group => (
          <GroupSection
            key={group.label}
            label={group.label}
            icon={<User size={14} className={group.isUnassigned ? 'text-text2' : 'text-accent'} />}
            tasks={group.tasks}
          />
        ))}
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isAllAccess && (
            <select className="select text-xs" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {postponedCount > 0 && (
            <button onClick={() => setShowPostponed(value => !value)} className="btn-secondary text-xs">
              {showPostponed ? 'Hide' : 'Show'} postponed ({postponedCount})
            </button>
          )}

          {view === 'list' && (
            <div className="flex rounded-lg border border-border overflow-hidden text-[12px]">
              {([
                ['status', <LayoutList size={12} />, 'Status'],
                ['vendor', <Store size={12} />, 'Vendor'],
                ['category', <Layers size={12} />, 'Category'],
                ['assignee', <User size={12} />, 'Assignee'],
              ] as const).map(([mode, icon, label]) => (
                <button
                  key={mode}
                  onClick={() => setGroupMode(mode)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${groupMode === mode ? 'bg-accent/15 text-accent font-medium' : 'text-text2 hover:bg-surface2'}`}
                  title={`Group by ${label.toLowerCase()}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          )}

          <button onClick={() => setView(v => v === 'board' ? 'list' : 'board')} className="btn-secondary text-xs flex items-center gap-1">
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
      {editingTask && <TaskModal open={!!editingTask} task={editingTask} onClose={() => setEditingTask(null)} />}
      {actionModal && (
        <TaskActionNoteModal
          open={!!actionModal}
          title={actionModal.type === 'cancel' ? 'Cancel Task' : 'Postpone Task'}
          label={actionModal.type === 'cancel' ? 'Cancellation note' : 'Postpone note'}
          submitLabel={actionModal.type === 'cancel' ? 'Cancel task' : 'Postpone task'}
          durationDays={actionModal.type === 'postpone' ? postponeDays : undefined}
          onDurationChange={actionModal.type === 'postpone' ? setPostponeDays : undefined}
          isPending={updateStatus.isPending || addComment.isPending}
          onClose={() => setActionModal(null)}
          onSubmit={handleActionSubmit}
        />
      )}
    </div>
  )
}
