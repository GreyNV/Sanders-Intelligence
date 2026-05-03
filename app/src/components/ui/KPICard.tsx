import { cn } from '@/lib/utils'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  variant?: Variant
  icon?: React.ReactNode
}

const variantClass: Record<Variant, string> = {
  default: 'text-text1',
  success: 'text-success',
  warning: 'text-warning',
  danger:  'text-danger',
  info:    'text-accent',
}

export default function KPICard({ label, value, sub, variant = 'default', icon }: KPICardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text2">{label}</div>
        {icon && <div className="text-text2">{icon}</div>}
      </div>
      <div className={cn('text-3xl font-bold leading-none tabular-nums', variantClass[variant])}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-text2 mt-1.5">{sub}</div>}
    </div>
  )
}
