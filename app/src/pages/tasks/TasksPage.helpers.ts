import type { Task, TaskPriority } from '@/types'

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export function extractVendor(task: Pick<Task, 'description' | 'vendor_name'>): string | null {
  if (task.vendor_name?.trim()) return task.vendor_name.trim()
  if (!task.description) return null
  const match = task.description.match(/^Vendor:\s*(.+)/m)
  return match ? match[1].trim() : null
}

export function formatRuleLabel(ruleId: string | null): string | null {
  if (!ruleId) return null
  const labels: Record<string, string> = {
    price_review_cogs_rise: 'COGS rise',
    entered_at_risk: 'New at risk',
    entered_excess: 'New excess',
    vendor_at_risk_value_share: 'Risk share',
  }
  return labels[ruleId] ?? ruleId.replace(/_/g, ' ')
}

export function getTaskSkuCount(task: Pick<Task, 'affected_skus' | 'sku_code'>): number {
  return task.affected_skus?.length ?? (task.sku_code ? 1 : 0)
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

export function sortTasksForTodayView(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (priority !== 0) return priority
    return String(a.due_date ?? '9999-12-31').localeCompare(String(b.due_date ?? '9999-12-31'))
  })
}
