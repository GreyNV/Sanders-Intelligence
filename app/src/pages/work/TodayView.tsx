import { useMemo, useState } from 'react'
import {
  CheckCircle, ChevronDown, ChevronRight, Clock, Plus, RotateCcw, Sparkles, UserPlus, Users,
} from 'lucide-react'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import TaskCard from '@/components/tasks/TaskCard'
import TaskModal from '@/components/tasks/TaskModal'
import TaskActionNoteModal from '@/components/tasks/TaskActionNoteModal'
import { useAuth } from '@/contexts/AuthContext'
import { useClaimTask, useTasks, useUpdateTaskStatus } from '@/hooks/useTasks'
import { useAddTaskComment, useTaskCommentCounts } from '@/hooks/useTaskComments'
import { fmtDate } from '@/lib/utils'
import type { Task } from '@/types'
import { calculatePostponedUntil } from '@/pages/tasks/TasksPage.helpers'
import { computeTodayCounters, partitionTodayTasks } from './TodayView.helpers'

type ActionModal = { type: 'cancel' | 'postpone'; task: Task } | null

export default function TodayView() {
  const { profile } = useAuth()
  const { data: tasks = [], isLoading, error } = useTasks()
  const updateStatus = useUpdateTaskStatus()
  const claimTask = useClaimTask()
  const addComment = useAddTaskComment()

  const [modal, setModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [readOnlyTask, setReadOnlyTask] = useState(false)
  const [actionModal, setActionModal] = useState<ActionModal>(null)
  const [postponeDays, setPostponeDays] = useState(7)
  const [showYesterday, setShowYesterday] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const taskIds = useMemo(() => tasks.map(task => task.id), [tasks])
  const { data: commentCounts = new Map<string, number>() } = useTaskCommentCounts(taskIds)
  const partitions = useMemo(
    () => profile
      ? partitionTodayTasks(tasks, profile.id)
      : { yourTasks: [], unassignedTasks: [], otherTasks: [], cameBackTasks: [], completedYesterday: [] },
    [tasks, profile]
  )
  const counters = useMemo(
    () => profile ? computeTodayCounters(tasks, profile.id) : { createdToday: 0, completedToday: 0, dueToday: 0 },
    [tasks, profile]
  )

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <div className="text-text1 font-semibold mb-1">Failed to load today&apos;s tasks</div>
      <div className="text-text2 text-sm">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  function openTask(task: Task, readOnly = false) {
    setReadOnlyTask(readOnly)
    setEditingTask(task)
  }

  function handleAdvance(task: Task) {
    updateStatus.mutate({ id: task.id, status: task.status === 'todo' ? 'in_progress' : 'done' })
  }

  async function handleActionSubmit(note: string) {
    if (!actionModal) return
    const trimmedNote = note.trim()
    if (!trimmedNote) return
    const { task, type } = actionModal
    const status = type === 'cancel' ? 'cancelled' : 'postponed'
    const postponed_until = type === 'postpone' ? calculatePostponedUntil(postponeDays) : null

    await updateStatus.mutateAsync({ id: task.id, status, postponed_until })
    await addComment.mutateAsync({ task_id: task.id, body: trimmedNote, kind: type })
    setActionModal(null)
  }

  async function handleClaim(task: Task) {
    setClaimError(null)
    try {
      await claimTask.mutateAsync(task.id)
    } catch (claimFailure) {
      setClaimError(claimFailure instanceof Error ? claimFailure.message : 'Failed to claim task.')
    }
  }

  function renderOwnedTask(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        showDept={profile?.role === 'admin' || profile?.role === 'csuite'}
        commentCount={commentCounts.get(task.id) ?? 0}
        onAdvance={handleAdvance}
        onCancel={taskToCancel => setActionModal({ type: 'cancel', task: taskToCancel })}
        onPostpone={taskToPostpone => {
          setPostponeDays(7)
          setActionModal({ type: 'postpone', task: taskToPostpone })
        }}
        onEdit={taskToEdit => openTask(taskToEdit)}
      />
    )
  }

  function renderReadOnlyTask(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        showDept={profile?.role === 'admin' || profile?.role === 'csuite'}
        commentCount={commentCounts.get(task.id) ?? 0}
        readOnly
        onAdvance={() => undefined}
        onCancel={() => undefined}
        onPostpone={() => undefined}
        onEdit={taskToInspect => openTask(taskToInspect, true)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-text1">Today</h1>
          <p className="text-text2 text-sm mt-0.5">Today - {fmtDate(new Date().toISOString())}</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'purchasing') && (
          <button onClick={() => setModal(true)} className="btn-primary text-xs">
            <Plus size={14} /> New Task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <KPICard label="Created today (team)" value={counters.createdToday} icon={<Sparkles size={18} />} variant="info" />
        <KPICard label="Completed today (team)" value={counters.completedToday} icon={<CheckCircle size={18} />} variant="success" />
        <KPICard label="Due today (you)" value={counters.dueToday} icon={<Clock size={18} />} variant="warning" />
      </div>

      <section className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-accent" />
          <h2 className="text-sm font-semibold text-text1">Your tasks</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{partitions.yourTasks.length}</span>
        </div>
        {partitions.yourTasks.length === 0
          ? <div className="card text-center py-10 text-text2 text-sm">You have nothing due or in progress today.</div>
          : <div>{partitions.yourTasks.map(renderOwnedTask)}</div>}
      </section>

      <section className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={15} className="text-warning" />
          <h2 className="text-sm font-semibold text-text1">Unassigned due today</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{partitions.unassignedTasks.length}</span>
        </div>
        {claimError && <div className="mb-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{claimError}</div>}
        {partitions.unassignedTasks.length === 0 ? (
          <div className="card text-center py-10 text-text2 text-sm">No unassigned tasks are due today.</div>
        ) : (
          <div className="space-y-2">
            {partitions.unassignedTasks.map(task => (
              <div key={task.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{renderReadOnlyTask(task)}</div>
                <button
                  type="button"
                  className="btn-secondary text-xs shrink-0"
                  disabled={claimTask.isPending}
                  onClick={() => handleClaim(task)}
                >
                  <UserPlus size={13} /> Claim
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <Users size={15} className="text-text2" />
          <h2 className="text-sm font-semibold text-text1">All other tasks due today</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{partitions.otherTasks.length}</span>
        </div>
        {partitions.otherTasks.length === 0
          ? <div className="card text-center py-10 text-text2 text-sm">No other team tasks are due today.</div>
          : <div>{partitions.otherTasks.map(renderReadOnlyTask)}</div>}
      </section>

      {partitions.cameBackTasks.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw size={15} className="text-warning" />
            <h2 className="text-sm font-semibold text-text1">Came Back</h2>
            <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{partitions.cameBackTasks.length}</span>
          </div>
          <div className="text-xs text-text2 mb-3">These issues were closed or cancelled recently, then reappeared in the latest data.</div>
          <div>{partitions.cameBackTasks.map(renderOwnedTask)}</div>
        </section>
      )}

      <section>
        <button
          type="button"
          onClick={() => setShowYesterday(value => !value)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-text1 hover:text-accent transition-colors"
        >
          {showYesterday ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          Completed yesterday
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{partitions.completedYesterday.length}</span>
        </button>
        {showYesterday && (
          partitions.completedYesterday.length === 0
            ? <div className="card text-center py-10 text-text2 text-sm">Nothing completed yesterday.</div>
            : <div>{partitions.completedYesterday.map(renderOwnedTask)}</div>
        )}
      </section>

      {modal && <TaskModal open={modal} onClose={() => setModal(false)} />}
      {editingTask && (
        <TaskModal
          open={!!editingTask}
          task={editingTask}
          readOnly={readOnlyTask}
          onClose={() => {
            setEditingTask(null)
            setReadOnlyTask(false)
          }}
        />
      )}
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
