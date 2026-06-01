import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('upload-csv completion failure handling', () => {
  it('keeps the auto-task migration re-runnable after partial application', () => {
    const migration = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/006_auto_task_gating.sql'),
      'utf8',
    )

    expect(migration).toContain('drop policy if exists "Authenticated users can read auto task events"')
    expect(migration.indexOf('drop policy if exists "Authenticated users can read auto task events"'))
      .toBeLessThan(migration.indexOf('create policy "Authenticated users can read auto task events"'))
  })

  it('does not ignore completion update errors from database triggers', () => {
    const source = readFileSync(
      resolve(__dirname, '../../supabase/functions/upload-csv/index.ts'),
      'utf8',
    )

    expect(source).toContain('error: completeErr')
    expect(source).toContain("status: 'failed'")
    expect(source).toContain('Failed to mark upload complete')
  })

  it('keeps auto-task trigger failures from blocking upload completion', () => {
    const migration = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/009_harden_upload_completion_trigger.sql'),
      'utf8',
    )

    expect(migration).toContain('exception when others then')
    expect(migration).toContain('raise warning')
    expect(migration).toContain('return new')
    expect(migration).toContain("upload.status = 'processing'")
    expect(migration).toContain("upload.uploaded_at < now() - interval '15 minutes'")
  })
})
