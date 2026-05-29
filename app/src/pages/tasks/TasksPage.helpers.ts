import type { Task, TaskPriority } from '@/types'

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function extractVendor(task: Pick<Task, 'description'>): string | null {
  if (!task.description) return null
  const match = task.description.match(/^Vendor:\s*(.+)/m)
  return match ? match[1].trim() : null
}

export function groupTasksByAssignee(tasks: Task[]): Array<{ label: string; tasks: Task[]; isUnassigned: boolean }> {
  const groups = new Map<string, Task[]>()
  const unassigned: Task[] = []

  for (const task of tasks) {
    const name = task.assignee?.name?.trim()
    if (!name) {
      unassigned.push(task)
      continue
    }
    groups.set(name, [...(groups.get(name) ?? []), task])
  }

  const result = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, group]) => ({ label, tasks: group, isUnassigned: false }))

  if (unassigned.length > 0) {
    result.push({ label: 'Unassigned', tasks: unassigned, isUnassigned: true })
  }

  return result
}

export function calculatePostponedUntil(days: number, from = new Date()): string {
  const date = new Date(from)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function sortTasksForDailyView(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (priority !== 0) return priority
    return String(a.due_date ?? '9999-12-31').localeCompare(String(b.due_date ?? '9999-12-31'))
  })
}
