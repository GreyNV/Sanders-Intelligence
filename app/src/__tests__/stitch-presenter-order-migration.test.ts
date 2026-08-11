import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

function stitchPresenterOrderMigration() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations')
  const sources = readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => readFileSync(resolve(migrationDir, file), 'utf8'))
  return sources.find(source => source.includes('stitch_presenter_order')) ?? ''
}

describe('Stitch presenter order migration contract', () => {
  it('persists one global admin-managed sort order per presenter', () => {
    const migration = stitchPresenterOrderMigration()

    expect(migration).toContain('create table if not exists public.stitch_presenter_order')
    expect(migration).toContain('owner_key text primary key')
    expect(migration).toContain('owner_name text not null')
    expect(migration).toContain('sort_index integer not null')
    expect(migration).toContain('alter table public.stitch_presenter_order enable row level security')
    expect(migration).toContain('stitch presenter order readable by active bpr users')
    expect(migration).toContain('stitch presenter order editable by active admins')
    expect(migration).toContain("role in ('admin', 'csuite')")
    expect(migration).toContain("role = 'admin'")
    expect(migration).toContain('grant select, insert, update on public.stitch_presenter_order to authenticated')
  })
})
