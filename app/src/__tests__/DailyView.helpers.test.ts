import { describe, expect, it } from 'vitest'
import { computeDailyCounters, partitionDailyTasks } from '../pages/work/DailyView.helpers'
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
    assignee: null,
    creator: null,
    ...overrides,
  }
}

describe('DailyView helpers', () => {
  const today = new Date('2026-05-28T12:00:00.000Z')

  it('puts assigned due, overdue, and in-progress tasks into Today', () => {
    const result = partitionDailyTasks([
      makeTask({ id: 'due', due_date: '2026-05-28', priority: 'high' }),
      makeTask({ id: 'overdue', due_date: '2026-05-27', priority: 'urgent' }),
      makeTask({ id: 'progress', status: 'in_progress', due_date: null }),
      makeTask({ id: 'future', due_date: '2026-05-29' }),
      makeTask({ id: 'other-user', assigned_to: 'someone-else', due_date: '2026-05-28' }),
      makeTask({ id: 'postponed', status: 'postponed', due_date: '2026-05-28' }),
    ], 'me', today)

    expect(result.todayTasks.map(task => task.id)).toEqual(['overdue', 'due', 'progress'])
  })

  it('finds completed-yesterday tasks for the current user', () => {
    const result = partitionDailyTasks([
      makeTask({ id: 'yesterday', status: 'done', updated_at: '2026-05-27T18:00:00.000Z' }),
      makeTask({ id: 'today', status: 'done', updated_at: '2026-05-28T18:00:00.000Z' }),
    ], 'me', today)

    expect(result.completedYesterday.map(task => task.id)).toEqual(['yesterday'])
  })

  it('computes created, completed, and due counters', () => {
    const counters = computeDailyCounters([
      makeTask({ id: 'created', created_at: '2026-05-28T08:00:00.000Z' }),
      makeTask({ id: 'completed', status: 'done', updated_at: '2026-05-28T09:00:00.000Z' }),
      makeTask({ id: 'due', due_date: '2026-05-28' }),
      makeTask({ id: 'other-user', assigned_to: 'someone-else', due_date: '2026-05-28' }),
    ], 'me', today)

    expect(counters).toEqual({ createdToday: 3, completedToday: 1, dueToday: 1 })
  })
})
