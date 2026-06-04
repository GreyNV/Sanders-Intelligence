import { describe, expect, it } from 'vitest'
import { isValidTaskActionNote } from '../components/tasks/TaskActionNoteModal'

describe('TaskActionNoteModal note validation', () => {
  it('rejects empty and whitespace-only notes', () => {
    expect(isValidTaskActionNote('')).toBe(false)
    expect(isValidTaskActionNote('   ')).toBe(false)
  })

  it('accepts one non-whitespace character', () => {
    expect(isValidTaskActionNote(' x ')).toBe(true)
  })
})
