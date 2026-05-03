import { cn } from '@/lib/utils'

type BadgeVariant = 'ok' | 'excess' | 'stockout' | 'todo' | 'in_progress' | 'done' | 'cancelled' |
                   'low' | 'medium' | 'high' | 'urgent' | 'neutral' | 'info'

const styles: Record<BadgeVariant, string> = {
  ok:          'bg-success/15 text-success',
  excess:      'bg-accent/15 text-accent',
  stockout:    'bg-danger/15 text-danger',
  todo:        'bg-border text-text2',
  in_progress: 'bg-accent/15 text-accent',
  done:        'bg-success/15 text-success',
  cancelled:   'bg-surface2 text-text2',
  low:         'bg-success/10 text-success',
  medium:      'bg-warning/10 text-warning',
  high:        'bg-orange/10 text-orange',
  urgent:      'bg-danger/15 text-danger',
  neutral:     'bg-surface2 text-text2',
  info:        'bg-accent/10 text-accent',
}

const labels: Partial<Record<string, string>> = {
  'Ok': 'OK',
  'Excess stock': 'Excess',
  'Potential s/o': 'At Risk',
  'todo': 'To Do',
  'in_progress': 'In Progress',
  'done': 'Done',
  'cancelled': 'Cancelled',
}

interface BadgeProps {
  variant: BadgeVariant
  children?: React.ReactNode
  value?: string
}

export default function Badge({ variant, children, value }: BadgeProps) {
  const text = children ?? (value ? (labels[value] ?? value) : variant)
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide', styles[variant])}>
      {text}
    </span>
  )
}

/** Map inventory status string → Badge variant */
export function statusVariant(status: string): BadgeVariant {
  if (status === 'Ok') return 'ok'
  if (status === 'Excess stock') return 'excess'
  if (status === 'Potential s/o') return 'stockout'
  return 'neutral'
}

export function priorityVariant(priority: string): BadgeVariant {
  return (priority as BadgeVariant) ?? 'medium'
}

export function taskStatusVariant(status: string): BadgeVariant {
  return (status as BadgeVariant) ?? 'neutral'
}
