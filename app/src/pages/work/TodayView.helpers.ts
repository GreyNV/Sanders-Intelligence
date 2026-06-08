import type { Task } from '@/types'
import { sortTasksForTodayView } from '@/pages/tasks/TasksPage.helpers'

function dateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function partitionTodayTasks(tasks: Task[], userId: string, today = new Date()) {
  const todayKey = dateKey(today)
  const yesterdayKey = dateKey(addDays(today, -1))
  const assigned = tasks.filter(task => task.assigned_to === userId)

  const yourTasks = sortTasksForTodayView(assigned.filter(task => {
    if (task.reopened_from_task_id) return false
    if (task.status === 'done' || task.status === 'cancelled' || task.status === 'postponed') return false
    if (task.status === 'in_progress') return true
    if (!task.due_date) return false
    return task.due_date <= todayKey
  }))

  const cameBackTasks = sortTasksForTodayView(assigned.filter(task =>
    !!task.reopened_from_task_id &&
    dateKey(task.created_at) === todayKey &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    task.status !== 'postponed'
  ))

  const completedYesterday = assigned
    .filter(task => task.status === 'done' && dateKey(task.updated_at) === yesterdayKey)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const unassignedTasks = sortTasksForTodayView(tasks.filter(task =>
    task.assigned_to === null &&
    task.due_date === todayKey &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    task.status !== 'postponed'
  ))

  const otherTasks = sortTasksForTodayView(tasks.filter(task =>
    task.assigned_to !== null &&
    task.assigned_to !== userId &&
    task.due_date === todayKey &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    task.status !== 'postponed'
  ))

  return { yourTasks, unassignedTasks, otherTasks, cameBackTasks, completedYesterday }
}

export function computeTodayCounters(tasks: Task[], userId: string, today = new Date()) {
  const todayKey = dateKey(today)
  const assigned = tasks.filter(task => task.assigned_to === userId)

  return {
    createdToday: tasks.filter(task => dateKey(task.created_at) === todayKey && !task.reopened_from_task_id).length,
    completedToday: tasks.filter(task => task.status === 'done' && dateKey(task.updated_at) === todayKey).length,
    dueToday: assigned.filter(task =>
      task.due_date === todayKey &&
      task.status !== 'done' &&
      task.status !== 'cancelled' &&
      task.status !== 'postponed'
    ).length,
  }
}
