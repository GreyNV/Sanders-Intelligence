interface StatusMultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export default function StatusMultiSelect({
  options,
  selected,
  onChange,
  className = '',
}: StatusMultiSelectProps) {
  const selectedSet = new Set(selected)
  const label = selected.length === 0
    ? 'All statuses'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} statuses`

  function toggleStatus(status: string) {
    if (selectedSet.has(status)) {
      onChange(selected.filter(s => s !== status))
      return
    }
    onChange([...selected, status])
  }

  return (
    <details className={`relative ${className}`}>
      <summary className="select list-none cursor-pointer min-w-[150px] text-sm">
        {label}
      </summary>
      <div className="absolute z-30 mt-1 min-w-[190px] rounded-md border border-border bg-surface shadow-lg p-1">
        <button
          type="button"
          className={`block w-full text-left px-3 py-1.5 rounded text-sm ${selected.length === 0 ? 'bg-accent/15 text-accent' : 'text-text1 hover:bg-surface2'}`}
          onClick={() => onChange([])}
        >
          All statuses
        </button>
        {options.map(status => (
          <label
            key={status}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-text1 hover:bg-surface2 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(status)}
              onChange={() => toggleStatus(status)}
            />
            <span>{status}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
