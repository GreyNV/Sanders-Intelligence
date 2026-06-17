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
  const isOpen = (task: Task) => task.status !== 'done' && task.status !== 'cancelled' && task.status !== 'postponed'

  const yourTasks = sortTasksForTodayView(assigned.filter(task => {
    if (task.reopened_from_task_id) return false
    if (!isOpen(task)) return false
    if (task.status === 'in_progress') return true
    if (!task.due_date) return false
    return task.due_date <= todayKey
  }))

  const carryoverTasks = sortTasksForTodayView(assigned.filter(task =>
    isOpen(task) &&
    !!task.due_date &&
    task.due_date <= yesterdayKey
  ))

  const cameBackTasks = sortTasksForTodayView(assigned.filter(task =>
    !!task.reopened_from_task_id &&
    dateKey(task.created_at) === todayKey &&
    isOpen(task)
  ))

  const completedYesterday = assigned
    .filter(task => task.status === 'done' && dateKey(task.updated_at) === yesterdayKey)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const unassignedTasks = sortTasksForTodayView(tasks.filter(task =>
    task.assigned_to === null &&
    task.due_date === todayKey &&
    isOpen(task)
  ))

  const otherTasks = sortTasksForTodayView(tasks.filter(task =>
    task.assigned_to !== null &&
    task.assigned_to !== userId &&
    task.due_date === todayKey &&
    isOpen(task)
  ))

  return { yourTasks, carryoverTasks, unassignedTasks, otherTasks, cameBackTasks, completedYesterday }
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

export function computeDayOverDaySummary(tasks: Task[], today = new Date()) {
  const yesterdayKey = dateKey(addDays(today, -1))
  const todayKey = dateKey(today)
  const isOpen = (task: Task) => task.status !== 'done' && task.status !== 'cancelled' && task.status !== 'postponed'
  const dueYesterdayOrEarlier = tasks.filter(task => !!task.due_date && task.due_date <= yesterdayKey)
  const yesterdayCarryover = dueYesterdayOrEarlier.filter(isOpen)

  return {
    createdYesterday: tasks.filter(task => dateKey(task.created_at) === yesterdayKey && !task.reopened_from_task_id).length,
    completedYesterday: tasks.filter(task => task.status === 'done' && dateKey(task.updated_at) === yesterdayKey).length,
    createdToday: tasks.filter(task => dateKey(task.created_at) === todayKey && !task.reopened_from_task_id).length,
    completedToday: tasks.filter(task => task.status === 'done' && dateKey(task.updated_at) === todayKey).length,
    carryoverOpen: yesterdayCarryover.length,
  }
}
