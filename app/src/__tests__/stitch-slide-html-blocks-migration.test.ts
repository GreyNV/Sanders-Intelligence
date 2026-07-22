import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '..')

function stitchSlideHtmlBlocksMigration() {
  const migrationDir = resolve(repoRoot, 'supabase/migrations')
  const sources = readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => readFileSync(resolve(migrationDir, file), 'utf8'))
  return sources.find(source => source.includes('stitch_slide_html_blocks')) ?? ''
}

describe('Stitch slide HTML blocks migration contract', () => {
  it('persists one raw HTML view-mode block per month and slide key with BPR role RLS', () => {
    const migration = stitchSlideHtmlBlocksMigration()

    expect(migration).toContain('create table if not exists public.stitch_slide_html_blocks')
    expect(migration).toContain('period_month date not null')
    expect(migration).toContain('slide_key text not null')
    expect(migration).toContain("view_mode text not null default 'fields'")
    expect(migration).toContain("html_code text not null default ''")
    expect(migration).toContain("check (view_mode in ('fields', 'html'))")
    expect(migration).toContain('unique (period_month, slide_key)')
    expect(migration).toContain('alter table public.stitch_slide_html_blocks enable row level security')
    expect(migration).toContain('stitch slide html blocks readable by active bpr users')
    expect(migration).toContain('stitch slide html blocks editable by active bpr users')
    expect(migration).toContain("role in ('admin', 'csuite')")
    expect(migration).toContain('grant select, insert, update on public.stitch_slide_html_blocks to authenticated')
  })
})
