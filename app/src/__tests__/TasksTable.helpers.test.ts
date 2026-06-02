import { describe, expect, it } from 'vitest'
import {
  defaultTaskTableColumnIds,
  nextTaskTableSort,
  normalizeTaskTableColumnIds,
  sortTaskTableRows,
} from '../pages/tasks/TasksTable.helpers'
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
    assigned_to: null,
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

describe('TasksTable helpers', () => {
  it('uses the default visible column set when saved preferences are invalid', () => {
    expect(normalizeTaskTableColumnIds(['bad'])).toEqual(defaultTaskTableColumnIds())
  })

  it('honors saved visible columns while requiring title', () => {
    expect(normalizeTaskTableColumnIds(['title', 'status', 'rule'])).toEqual(['title', 'status', 'rule'])
  })

  it('cycles sort state through asc, desc, and clear', () => {
    expect(nextTaskTableSort(null, 'due_date')).toEqual({ column: 'due_date', dir: 'asc' })
    expect(nextTaskTableSort({ column: 'due_date', dir: 'asc' }, 'due_date')).toEqual({ column: 'due_date', dir: 'desc' })
    expect(nextTaskTableSort({ column: 'due_date', dir: 'desc' }, 'due_date')).toBeNull()
  })

  it('sorts nullable values last', () => {
    const rows = [
      makeTask({ id: 'none', due_date: null }),
      makeTask({ id: 'late', due_date: '2026-06-02' }),
      makeTask({ id: 'soon', due_date: '2026-05-29' }),
    ]

    expect(sortTaskTableRows(rows, { column: 'due_date', dir: 'asc' }).map(task => task.id)).toEqual(['soon', 'late', 'none'])
    expect(sortTaskTableRows(rows, { column: 'due_date', dir: 'desc' }).map(task => task.id)).toEqual(['late', 'soon', 'none'])
  })
})
