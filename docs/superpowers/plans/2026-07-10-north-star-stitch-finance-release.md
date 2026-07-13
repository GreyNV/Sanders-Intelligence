# North Star Stitch Finance Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the next North Star package: stable BPR behavior, completed Stitch North Star finance presentation flow, local-session Monthly Star overrides, and admin leadership-tool upload with automatic finance snapshot parsing.

**Architecture:** Keep the existing North Star tables and update paths for persistent BPR rows. Add one singleton leadership snapshot table for parsed workbook data, parse `.xlsx`/`.xlsm` in the admin UI, expose the latest snapshot through a hook, and merge generated finance presentation rows into Stitch without adding a new project field. Monthly Star actual/forecast overrides stay in React session state and never call Supabase mutations.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Supabase, Vitest, SheetJS `xlsx`, lucide-react.

---

## File Map

- Create: `supabase/migrations/022_leadership_tool_snapshot.sql`
  - Adds a singleton `leadership_tool_snapshot` table with RLS.
- Modify: `app/package.json`
  - Adds `xlsx` for browser-side workbook parsing.
- Modify: `app/package-lock.json`
  - Locks the `xlsx` dependency.
- Create: `app/src/lib/leadershipToolParser.ts`
  - Converts workbook sheets into cashflow, payroll, PnL, and sales simulation payloads.
- Create: `app/src/hooks/useLeadershipSnapshot.ts`
  - Fetches and replaces the current leadership snapshot.
- Modify: `app/src/types/index.ts`
  - Adds leadership snapshot, cashflow, payroll, and PnL types.
- Modify: `app/src/pages/admin/UploadsPage.tsx`
  - Adds a leadership-tool upload panel next to the existing inventory CSV upload path.
- Modify: `app/src/pages/csuite/StitchNorthStar.helpers.ts`
  - Builds Ryan's finance presentation rows from Monthly Star and leadership snapshot data.
- Modify: `app/src/pages/csuite/StitchNorthStar.tsx`
  - Adds Daily Lift/Lift %, local-session Monthly Star overrides, latest leadership snapshot consumption, and Ryan 4-slide deck behavior.
- Modify: `app/src/pages/csuite/NorthStar.helpers.ts`
  - Extends `NorthStarDisplayRow.source` to include leadership generated rows.
- Modify: `app/src/__tests__/StitchNorthStar.helpers.test.ts`
  - Covers Daily Lift/Lift %, local-session row behavior, Ryan finance rows, and snapshot-driven rows.
- Modify: `app/src/__tests__/StitchNorthStar.static.test.ts`
  - Covers route/UI contracts and local override guardrails.
- Create: `app/src/__tests__/leadershipToolParser.test.ts`
  - Covers workbook coordinate parsing from matrix fixtures.
- Create: `app/src/__tests__/LeadershipUploads.static.test.ts`
  - Covers upload accept types and snapshot replacement copy/path.

## Task 1: Freeze Current North Star And Stitch Baseline

**Files:**
- Read: `app/src/pages/csuite/NorthStar.tsx`
- Read: `app/src/pages/csuite/NorthStar.helpers.ts`
- Read: `app/src/pages/csuite/StitchNorthStar.tsx`
- Read: `app/src/pages/csuite/StitchNorthStar.helpers.ts`
- Read: `app/src/__tests__/NorthStar.helpers.test.ts`
- Read: `app/src/__tests__/NorthStar.static.test.ts`
- Read: `app/src/__tests__/StitchNorthStar.helpers.test.ts`
- Read: `app/src/__tests__/StitchNorthStar.static.test.ts`

- [ ] **Step 1: Inspect dirty files before editing**

Run:

```powershell
cd D:\Sanders Intelligence
git status --short
git diff -- app/src/pages/csuite/StitchNorthStar.tsx app/src/pages/csuite/StitchNorthStar.helpers.ts app/src/pages/csuite/NorthStar.helpers.ts
```

Expected: Identify existing uncommitted Stitch/North Star work and avoid reverting unrelated changes.

- [ ] **Step 2: Run focused baseline tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- NorthStar StitchNorthStar --reporter=dot
```

Expected: Existing North Star/Stitch tests pass before adding the leadership upload work. If they fail, fix the existing failure first and keep that commit separate from leadership parsing.

- [ ] **Step 3: Commit the clean baseline if needed**

If the current dirty North Star/Stitch work is ready and verified, stage only those files:

```powershell
cd D:\Sanders Intelligence
git add app/src/pages/csuite/StitchNorthStar.tsx app/src/pages/csuite/StitchNorthStar.helpers.ts app/src/pages/csuite/NorthStar.helpers.ts app/src/__tests__/StitchNorthStar.helpers.test.ts app/src/__tests__/StitchNorthStar.static.test.ts
git diff --cached --check
git commit -m "feat: stabilize stitch north star baseline"
```

Expected: A baseline commit exists, or this step is skipped because the release work is already isolated.

## Task 2: Add Leadership Snapshot Table

**Files:**
- Create: `supabase/migrations/022_leadership_tool_snapshot.sql`
- Modify: `app/src/types/index.ts`

- [ ] **Step 1: Create the migration**

Add `supabase/migrations/022_leadership_tool_snapshot.sql`:

```sql
-- Singleton leadership-tool finance snapshot for Stitch North Star.

create extension if not exists pgcrypto;

create table if not exists public.leadership_tool_snapshot (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null default 'current' check (snapshot_key = 'current'),
  filename text not null,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now(),
  cashflow jsonb not null default '{}'::jsonb,
  payroll jsonb not null default '{}'::jsonb,
  pnl jsonb not null default '{}'::jsonb,
  sales_simulation jsonb not null default '{}'::jsonb,
  source_meta jsonb not null default '{}'::jsonb,
  unique (snapshot_key)
);

alter table public.leadership_tool_snapshot enable row level security;

drop policy if exists "leadership snapshot readable by active users" on public.leadership_tool_snapshot;
create policy "leadership snapshot readable by active users"
on public.leadership_tool_snapshot for select
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
  )
);

drop policy if exists "leadership snapshot replaceable by admins" on public.leadership_tool_snapshot;
create policy "leadership snapshot replaceable by admins"
on public.leadership_tool_snapshot for all
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.is_active = true
      and u.role = 'admin'
  )
);
```

- [ ] **Step 2: Add TypeScript types**

Append these interfaces near the North Star types in `app/src/types/index.ts`:

```typescript
export interface LeadershipCashflowWeek {
  week: number
  week_start_date: string
  beginning_cash: number
  fixed_outflows: number
  tier_1_vendor_payments: number
  tier_2_vendor_payments: number
  tier_3_vendor_payments: number
  vendor_deposits: number
  total_vendor_payments: number
  total_outflows: number
  ending_cash: number
  ending_cash_vs_floor: number
}

export interface LeadershipPayrollDepartment {
  department: string
  periods: Array<{
    month: string
    current_year: number
    last_year: number
    difference_pct: number | null
  }>
}

export interface LeadershipPnlAccount {
  account: string
  periods: Array<{
    month: string
    current_year: number
    last_year: number
    difference_pct: number | null
  }>
}

export interface LeadershipSalesSimulation {
  noi_benchmark_pct: number
  latest_income: number
  latest_noi: number
  latest_noi_pct: number | null
  sales_needed_for_benchmark: number | null
}

export interface LeadershipToolSnapshot {
  id: string
  snapshot_key: 'current'
  filename: string
  uploaded_by: string | null
  uploaded_at: string
  cashflow: {
    current_cash_balance: number | null
    minimum_cash_floor: number | null
    weeks: LeadershipCashflowWeek[]
  }
  payroll: {
    departments: LeadershipPayrollDepartment[]
  }
  pnl: {
    accounts: LeadershipPnlAccount[]
  }
  sales_simulation: LeadershipSalesSimulation
  source_meta: Record<string, unknown>
}
```

- [ ] **Step 3: Verify migration syntax locally**

Run:

```powershell
cd D:\Sanders Intelligence
rg -n "leadership_tool_snapshot|leadership snapshot" supabase/migrations/022_leadership_tool_snapshot.sql app/src/types/index.ts
```

Expected: The migration and TypeScript types reference the singleton snapshot consistently.

## Task 3: Add Workbook Parser

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Create: `app/src/lib/leadershipToolParser.ts`
- Create: `app/src/__tests__/leadershipToolParser.test.ts`

- [ ] **Step 1: Add the workbook dependency**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm install xlsx
```

Expected: `package.json` and `package-lock.json` include `xlsx`.

- [ ] **Step 2: Write parser tests first**

Create `app/src/__tests__/leadershipToolParser.test.ts` with matrix fixtures:

```typescript
import { describe, expect, it } from 'vitest'
import { parseLeadershipWorkbookSheets } from '../lib/leadershipToolParser'

describe('leadership tool parser', () => {
  it('parses Summary_13wks cashflow rows 18 through 30', () => {
    const sheets = {
      Summary_13wks: [
        ['Current Cash Balance', 4247564.99],
        ['Minimum Cash Floor', 600000],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        ['Week #', 'Week Start Date', 'Beginning Cash', 'Fixed Outflows', 'Tier 1 Vendor Pmts', 'Tier 2 Vendor Pmts', 'Tier 3 Vendor Pmts', 'Vendor Deposits', 'Total Vendor Pmts', 'Total Outflows', 'Ending Cash', 'Ending Cash vs Floor'],
        [1, '2026-07-06', 4247564.99, 75531.34, 100000, 200000, 300000, 0, 600000, 675531.34, 3389535.39, 2789535.39],
        [2, '2026-07-13', 3389535.39, 75531.34, 100000, 200000, 300000, 0, 600000, 675531.34, 2714004.05, 2114004.05],
      ],
      Payroll: [],
      PnL: [],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.cashflow.current_cash_balance).toBe(4247564.99)
    expect(parsed.cashflow.minimum_cash_floor).toBe(600000)
    expect(parsed.cashflow.weeks).toHaveLength(2)
    expect(parsed.cashflow.weeks[0]).toMatchObject({
      week: 1,
      week_start_date: '2026-07-06',
      ending_cash: 3389535.39,
      ending_cash_vs_floor: 2789535.39,
    })
  })

  it('parses Payroll department rows from row 10 onward', () => {
    const sheets = {
      Summary_13wks: [],
      Payroll: [
        ['IsPayroll', true],
        ['IsTotalRow', false],
        [],
        ['Column Labels'],
        [2026],
        ['Qtr1'],
        ['Mar', null, null, 'Jun'],
        [46082, null, null, 46174],
        ['Department', 'This Year, $', 'Last Year, $', 'Difference, %', 'This Year, $', 'Last Year, $', 'Difference, %'],
        ['Finance', 31307.17, 16657.59, 0.87945, 29124.42, 13775.3, 1.11425],
        ['Grand Total', 100000, 90000, 0.11111, 120000, 100000, 0.2],
      ],
      PnL: [],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.payroll.departments[0]).toMatchObject({
      department: 'Finance',
      periods: [
        { month: '2026-03-01', current_year: 31307.17, last_year: 16657.59, difference_pct: 0.87945 },
        { month: '2026-06-01', current_year: 29124.42, last_year: 13775.3, difference_pct: 1.11425 },
      ],
    })
  })

  it('parses PnL Grand Total as NOI and computes the 9 percent benchmark gap', () => {
    const sheets = {
      Summary_13wks: [],
      Payroll: [],
      PnL: [
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [null, '2026'],
        [null, '2026-06-01'],
        ['Account', 'Current Year, $', 'Last Year, $', 'Difference, %'],
        ['Income', 8632172.09, 7173126.82, 0.2034],
        ['COGS', -4407472.32, -3450107.77, 0.2774],
        ['Expense', -3149694.59, -3493851.69, -0.0985],
        ['Other Income', 103551.32, 3549.66, 28.1721],
        ['Other Expense', -144278.05, -83534.68, 0.7271],
        ['Grand Total', 1034278.45, 149182.34, 5.933],
      ],
    }

    const parsed = parseLeadershipWorkbookSheets(sheets)

    expect(parsed.pnl.accounts.find(row => row.account === 'Grand Total')?.periods[0].current_year).toBe(1034278.45)
    expect(parsed.sales_simulation.noi_benchmark_pct).toBe(0.09)
    expect(parsed.sales_simulation.latest_noi_pct).toBeCloseTo(0.1198, 4)
    expect(parsed.sales_simulation.sales_needed_for_benchmark).toBe(0)
  })
})
```

- [ ] **Step 3: Run the failing parser tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- leadershipToolParser --reporter=dot
```

Expected: FAIL because `leadershipToolParser.ts` does not exist.

- [ ] **Step 4: Implement the parser**

Create `app/src/lib/leadershipToolParser.ts` with:

```typescript
import * as XLSX from 'xlsx'
import type { LeadershipToolSnapshot } from '@/types'

type SheetMatrix = unknown[][]

export interface ParsedLeadershipTool {
  cashflow: LeadershipToolSnapshot['cashflow']
  payroll: LeadershipToolSnapshot['payroll']
  pnl: LeadershipToolSnapshot['pnl']
  sales_simulation: LeadershipToolSnapshot['sales_simulation']
  source_meta: Record<string, unknown>
}

export async function parseLeadershipToolFile(file: File): Promise<ParsedLeadershipTool> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheets = Object.fromEntries(
    workbook.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true }) as SheetMatrix])
  )
  return parseLeadershipWorkbookSheets(sheets)
}

export function parseLeadershipWorkbookSheets(sheets: Record<string, SheetMatrix>): ParsedLeadershipTool {
  const cashflow = parseCashflow(requiredSheet(sheets, 'Summary_13wks'))
  const payroll = parsePayroll(requiredSheet(sheets, 'Payroll'))
  const pnl = parsePnl(requiredSheet(sheets, 'PnL'))
  return {
    cashflow,
    payroll,
    pnl,
    sales_simulation: buildSalesSimulation(pnl),
    source_meta: {
      parsed_at: new Date().toISOString(),
      source_sheets: Object.keys(sheets),
    },
  }
}

function requiredSheet(sheets: Record<string, SheetMatrix>, name: string): SheetMatrix {
  const sheet = sheets[name]
  if (!sheet) throw new Error(`Leadership workbook is missing required sheet: ${name}`)
  return sheet
}

function parseCashflow(sheet: SheetMatrix): LeadershipToolSnapshot['cashflow'] {
  const headerIndex = sheet.findIndex(row => String(row[0] ?? '').trim() === 'Week #')
  if (headerIndex < 0) throw new Error('Summary_13wks is missing the Week # header row')
  const weeks = sheet.slice(headerIndex + 1)
    .filter(row => toNumber(row[0]) !== null)
    .map(row => ({
      week: toNumber(row[0]) ?? 0,
      week_start_date: toIsoDate(row[1]),
      beginning_cash: toNumber(row[2]) ?? 0,
      fixed_outflows: toNumber(row[3]) ?? 0,
      tier_1_vendor_payments: toNumber(row[4]) ?? 0,
      tier_2_vendor_payments: toNumber(row[5]) ?? 0,
      tier_3_vendor_payments: toNumber(row[6]) ?? 0,
      vendor_deposits: toNumber(row[7]) ?? 0,
      total_vendor_payments: toNumber(row[8]) ?? 0,
      total_outflows: toNumber(row[9]) ?? 0,
      ending_cash: toNumber(row[10]) ?? 0,
      ending_cash_vs_floor: toNumber(row[11]) ?? 0,
    }))

  return {
    current_cash_balance: findLabeledNumber(sheet, 'Current Cash Balance'),
    minimum_cash_floor: findLabeledNumber(sheet, 'Minimum Cash Floor'),
    weeks,
  }
}

function parsePayroll(sheet: SheetMatrix): LeadershipToolSnapshot['payroll'] {
  const headerIndex = sheet.findIndex(row => String(row[0] ?? '').trim() === 'Department')
  if (headerIndex < 0) throw new Error('Payroll is missing the Department header row')
  const monthRow = sheet[headerIndex - 1] ?? []
  const departments = sheet.slice(headerIndex + 1)
    .filter(row => String(row[0] ?? '').trim().length > 0)
    .map(row => ({
      department: String(row[0]).trim(),
      periods: parseGroupedPeriods(row, monthRow, 1),
    }))
  return { departments }
}

function parsePnl(sheet: SheetMatrix): LeadershipToolSnapshot['pnl'] {
  const headerIndex = sheet.findIndex(row => String(row[0] ?? '').trim() === 'Account' || String(row[6] ?? '').trim() === 'Account')
  if (headerIndex < 0) throw new Error('PnL is missing the Account header row')
  const offset = String(sheet[headerIndex][0] ?? '').trim() === 'Account' ? 0 : 6
  const monthRow = sheet[headerIndex - 1] ?? []
  const accounts = sheet.slice(headerIndex + 1)
    .filter(row => String(row[offset] ?? '').trim().length > 0)
    .map(row => ({
      account: String(row[offset]).trim(),
      periods: parseGroupedPeriods(row, monthRow, offset + 1),
    }))
  return { accounts }
}

function parseGroupedPeriods(row: unknown[], monthRow: unknown[], startIndex: number) {
  const periods = []
  for (let index = startIndex; index < row.length; index += 3) {
    const currentYear = toNumber(row[index])
    const lastYear = toNumber(row[index + 1])
    if (currentYear === null && lastYear === null) continue
    periods.push({
      month: toIsoMonth(monthRow[index]),
      current_year: currentYear ?? 0,
      last_year: lastYear ?? 0,
      difference_pct: toNumber(row[index + 2]),
    })
  }
  return periods
}

function buildSalesSimulation(pnl: LeadershipToolSnapshot['pnl']): LeadershipToolSnapshot['sales_simulation'] {
  const income = pnl.accounts.find(row => row.account === 'Income')?.periods[0]?.current_year ?? 0
  const noi = pnl.accounts.find(row => row.account === 'Grand Total')?.periods[0]?.current_year ?? 0
  const latestNoiPct = income > 0 ? noi / income : null
  const benchmarkNoi = income * 0.09
  return {
    noi_benchmark_pct: 0.09,
    latest_income: income,
    latest_noi: noi,
    latest_noi_pct: latestNoiPct,
    sales_needed_for_benchmark: latestNoiPct !== null && noi >= benchmarkNoi ? 0 : benchmarkNoi - noi,
  }
}

function findLabeledNumber(sheet: SheetMatrix, label: string): number | null {
  const row = sheet.find(candidate => String(candidate[0] ?? '').trim() === label)
  return row ? toNumber(row[1]) : null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,%\s,]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

function toIsoMonth(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 7) + '-01'
  if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7) + '-01'
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    return `${date.y}-${String(date.m).padStart(2, '0')}-01`
  }
  return ''
}
```

- [ ] **Step 5: Run parser tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- leadershipToolParser --reporter=dot
```

Expected: PASS.

## Task 4: Add Leadership Snapshot Hook

**Files:**
- Create: `app/src/hooks/useLeadershipSnapshot.ts`
- Create: `app/src/__tests__/LeadershipUploads.static.test.ts`

- [ ] **Step 1: Add static test for upload wiring**

Create `app/src/__tests__/LeadershipUploads.static.test.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Leadership tool upload contract', () => {
  const uploadsSource = readFileSync(resolve(__dirname, '../pages/admin/UploadsPage.tsx'), 'utf8')
  const hookSource = readFileSync(resolve(__dirname, '../hooks/useLeadershipSnapshot.ts'), 'utf8')

  it('keeps the leadership workbook upload separate from inventory csv upload', () => {
    expect(uploadsSource).toContain('Leadership Tool')
    expect(uploadsSource).toContain('accept=".xlsx,.xlsm"')
    expect(uploadsSource).toContain('parseLeadershipToolFile')
    expect(uploadsSource).toContain('useReplaceLeadershipSnapshot')
  })

  it('replaces the singleton snapshot instead of creating history rows', () => {
    expect(hookSource).toContain(\"snapshot_key: 'current'\")
    expect(hookSource).toContain(\"onConflict: 'snapshot_key'\")
    expect(hookSource).not.toContain('leadership_tool_snapshot_history')
  })
})
```

- [ ] **Step 2: Run the failing static test**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- LeadershipUploads --reporter=dot
```

Expected: FAIL because the hook and upload UI do not exist.

- [ ] **Step 3: Create the hook**

Create `app/src/hooks/useLeadershipSnapshot.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { LeadershipToolSnapshot } from '@/types'
import type { ParsedLeadershipTool } from '@/lib/leadershipToolParser'

export function useLeadershipSnapshot() {
  return useQuery({
    queryKey: ['leadership_tool_snapshot', 'current'],
    queryFn: async (): Promise<LeadershipToolSnapshot | null> => {
      const { data, error } = await supabase
        .from('leadership_tool_snapshot')
        .select('*')
        .eq('snapshot_key', 'current')
        .maybeSingle()
      if (error) {
        if ((error as { code?: string }).code === '42P01') return null
        throw error
      }
      return data as LeadershipToolSnapshot | null
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useReplaceLeadershipSnapshot() {
  const qc = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async ({ filename, parsed }: { filename: string; parsed: ParsedLeadershipTool }) => {
      if (!profile || profile.role !== 'admin') throw new Error('Admin role required')
      const { data, error } = await supabase
        .from('leadership_tool_snapshot')
        .upsert({
          snapshot_key: 'current',
          filename,
          uploaded_by: profile.id,
          uploaded_at: new Date().toISOString(),
          cashflow: parsed.cashflow,
          payroll: parsed.payroll,
          pnl: parsed.pnl,
          sales_simulation: parsed.sales_simulation,
          source_meta: parsed.source_meta,
        }, { onConflict: 'snapshot_key' })
        .select('*')
        .single()
      if (error) throw error
      return data as LeadershipToolSnapshot
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leadership_tool_snapshot', 'current'] })
    },
  })
}
```

- [ ] **Step 4: Run the static test**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- LeadershipUploads --reporter=dot
```

Expected: The hook part passes and the upload UI expectations still fail until Task 5.

## Task 5: Add Admin Leadership Upload UI

**Files:**
- Modify: `app/src/pages/admin/UploadsPage.tsx`
- Modify: `app/src/__tests__/LeadershipUploads.static.test.ts`

- [ ] **Step 1: Add leadership upload imports and state**

In `UploadsPage.tsx`, add:

```typescript
import { parseLeadershipToolFile } from '@/lib/leadershipToolParser'
import { useLeadershipSnapshot, useReplaceLeadershipSnapshot } from '@/hooks/useLeadershipSnapshot'
import { FileSpreadsheet } from 'lucide-react'
```

Inside `UploadsPage`, add:

```typescript
const { data: leadershipSnapshot = null } = useLeadershipSnapshot()
const replaceLeadershipSnapshot = useReplaceLeadershipSnapshot()
const leadershipInputRef = useRef<HTMLInputElement>(null)
const [leadershipError, setLeadershipError] = useState<string | null>(null)
const [leadershipSuccess, setLeadershipSuccess] = useState(false)
```

- [ ] **Step 2: Add the leadership file handler**

Add this function beside `handleFile`:

```typescript
async function handleLeadershipFile(file: File) {
  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xlsm')) {
    setLeadershipError('Please upload a .xlsx or .xlsm leadership workbook')
    return
  }
  setLeadershipError(null)
  setLeadershipSuccess(false)
  try {
    const parsed = await parseLeadershipToolFile(file)
    await replaceLeadershipSnapshot.mutateAsync({ filename: file.name, parsed })
    setLeadershipSuccess(true)
  } catch (err) {
    setLeadershipError(err instanceof Error ? err.message : 'Leadership workbook upload failed')
  }
}
```

- [ ] **Step 3: Add the leadership upload panel**

Add a second card above Upload History:

```tsx
<div className="card mb-6 border border-border p-5">
  <div className="mb-4 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-[14px] font-semibold text-text1">Leadership Tool</h2>
      <p className="mt-1 text-sm text-text2">Upload the weekly leadership workbook to replace the current finance snapshot.</p>
    </div>
    <FileSpreadsheet size={20} className="text-accent" />
  </div>
  <button
    type="button"
    className="btn-secondary"
    onClick={() => leadershipInputRef.current?.click()}
    disabled={replaceLeadershipSnapshot.isPending}
  >
    {replaceLeadershipSnapshot.isPending ? <LoadingSpinner size="sm" /> : <Upload size={14} />}
    Upload Leadership Tool
  </button>
  <input
    ref={leadershipInputRef}
    type="file"
    accept=".xlsx,.xlsm"
    className="hidden"
    onChange={event => {
      const file = event.target.files?.[0]
      if (file) handleLeadershipFile(file)
      event.currentTarget.value = ''
    }}
  />
  {leadershipSnapshot && (
    <p className="mt-3 text-xs text-text2">
      Current snapshot: {leadershipSnapshot.filename} uploaded {fmtDate(leadershipSnapshot.uploaded_at)}
    </p>
  )}
  {leadershipSuccess && (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
      <CheckCircle size={15} /> Leadership snapshot refreshed.
    </div>
  )}
  {leadershipError && (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
      <AlertTriangle size={15} /> {leadershipError}
    </div>
  )}
</div>
```

- [ ] **Step 4: Run upload static tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- LeadershipUploads --reporter=dot
```

Expected: PASS.

## Task 6: Build Finance Rows And Local Monthly Star Overrides

**Files:**
- Modify: `app/src/pages/csuite/NorthStar.helpers.ts`
- Modify: `app/src/pages/csuite/StitchNorthStar.helpers.ts`
- Modify: `app/src/__tests__/StitchNorthStar.helpers.test.ts`

- [ ] **Step 1: Extend generated row source type**

In `NorthStar.helpers.ts`, change:

```typescript
source?: 'monthly_star'
```

to:

```typescript
source?: 'monthly_star' | 'leadership_tool'
```

- [ ] **Step 2: Write helper tests for Daily Lift and Ryan rows**

Append to `StitchNorthStar.helpers.test.ts`:

```typescript
it('keeps Monthly Star finance data owned by Ryan with daily lift and lift percent', () => {
  const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
  const monthlyInput = {
    period_month: '2026-07-01',
    target_sales: 8500000,
    mtd_actual: 843000,
    ly_mtd_actual: 1462000,
    days_elapsed: 8,
    days_remaining: 23,
    dragging_channel_notes: null,
    channel_deltas: [],
  }
  const metrics = computeMonthlyStarMetrics(monthlyInput)

  const row = buildStitchFinanceMetricRow(rows, monthlyInput, metrics, '2026-07-05')

  expect(row.owner).toBe('Ryan')
  expect(row.constraint_now).toContain('daily lift')
  expect(row.constraint_now).toContain('%')
})
```

Add a snapshot row fixture and a test:

```typescript
it('builds Ryan finance rows from the latest leadership snapshot', () => {
  const rows = mergeNorthStarRows([], '2026-07-01', '2026-07-05')
  const snapshot = {
    cashflow: {
      current_cash_balance: 4247564.99,
      minimum_cash_floor: 600000,
      weeks: [
        { week: 1, week_start_date: '2026-07-06', beginning_cash: 4247564.99, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: 3389535.39, ending_cash_vs_floor: 2789535.39 },
        { week: 13, week_start_date: '2026-09-28', beginning_cash: 100000, fixed_outflows: 75531.34, tier_1_vendor_payments: 100000, tier_2_vendor_payments: 200000, tier_3_vendor_payments: 300000, vendor_deposits: 0, total_vendor_payments: 600000, total_outflows: 675531.34, ending_cash: -415916.26, ending_cash_vs_floor: -831511.25 },
      ],
    },
    payroll: { departments: [{ department: 'Finance', periods: [{ month: '2026-06-01', current_year: 29124.42, last_year: 13775.3, difference_pct: 1.11425 }] }] },
    pnl: { accounts: [{ account: 'Grand Total', periods: [{ month: '2026-06-01', current_year: 1034278.45, last_year: 149182.34, difference_pct: 5.933 }] }] },
    sales_simulation: { noi_benchmark_pct: 0.09, latest_income: 8632172.09, latest_noi: 1034278.45, latest_noi_pct: 0.1198, sales_needed_for_benchmark: 0 },
  }

  const financeRows = buildLeadershipFinanceRows(rows, snapshot, '2026-07-01', '2026-07-05')

  expect(financeRows).toHaveLength(3)
  expect(financeRows.every(row => row.owner === 'Ryan')).toBe(true)
  expect(financeRows.map(row => row.pillar)).toEqual(['Finance metrics', 'Finance metrics', 'Finance metrics'])
  expect(financeRows.map(row => row.north_star)).toEqual(['13-week cash runway', 'Payroll by department', 'PnL / 9% NOI'])
})
```

- [ ] **Step 3: Update helper implementation**

In `StitchNorthStar.helpers.ts`, add:

```typescript
import type { LeadershipToolSnapshot } from '@/types'
```

Change `defaultFinanceConstraint` to include daily lift:

```typescript
function defaultFinanceConstraint(input: MonthlyStarInput, metrics: MonthlyStarMetrics): string {
  const notes = input.dragging_channel_notes?.trim() || formatMonthlyStarDragChannelNotes(input.channel_deltas)
  const lift = Math.max(0, metrics.dailyNeeded - metrics.dailyPace)
  const liftPct = metrics.liftNeededPct === null ? null : `${metrics.liftNeededPct.toFixed(1)}%`
  const liftText = `Daily lift: ${fmtCurrency(lift)}${liftPct ? ` (${liftPct})` : ''}.`
  if (notes) return `${liftText} Dragging channels: ${notes}`
  if (metrics.onTrack) return `Sales pace is on track to monthly target. ${liftText}`
  return `Projected sales are short of target by ${fmtCurrency(metrics.remainingToTarget)}. ${liftText}`
}
```

Add:

```typescript
export function buildLeadershipFinanceRows(
  rows: NorthStarDisplayRow[],
  snapshot: Pick<LeadershipToolSnapshot, 'cashflow' | 'payroll' | 'pnl' | 'sales_simulation'> | null,
  periodMonth: string,
  currentWeek: string
): NorthStarDisplayRow[] {
  if (!snapshot) return []
  const startSlot = nextNorthStarSlot(rows)
  return [
    buildCashRunwayRow(snapshot, periodMonth, currentWeek, startSlot),
    buildPayrollRow(snapshot, periodMonth, currentWeek, startSlot + 1),
    buildPnlRow(snapshot, periodMonth, currentWeek, startSlot + 2),
  ]
}
```

Implement the three row builders with `source: 'leadership_tool'`, `owner: 'Ryan'`, `pillar: MONTHLY_STAR_FINANCE_PILLAR`, and `status` derived from the latest values:

```typescript
function buildCashRunwayRow(snapshot: Pick<LeadershipToolSnapshot, 'cashflow'>, periodMonth: string, currentWeek: string, slotIndex: number): NorthStarDisplayRow {
  const lastWeek = snapshot.cashflow.weeks.at(-1)
  const breachWeek = snapshot.cashflow.weeks.find(week => week.ending_cash_vs_floor < 0)
  return generatedLeadershipRow({
    periodMonth,
    currentWeek,
    slotIndex,
    northStar: '13-week cash runway',
    plan: `Cash floor ${fmtCurrency(snapshot.cashflow.minimum_cash_floor ?? 0)}`,
    actual: `Current ${fmtCurrency(snapshot.cashflow.current_cash_balance ?? 0)}`,
    forecast: lastWeek ? `Week ${lastWeek.week}: ${fmtCurrency(lastWeek.ending_cash)}` : 'No runway rows',
    constraint: breachWeek ? `Cash falls below floor in week ${breachWeek.week}.` : 'Cash remains above floor across 13 weeks.',
    move: breachWeek ? 'Pull forward cash actions before the floor breach.' : 'Maintain vendor payment discipline.',
    result: lastWeek ? `13-week ending cash vs floor: ${fmtCurrency(lastWeek.ending_cash_vs_floor)}.` : null,
    status: breachWeek ? 'off_plan' : 'on_plan',
  })
}
```

Use the same `generatedLeadershipRow` helper for payroll and PnL so formatting remains consistent.

- [ ] **Step 4: Run helper tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- StitchNorthStar.helpers --reporter=dot
```

Expected: PASS.

## Task 7: Wire Stitch UI To Snapshot And Session Overrides

**Files:**
- Modify: `app/src/pages/csuite/StitchNorthStar.tsx`
- Modify: `app/src/__tests__/StitchNorthStar.static.test.ts`

- [ ] **Step 1: Add static contract for session-only overrides**

Append to `StitchNorthStar.static.test.ts`:

```typescript
it('keeps Monthly Star actual and forecast overrides local to the Stitch session', () => {
  expect(pageSource).toContain('monthlyStarOverrides')
  expect(pageSource).toContain('setMonthlyStarOverrides')
  expect(pageSource).toContain('useLeadershipSnapshot')
  expect(pageSource).not.toContain('useUpdateMonthlyStar')
})
```

- [ ] **Step 2: Add snapshot and override state**

In `StitchNorthStar.tsx`, import:

```typescript
import { useLeadershipSnapshot } from '@/hooks/useLeadershipSnapshot'
```

Add state:

```typescript
const [monthlyStarOverrides, setMonthlyStarOverrides] = useState<{ mtd_actual?: number; forecast?: number }>({})
const { data: leadershipSnapshot = null } = useLeadershipSnapshot()
```

Create an overridden input/metrics pair:

```typescript
const displayedMonthlyInput = useMemo(() => ({
  ...monthlyInput,
  mtd_actual: monthlyStarOverrides.mtd_actual ?? monthlyInput.mtd_actual,
}), [monthlyInput, monthlyStarOverrides.mtd_actual])

const displayedMonthlyMetrics = useMemo(() => {
  const base = computeMonthlyStarMetrics(displayedMonthlyInput)
  return monthlyStarOverrides.forecast === undefined
    ? base
    : { ...base, projectedMonthEnd: monthlyStarOverrides.forecast }
}, [displayedMonthlyInput, monthlyStarOverrides.forecast])
```

Use `displayedMonthlyInput` and `displayedMonthlyMetrics` in Stitch metric cards and finance row generation.

- [ ] **Step 3: Merge leadership finance rows**

Import `buildLeadershipFinanceRows` and merge rows:

```typescript
const leadershipFinanceRows = useMemo(
  () => buildLeadershipFinanceRows(baseRows, leadershipSnapshot, selectedMonth, currentWeek),
  [baseRows, leadershipSnapshot, selectedMonth, currentWeek]
)

const rows = useMemo(
  () => sortNorthStarRows(
    mergeStitchFinanceRows(baseRows, [financeMetricRow, ...leadershipFinanceRows]),
    { field: 'slot_index', dir: 'asc' }
  ),
  [baseRows, financeMetricRow, leadershipFinanceRows]
)
```

Rename `mergeStitchFinanceMetricRow` to `mergeStitchFinanceRows` or add a wrapper that replaces duplicate generated rows by `north_star`.

- [ ] **Step 4: Add Daily Lift and Lift % metric cards**

Replace the top Stitch metric grid with seven cards or a responsive dense metric strip:

```tsx
<StitchMetric label="Daily lift" value={fmtCurrency(Math.max(0, displayedMonthlyMetrics.dailyNeeded - displayedMonthlyMetrics.dailyPace))} sub="Extra per day needed" icon={<TrendingUp size={16} />} tone={displayedMonthlyMetrics.onTrack ? 'success' : 'warning'} />
<StitchMetric label="Lift %" value={displayedMonthlyMetrics.liftNeededPct === null ? 'n/a' : `${displayedMonthlyMetrics.liftNeededPct.toFixed(1)}%`} sub="Required pace lift" icon={<Target size={16} />} tone={displayedMonthlyMetrics.onTrack ? 'success' : 'warning'} />
```

- [ ] **Step 5: Add local override editing controls**

For the generated Monthly Star row, allow `actual_mtd` and `forecast` edits to update session state instead of calling Supabase:

```typescript
function handleMonthlyStarSessionOverride(field: NorthStarEditableField, value: string | NorthStarStatus) {
  if (field !== 'actual_mtd' && field !== 'forecast') return false
  const parsed = Number(String(value).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(parsed)) throw new Error('Enter a valid number')
  setMonthlyStarOverrides(previous => ({ ...previous, [field === 'actual_mtd' ? 'mtd_actual' : 'forecast']: parsed }))
  return true
}
```

Call this before `handleCellSave` checks generated fields.

- [ ] **Step 6: Run Stitch tests**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- StitchNorthStar --reporter=dot
```

Expected: PASS.

## Task 8: Full Verification And Release

**Files:**
- Verify all changed files.
- Update: Asana tasks from the release inventory.

- [ ] **Step 1: Run focused North Star verification**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- NorthStar StitchNorthStar LeadershipUploads leadershipToolParser --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Run full app verification**

Run:

```powershell
cd D:\Sanders Intelligence\app
npm test -- --reporter=dot
npm run build
```

Expected: PASS.

- [ ] **Step 3: Apply and verify migration**

Apply `supabase/migrations/022_leadership_tool_snapshot.sql` through the established Supabase migration path.

Verification SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'leadership_tool_snapshot';
```

Expected: one row with `leadership_tool_snapshot`.

- [ ] **Step 4: Manual admin QA**

Use an authenticated admin account:

```text
/admin/uploads
```

Expected:

- Inventory upload still accepts only `.csv`.
- Leadership Tool accepts `.xlsx` and `.xlsm`.
- Uploading `Weekly Reporting Tool 7.9.26 v1.2 RM.xlsm` replaces the current snapshot.
- The latest uploaded filename and date render after upload.

- [ ] **Step 5: Manual C-Suite QA**

Use an authenticated admin or csuite account:

```text
/executive/stitch-north-star
```

Expected:

- Monthly Star includes Daily Lift and Lift %.
- Editing Monthly Star MTD actual or forecast changes the current session only.
- Browser reload clears local Monthly Star overrides and restores live-derived values.
- Ryan's presentation deck contains Monthly Sales Star, cash runway, payroll, and PnL/NOI slides.
- Generated finance slide fields are editable during presentation.
- Light and dark modes are both readable.

- [ ] **Step 6: Stage, commit, and push**

Run:

```powershell
cd D:\Sanders Intelligence
git add supabase/migrations/022_leadership_tool_snapshot.sql app/package.json app/package-lock.json app/src/lib/leadershipToolParser.ts app/src/hooks/useLeadershipSnapshot.ts app/src/types/index.ts app/src/pages/admin/UploadsPage.tsx app/src/pages/csuite/NorthStar.helpers.ts app/src/pages/csuite/StitchNorthStar.helpers.ts app/src/pages/csuite/StitchNorthStar.tsx app/src/__tests__/leadershipToolParser.test.ts app/src/__tests__/LeadershipUploads.static.test.ts app/src/__tests__/StitchNorthStar.helpers.test.ts app/src/__tests__/StitchNorthStar.static.test.ts
git diff --cached --check
git commit -m "feat: add leadership finance data to stitch north star"
git push origin main
```

Expected: push succeeds and Vercel starts a deployment.

- [ ] **Step 7: Close Asana release tasks after production smoke test**

Update these tasks after deployed QA is complete:

- `1216438794906915`
- `1216438478019453`
- `1216438758766893`
- `1216438651610721`
- `1216438661477193`

Expected: Each task has a comment with the production deployment URL, verification commands, and manual QA result.

## Self-Review

- Spec coverage: The plan covers Daily Lift/Lift %, local-session Monthly Star overrides, leadership upload, snapshot replacement, automatic parsing, workbook sheet coordinates, finance auto-population, Ryan ownership, editable presentation fields, and North Star regression preservation.
- Placeholder scan: The plan avoids open placeholders and includes concrete files, commands, SQL, and TypeScript snippets.
- Type consistency: `LeadershipToolSnapshot`, `ParsedLeadershipTool`, `NorthStarDisplayRow.source`, and the hook/parser names are consistent across tasks.
