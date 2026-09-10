import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function migrationSource(): string {
  const directory = resolve(__dirname, '../../../supabase/migrations')
  return readdirSync(directory)
    .filter(name => name.endsWith('.sql'))
    .map(name => readFileSync(resolve(directory, name), 'utf8'))
    .find(source => source.includes('stitch_auto_row_overrides')) ?? ''
}

describe('Stitch auto row overrides migration', () => {
  const migration = migrationSource()

  it('stores source-versioned field overrides with a stable conflict key', () => {
    expect(migration).toContain('create table if not exists public.stitch_auto_row_overrides')
    expect(migration).toContain('source_version text not null')
    expect(migration).toContain('field_name text not null')
    expect(migration).toContain('unique (period_month, source, row_key, field_name)')
  })

  it('allows active BPR users to read and edit shared overrides', () => {
    expect(migration).toContain('alter table public.stitch_auto_row_overrides enable row level security')
    expect(migration).toContain("u.role in ('admin', 'csuite')")
    expect(migration).toContain('grant select, insert, update on public.stitch_auto_row_overrides to authenticated')
  })
})
