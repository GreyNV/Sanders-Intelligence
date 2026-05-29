import { useMemo, useState } from 'react'
import { CheckCircle, ChevronDown, ChevronRight, Clock, Plus, Sparkles } from 'lucide-react'
import KPICard from '@/components/ui/KPICard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import TaskCard from '@/components/tasks/TaskCard'
import TaskModal from '@/components/tasks/TaskModal'
import TaskActionNoteModal from '@/components/tasks/TaskActionNoteModal'
import { useAuth } from '@/contexts/AuthContext'
import { useTasks, useUpdateTaskStatus, useDeleteTask } from '@/hooks/useTasks'
import { useAddTaskComment, useTaskCommentCounts } from '@/hooks/useTaskComments'
import { fmtDate } from '@/lib/utils'
import type { Task } from '@/types'
import { calculatePostponedUntil } from '@/pages/tasks/TasksPage.helpers'
import { computeDailyCounters, partitionDailyTasks } from './DailyView.helpers'

type ActionModal = { type: 'cancel' | 'postpone'; task: Task } | null

export default function DailyView() {
  const { profile } = useAuth()
  const { data: tasks = [], isLoading, error } = useTasks()
  const updateStatus = useUpdateTaskStatus()
  const deleteTask = useDeleteTask()
  const addComment = useAddTaskComment()

  const [modal, setModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [actionModal, setActionModal] = useState<ActionModal>(null)
  const [postponeDays, setPostponeDays] = useState(7)
  const [showYesterday, setShowYesterday] = useState(false)

  const taskIds = useMemo(() => tasks.map(task => task.id), [tasks])
  const { data: commentCounts = new Map<string, number>() } = useTaskCommentCounts(taskIds)
  const { todayTasks, completedYesterday } = useMemo(
    () => profile ? partitionDailyTasks(tasks, profile.id) : { todayTasks: [], completedYesterday: [] },
    [tasks, profile]
  )
  const counters = useMemo(
    () => profile ? computeDailyCounters(tasks, profile.id) : { createdToday: 0, completedToday: 0, dueToday: 0 },
    [tasks, profile]
  )

  if (isLoading) return <PageLoader />
  if (error) return (
    <div className="card text-center py-16">
      <div className="text-text1 font-semibold mb-1">Failed to load your day</div>
      <div className="text-text2 text-sm">{(error as Error)?.message ?? 'Try refreshing the page.'}</div>
    </div>
  )

  function handleAdvance(task: Task) {
    updateStatus.mutate({ id: task.id, status: task.status === 'todo' ? 'in_progress' : 'done' })
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

  function renderTask(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        profile={profile}
        showDept={profile?.role === 'admin' || profile?.role === 'csuite'}
        commentCount={commentCounts.get(task.id) ?? 0}
        onAdvance={handleAdvance}
        onCancel={task => setActionModal({ type: 'cancel', task })}
        onPostpone={task => {
          setPostponeDays(7)
          setActionModal({ type: 'postpone', task })
        }}
        onEdit={setEditingTask}
        onDelete={id => deleteTask.mutate(id)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-text1">My Day</h1>
          <p className="text-text2 text-sm mt-0.5">
            {profile?.name ?? 'Your'} work for {fmtDate(new Date().toISOString())}
          </p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'purchasing') && (
          <button onClick={() => setModal(true)} className="btn-primary text-xs">
            <Plus size={14} /> New Task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <KPICard label="Created today" value={counters.createdToday} icon={<Sparkles size={18} />} variant="info" />
        <KPICard label="Completed today" value={counters.completedToday} icon={<CheckCircle size={18} />} variant="success" />
        <KPICard label="Due today" value={counters.dueToday} icon={<Clock size={18} />} variant="warning" />
      </div>

      <section className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={15} className="text-accent" />
          <h2 className="text-sm font-semibold text-text1">Today</h2>
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{todayTasks.length}</span>
        </div>
        {todayTasks.length === 0 ? (
          <div className="card text-center py-10 text-text2 text-sm">Nothing due today.</div>
        ) : (
          <div>{todayTasks.map(renderTask)}</div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowYesterday(value => !value)}
          className="flex items-center gap-2 mb-3 text-sm font-semibold text-text1 hover:text-accent transition-colors"
        >
          {showYesterday ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          Completed yesterday
          <span className="text-xs text-text2 bg-surface2 px-2 py-0.5 rounded-full">{completedYesterday.length}</span>
        </button>
        {showYesterday && (
          completedYesterday.length === 0 ? (
            <div className="card text-center py-10 text-text2 text-sm">Nothing completed yesterday.</div>
          ) : (
            <div>{completedYesterday.map(renderTask)}</div>
          )
        )}
      </section>

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
