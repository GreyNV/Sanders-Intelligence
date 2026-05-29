import type { Task } from '@/types'
import { extractVendor, formatRuleLabel } from './TasksPage.helpers'

export type TaskTableColumnId =
  | 'title'
  | 'status'
  | 'priority'
  | 'due_date'
  | 'assignee'
  | 'vendor'
  | 'comments'
  | 'sku'
  | 'department'
  | 'created_at'
  | 'created_by'
  | 'source'
  | 'postponed_until'
  | 'rule'

export interface TaskTableColumn {
  id: TaskTableColumnId
  label: string
  defaultVisible: boolean
  sortable: boolean
}

export type TaskTableSort = { column: TaskTableColumnId; dir: 'asc' | 'desc' } | null

export const TASK_TABLE_COLUMNS: TaskTableColumn[] = [
  { id: 'title', label: 'Title', defaultVisible: true, sortable: true },
  { id: 'status', label: 'Status', defaultVisible: true, sortable: true },
  { id: 'priority', label: 'Priority', defaultVisible: true, sortable: true },
  { id: 'due_date', label: 'Due Date', defaultVisible: true, sortable: true },
  { id: 'assignee', label: 'Assignee', defaultVisible: true, sortable: true },
  { id: 'vendor', label: 'Vendor', defaultVisible: true, sortable: true },
  { id: 'comments', label: 'Comments', defaultVisible: true, sortable: true },
  { id: 'sku', label: 'SKU', defaultVisible: false, sortable: true },
  { id: 'department', label: 'Department', defaultVisible: false, sortable: true },
  { id: 'created_at', label: 'Created', defaultVisible: false, sortable: true },
  { id: 'created_by', label: 'Created By', defaultVisible: false, sortable: true },
  { id: 'source', label: 'Source', defaultVisible: false, sortable: true },
  { id: 'postponed_until', label: 'Postponed Until', defaultVisible: false, sortable: true },
  { id: 'rule', label: 'Rule', defaultVisible: false, sortable: true },
]

export const TASK_TABLE_COLUMNS_STORAGE_KEY = 'tasks.table.columns.v1'

export function defaultTaskTableColumnIds(): TaskTableColumnId[] {
  return TASK_TABLE_COLUMNS.filter(column => column.defaultVisible).map(column => column.id)
}

export function normalizeTaskTableColumnIds(ids: unknown): TaskTableColumnId[] {
  const validIds = new Set(TASK_TABLE_COLUMNS.map(column => column.id))
  const normalized = Array.isArray(ids)
    ? ids.filter((id): id is TaskTableColumnId => typeof id === 'string' && validIds.has(id as TaskTableColumnId))
    : []
  return normalized.includes('title') ? normalized : defaultTaskTableColumnIds()
}

export function readTaskTableColumnIds(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): TaskTableColumnId[] {
  if (!storage) return defaultTaskTableColumnIds()
  try {
    return normalizeTaskTableColumnIds(JSON.parse(storage.getItem(TASK_TABLE_COLUMNS_STORAGE_KEY) ?? 'null'))
  } catch {
    return defaultTaskTableColumnIds()
  }
}

export function getTaskTableSortValue(task: Task, column: TaskTableColumnId, commentCount = 0): string | number | null {
  switch (column) {
    case 'title': return task.title
    case 'status': return task.status
    case 'priority': return task.priority
    case 'due_date': return task.due_date
    case 'assignee': return task.assignee?.name ?? null
    case 'vendor': return extractVendor(task)
    case 'comments': return commentCount
    case 'sku': return task.sku_code
    case 'department': return task.department
    case 'created_at': return task.created_at
    case 'created_by': return task.creator?.name ?? null
    case 'source': return task.source
    case 'postponed_until': return task.postponed_until
    case 'rule': return formatRuleLabel(task.rule_id)
  }
}

export function sortTaskTableRows(
  tasks: Task[],
  sort: TaskTableSort,
  commentCounts: ReadonlyMap<string, number> = new Map()
): Task[] {
  if (!sort) return tasks

  return [...tasks].sort((a, b) => {
    const av = getTaskTableSortValue(a, sort.column, commentCounts.get(a.id) ?? 0)
    const bv = getTaskTableSortValue(b, sort.column, commentCounts.get(b.id) ?? 0)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const result = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? result : -result
  })
}

export function nextTaskTableSort(current: TaskTableSort, column: TaskTableColumnId): TaskTableSort {
  if (!current || current.column !== column) return { column, dir: 'asc' }
  if (current.dir === 'asc') return { column, dir: 'desc' }
  return null
}
