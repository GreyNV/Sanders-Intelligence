import Badge, { priorityVariant, taskStatusVariant } from '@/components/ui/Badge'
import { fmtDate } from '@/lib/utils'
import type { Task } from '@/types'
import { ArrowDown, ArrowUp, ChevronsUpDown, MessageSquare } from 'lucide-react'
import { extractVendor, formatRuleLabel } from './TasksPage.helpers'
import {
  TASK_TABLE_COLUMNS,
  getTaskTableSortValue,
  nextTaskTableSort,
  sortTaskTableRows,
  type TaskTableColumnId,
  type TaskTableSort,
} from './TasksTable.helpers'

interface TasksTableProps {
  tasks: Task[]
  commentCounts: ReadonlyMap<string, number>
  visibleColumns: TaskTableColumnId[]
  sort: TaskTableSort
  onSortChange: (sort: TaskTableSort) => void
  onEdit: (task: Task) => void
}

export default function TasksTable({
  tasks,
  commentCounts,
  visibleColumns,
  sort,
  onSortChange,
  onEdit,
}: TasksTableProps) {
  const columns = TASK_TABLE_COLUMNS.filter(column => visibleColumns.includes(column.id))
  const sortedTasks = sortTaskTableRows(tasks, sort, commentCounts)

  function renderSortIcon(column: TaskTableColumnId) {
    if (sort?.column !== column) return <ChevronsUpDown size={11} className="text-text2/50" />
    return sort.dir === 'asc' ? <ArrowUp size={11} className="text-accent" /> : <ArrowDown size={11} className="text-accent" />
  }

  function renderCell(task: Task, column: TaskTableColumnId) {
    const commentCount = commentCounts.get(task.id) ?? 0
    switch (column) {
      case 'title':
        return (
          <div>
            <div className="font-medium text-text1">{task.title}</div>
            {task.source === 'auto' && task.affected_skus?.length ? (
              <div className="text-[10px] text-text2">{task.affected_skus.length} SKU{task.affected_skus.length === 1 ? '' : 's'}</div>
            ) : null}
          </div>
        )
      case 'status':
        return <Badge variant={taskStatusVariant(task.status)} value={task.status} />
      case 'priority':
        return <Badge variant={priorityVariant(task.priority)} value={task.priority} />
      case 'due_date':
        return task.due_date ? fmtDate(task.due_date) : 'N/A'
      case 'assignee':
        return task.assignee?.name ?? 'Unassigned'
      case 'vendor':
        return extractVendor(task) ?? 'N/A'
      case 'comments':
        return <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {commentCount}</span>
      case 'sku':
        return task.sku_code ?? 'N/A'
      case 'department':
        return task.department ?? 'N/A'
      case 'created_at':
        return fmtDate(task.created_at)
      case 'created_by':
        return task.creator?.name ?? 'N/A'
      case 'source':
        return task.source
      case 'postponed_until':
        return task.postponed_until ? fmtDate(task.postponed_until) : 'N/A'
      case 'rule':
        return formatRuleLabel(task.rule_id) ?? 'N/A'
      default:
        return String(getTaskTableSortValue(task, column, commentCount) ?? 'N/A')
    }
  }

  if (sortedTasks.length === 0) {
    return <div className="card text-center py-12 text-text2 text-sm">No tasks</div>
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.id}
                className="cursor-pointer select-none"
                onClick={() => onSortChange(nextTaskTableSort(sort, column.id))}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  {column.label}
                  {renderSortIcon(column.id)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTasks.map(task => (
            <tr
              key={task.id}
              className="cursor-pointer hover:bg-surface2/60"
              onClick={() => onEdit(task)}
            >
              {columns.map(column => (
                <td key={column.id} className={column.id === 'title' ? 'min-w-[220px]' : ''}>
                  {renderCell(task, column.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
