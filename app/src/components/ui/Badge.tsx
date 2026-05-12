import { cn } from '@/lib/utils'
import type { InventoryRecord } from '@/types'

type BadgeVariant = 'ok' | 'excess' | 'stockout' | 'surplus' | 'new_item' | 'todo' | 'in_progress' | 'done' | 'cancelled' |
                   'low' | 'medium' | 'high' | 'urgent' | 'neutral' | 'info'

const styles: Record<BadgeVariant, string> = {
  ok:          'bg-success/15 text-success',
  excess:      'bg-accent/15 text-accent',
  stockout:    'bg-danger/15 text-danger',
  surplus:     'bg-warning/15 text-warning',
  new_item:    'bg-surface2 text-text2',
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
  'Ok':             'OK',
  'Excess stock':   'Excess',
  'Potential s/o':  'At Risk',
  'Stocked out':    'Stocked Out',
  'Surplus orders': 'Surplus Orders',
  'New item':       'New Item',
  'todo':           'To Do',
  'in_progress':    'In Progress',
  'done':           'Done',
  'cancelled':      'Cancelled',
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
  if (status === 'Ok')             return 'ok'
  if (status === 'Excess stock')   return 'excess'
  if (status === 'Potential s/o')  return 'stockout'
  if (status === 'Stocked out')    return 'stockout'
  if (status === 'Surplus orders') return 'surplus'
  if (status === 'New item')       return 'new_item'
  return 'neutral'
}

/**
 * Derives all applicable status labels for a record.
 * A record sourced as 'Excess stock' may also have open orders (surplus),
 * and a 'Surplus orders' record may simultaneously have physical excess on hand.
 * Both labels are shown so managers see the full picture.
 */
export function deriveStatusLabels(record: InventoryRecord): Array<{ variant: BadgeVariant; label: string }> {
  const result: Array<{ variant: BadgeVariant; label: string }> = [
    { variant: statusVariant(record.status), label: record.status },
  ]

  if (record.status === 'Excess stock' && record.on_order > 0) {
    // Physical excess on hand AND more inbound — ordered when already overstocked
    result.push({ variant: 'surplus', label: 'Surplus Orders' })
  }

  if (record.status === 'Surplus orders' && record.excess_units > 0) {
    // Surplus orders classification AND excess already sitting on hand
    result.push({ variant: 'excess', label: 'Excess Stock' })
  }

  return result
}

/** Renders one or two status badges derived from the full inventory record. */
export function StatusBadges({ record }: { record: InventoryRecord }) {
  const labels = deriveStatusLabels(record)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {labels.map((l, i) => (
        <Badge key={i} variant={l.variant}>{l.label}</Badge>
      ))}
    </div>
  )
}

export function priorityVariant(priority: string): BadgeVariant {
  return (priority as BadgeVariant) ?? 'medium'
}

export function taskStatusVariant(status: string): BadgeVariant {
  return (status as BadgeVariant) ?? 'neutral'
}
