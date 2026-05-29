import { useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { TaskTableColumnId } from '@/pages/tasks/TasksTable.helpers'
import { TASK_TABLE_COLUMNS } from '@/pages/tasks/TasksTable.helpers'

interface ColumnPickerProps {
  visibleColumns: TaskTableColumnId[]
  onChange: (columns: TaskTableColumnId[]) => void
}

export default function ColumnPicker({ visibleColumns, onChange }: ColumnPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggleColumn(id: TaskTableColumnId) {
    if (id === 'title') return
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter(column => column !== id)
      : [...visibleColumns, id]
    onChange(next)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(value => !value)} className="btn-secondary text-xs flex items-center gap-1">
        <Settings2 size={13} /> Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-surface shadow-xl z-20 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text2 px-2 py-1">Visible columns</div>
          {TASK_TABLE_COLUMNS.map(column => (
            <label key={column.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-text1 hover:bg-surface2 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.id)}
                disabled={column.id === 'title'}
                onChange={() => toggleColumn(column.id)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
