import { Building2 } from 'lucide-react'

export default function DepartmentOverview() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-text1">Department Overview</h1>
        <p className="text-text2 text-sm mt-0.5">Per-department performance metrics</p>
      </div>

      <div className="card text-center py-16">
        <Building2 size={36} className="text-text2 mx-auto mb-3" />
        <div className="text-text1 font-semibold text-base mb-1">Coming in Phase 3</div>
        <div className="text-text2 text-sm max-w-md mx-auto">
          This view will show per-department breakdowns — Purchasing, Warehouse, Marketing, and more —
          as new department dashboards are added. C-Suite will see aggregates and drill-downs for each.
        </div>
        <div className="mt-4 text-xs text-text2">
          Currently active departments: <span className="text-accent font-medium">Purchasing</span>
        </div>
      </div>
    </div>
  )
}
