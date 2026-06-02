import { describe, expect, it } from 'vitest'
import { calculatePostponedUntil, groupTasksByAssignee } from '../pages/tasks/TasksPage.helpers'
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

describe('TasksPage helpers', () => {
  it('groups assigned tasks alphabetically and keeps Unassigned last', () => {
    const groups = groupTasksByAssignee([
      makeTask({ id: 'u', assignee: null }),
      makeTask({ id: 'b', assignee: { name: 'Zoe', email: 'zoe@example.com' } }),
      makeTask({ id: 'a', assignee: { name: 'Amy', email: 'amy@example.com' } }),
    ])

    expect(groups.map(group => group.label)).toEqual(['Amy', 'Zoe', 'Unassigned'])
    expect(groups[groups.length - 1]?.isUnassigned).toBe(true)
  })

  it('calculates preset postponed-until dates from a local day boundary', () => {
    expect(calculatePostponedUntil(7, new Date('2026-05-28T14:30:00.000Z'))).toBe('2026-06-04')
  })
})
