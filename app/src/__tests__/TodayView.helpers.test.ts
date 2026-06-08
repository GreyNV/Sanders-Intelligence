import { describe, expect, it } from 'vitest'
import { computeTodayCounters, partitionTodayTasks } from '../pages/work/TodayView.helpers'
import type { Task } from '../types'

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task',
    title: 'Task',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    department: 'purchasing',
    assigned_to: 'me',
    created_by: 'creator',
    created_at: '2026-05-28T10:00:00.000Z',
    updated_at: '2026-05-28T10:00:00.000Z',
    postponed_until: null,
    sku_code: null,
    source: 'manual',
    rule_id: null,
    vendor_supplier_code: null,
    vendor_name: null,
    affected_skus: null,
    upload_id: null,
    reopened_from_task_id: null,
    assignee: null,
    creator: null,
    ...overrides,
  }
}

describe('TodayView helpers', () => {
  const today = new Date('2026-05-28T12:00:00.000Z')

  it('puts assigned due, overdue, and in-progress tasks into Today', () => {
    const result = partitionTodayTasks([
      makeTask({ id: 'due', due_date: '2026-05-28', priority: 'high' }),
      makeTask({ id: 'overdue', due_date: '2026-05-27', priority: 'urgent' }),
      makeTask({ id: 'progress', status: 'in_progress', due_date: null }),
      makeTask({ id: 'future', due_date: '2026-05-29' }),
      makeTask({ id: 'other-user', assigned_to: 'someone-else', due_date: '2026-05-28' }),
      makeTask({ id: 'postponed', status: 'postponed', due_date: '2026-05-28' }),
    ], 'me', today)

    expect(result.yourTasks.map(task => task.id)).toEqual(['overdue', 'due', 'progress'])
  })

  it('finds completed-yesterday tasks for the current user', () => {
    const result = partitionTodayTasks([
      makeTask({ id: 'yesterday', status: 'done', updated_at: '2026-05-27T18:00:00.000Z' }),
      makeTask({ id: 'today', status: 'done', updated_at: '2026-05-28T18:00:00.000Z' }),
    ], 'me', today)

    expect(result.completedYesterday.map(task => task.id)).toEqual(['yesterday'])
  })

  it('computes created, completed, and due counters', () => {
    const counters = computeTodayCounters([
      makeTask({ id: 'created', created_at: '2026-05-28T08:00:00.000Z' }),
      makeTask({ id: 'completed', status: 'done', updated_at: '2026-05-28T09:00:00.000Z' }),
      makeTask({ id: 'due', due_date: '2026-05-28' }),
      makeTask({ id: 'other-user', assigned_to: 'someone-else', due_date: '2026-05-28' }),
    ], 'me', today)

    expect(counters).toEqual({ createdToday: 4, completedToday: 1, dueToday: 1 })
  })

  it('separates came-back tasks and excludes them from created-today count', () => {
    const tasks = [
      makeTask({ id: 'reopened', created_at: '2026-05-28T08:00:00.000Z', due_date: '2026-05-28', reopened_from_task_id: 'old-task' }),
      makeTask({ id: 'created', created_at: '2026-05-28T09:00:00.000Z', due_date: '2026-05-28' }),
    ]

    const partition = partitionTodayTasks(tasks, 'me', today)
    const counters = computeTodayCounters(tasks, 'me', today)

    expect(partition.cameBackTasks.map(task => task.id)).toEqual(['reopened'])
    expect(partition.yourTasks.map(task => task.id)).toEqual(['created'])
    expect(counters.createdToday).toBe(1)
  })

  it('separates unassigned and other-user due-today tasks', () => {
    const result = partitionTodayTasks([
      makeTask({ id: 'mine', due_date: '2026-05-28' }),
      makeTask({ id: 'unassigned', assigned_to: null, due_date: '2026-05-28' }),
      makeTask({ id: 'other', assigned_to: 'other-user', due_date: '2026-05-28' }),
      makeTask({ id: 'other-overdue', assigned_to: 'other-user', due_date: '2026-05-27' }),
      makeTask({ id: 'unassigned-future', assigned_to: null, due_date: '2026-05-29' }),
    ], 'me', today)

    expect(result.yourTasks.map(task => task.id)).toEqual(['mine'])
    expect(result.unassignedTasks.map(task => task.id)).toEqual(['unassigned'])
    expect(result.otherTasks.map(task => task.id)).toEqual(['other'])
  })
})
