import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('useClaimTask contract', () => {
  it('claims only a task that remains unassigned', () => {
    const source = readFileSync(resolve(__dirname, '../hooks/useTasks.ts'), 'utf8')

    expect(source).toContain('export function useClaimTask()')
    expect(source).toContain('.is(\'assigned_to\', null)')
    expect(source).toContain('assigned_to: profile!.id')
  })
})
