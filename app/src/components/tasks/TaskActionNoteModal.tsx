import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface TaskActionNoteModalProps {
  open: boolean
  title: string
  label: string
  submitLabel: string
  isPending?: boolean
  durationDays?: number
  onDurationChange?: (days: number) => void
  onClose: () => void
  onSubmit: (note: string) => void
}

const POSTPONE_DAYS = [3, 7, 14, 30]

export function isValidTaskActionNote(note: string): boolean {
  return note.trim().length > 0
}

export default function TaskActionNoteModal({
  open,
  title,
  label,
  submitLabel,
  isPending = false,
  durationDays,
  onDurationChange,
  onClose,
  onSubmit,
}: TaskActionNoteModalProps) {
  const [note, setNote] = useState('')
  const isValid = isValidTaskActionNote(note)

  function handleSubmit() {
    if (!isValid) return
    onSubmit(note.trim())
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {durationDays && onDurationChange && (
          <div>
            <label className="block text-xs font-medium text-text2 mb-1.5">Postpone for</label>
            <div className="grid grid-cols-4 gap-2">
              {POSTPONE_DAYS.map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onDurationChange(days)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    durationDays === days
                      ? 'border-accent bg-accent/15 text-accent font-semibold'
                      : 'border-border text-text2 hover:bg-surface2'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-text2 mb-1.5">{label}</label>
          <textarea
            className="input w-full resize-none"
            rows={4}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Note required..."
          />
          {!isValid && <div className="mt-1 text-[11px] text-text2">Note required</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={isPending || !isValid}>
            {isPending ? <LoadingSpinner size="sm" /> : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
