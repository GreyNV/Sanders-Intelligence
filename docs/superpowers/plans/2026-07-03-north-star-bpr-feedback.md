# North Star BPR Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the prioritized user feedback for the North Star / Business Plan Review surface.

**Architecture:** Keep the existing persisted status enum values and make this a UI/helper-layer change. Add small, tested helper functions for status labels and owner sorting, then layer sticky headers and a read-only conference view into `NorthStar.tsx` without touching Supabase RPCs or the Monthly Star data path.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Supabase, Vitest, lucide-react.

---

### Task 1: Rename BPR Status Labels

**Files:**
- Modify: `app/src/pages/csuite/NorthStar.helpers.ts`
- Modify: `app/src/pages/csuite/NorthStar.tsx`
- Modify: `app/src/__tests__/NorthStar.helpers.test.ts`
- Modify: `app/src/__tests__/NorthStar.static.test.ts`

- [ ] **Step 1: Write the failing helper test**

Add `STATUS_LABELS` to the existing import in `NorthStar.helpers.test.ts` and add this test inside `describe('NorthStar helpers', () => { ... })`:

```typescript
it('uses feedback-approved BPR status labels without changing enum values', () => {
  expect(STATUS_LABELS).toEqual({
    on_plan: 'On track',
    at_risk: 'Off track with a plan',
    off_plan: 'Blocked',
  })
})
```

- [ ] **Step 2: Write the failing static test**

Add this test to `NorthStar.static.test.ts`:

```typescript
it('renders BPR status labels from the shared label map', () => {
  expect(source).toContain('{STATUS_LABELS.on_plan}')
  expect(source).toContain('{STATUS_LABELS.at_risk}')
  expect(source).toContain('{STATUS_LABELS.off_plan}')
  expect(source).not.toContain('<option value="on_plan">On plan</option>')
  expect(source).not.toContain('<option value="at_risk">At risk</option>')
  expect(source).not.toContain('<option value="off_plan">Off plan</option>')
})
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: FAIL because labels and select options still use the old text.

- [ ] **Step 4: Update the shared labels**

Change `STATUS_LABELS` in `NorthStar.helpers.ts` to:

```typescript
export const STATUS_LABELS: Record<NorthStarStatus, string> = {
  on_plan: 'On track',
  at_risk: 'Off track with a plan',
  off_plan: 'Blocked',
}
```

- [ ] **Step 5: Use the shared labels in the page**

In `NorthStar.tsx`, change the three top badges to:

```tsx
<Badge variant="ok">{STATUS_LABELS.on_plan}</Badge>
<Badge variant="warning">{STATUS_LABELS.at_risk}</Badge>
<Badge variant="danger">{STATUS_LABELS.off_plan}</Badge>
```

Change the status select options to:

```tsx
<option value="on_plan">{STATUS_LABELS.on_plan}</option>
<option value="at_risk">{STATUS_LABELS.at_risk}</option>
<option value="off_plan">{STATUS_LABELS.off_plan}</option>
```

- [ ] **Step 6: Run the focused tests and confirm they pass**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: PASS for the North Star tests.

### Task 2: Add Owner Sorting

**Files:**
- Modify: `app/src/pages/csuite/NorthStar.helpers.ts`
- Modify: `app/src/pages/csuite/NorthStar.tsx`
- Modify: `app/src/__tests__/NorthStar.helpers.test.ts`
- Modify: `app/src/__tests__/NorthStar.static.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Add these exports to the `NorthStar.helpers.test.ts` import after they exist in code:

```typescript
nextNorthStarSort,
sortNorthStarRows,
```

Add these tests:

```typescript
it('sorts BPR rows by owner with unassigned rows last', () => {
  const rows = [
    { ...mergeNorthStarRows([], '2026-06-01', '2026-06-14')[0], slot_index: 1, owner: 'Ryan' },
    { ...mergeNorthStarRows([], '2026-06-01', '2026-06-14')[1], slot_index: 2, owner: null },
    { ...mergeNorthStarRows([], '2026-06-01', '2026-06-14')[2], slot_index: 3, owner: 'Meilich' },
  ]

  expect(sortNorthStarRows(rows, { field: 'owner', dir: 'asc' }).map(row => row.owner))
    .toEqual(['Meilich', 'Ryan', null])
  expect(sortNorthStarRows(rows, { field: 'owner', dir: 'desc' }).map(row => row.owner))
    .toEqual(['Ryan', 'Meilich', null])
})

it('toggles BPR sort state and returns slot order as the stable default', () => {
  expect(nextNorthStarSort({ field: 'slot_index', dir: 'asc' }, 'owner')).toEqual({ field: 'owner', dir: 'asc' })
  expect(nextNorthStarSort({ field: 'owner', dir: 'asc' }, 'owner')).toEqual({ field: 'owner', dir: 'desc' })
  expect(nextNorthStarSort({ field: 'owner', dir: 'desc' }, 'slot_index')).toEqual({ field: 'slot_index', dir: 'asc' })
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: FAIL because `sortNorthStarRows` and `nextNorthStarSort` do not exist.

- [ ] **Step 3: Add sort helpers**

Add these exports to `NorthStar.helpers.ts`:

```typescript
export type NorthStarSortField = 'slot_index' | 'owner'

export interface NorthStarSortState {
  field: NorthStarSortField
  dir: 'asc' | 'desc'
}

export function nextNorthStarSort(current: NorthStarSortState, field: NorthStarSortField): NorthStarSortState {
  if (field === 'slot_index') return { field: 'slot_index', dir: 'asc' }
  if (current.field !== field) return { field, dir: 'asc' }
  return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

export function sortNorthStarRows(rows: NorthStarDisplayRow[], sort: NorthStarSortState): NorthStarDisplayRow[] {
  return [...rows].sort((a, b) => {
    if (sort.field === 'slot_index') return a.slot_index - b.slot_index

    const aOwner = (a.owner ?? '').trim()
    const bOwner = (b.owner ?? '').trim()
    const aMissing = aOwner.length === 0
    const bMissing = bOwner.length === 0

    if (aMissing && bMissing) return a.slot_index - b.slot_index
    if (aMissing) return 1
    if (bMissing) return -1

    const ownerCompare = aOwner.localeCompare(bOwner)
    if (ownerCompare !== 0) return sort.dir === 'asc' ? ownerCompare : -ownerCompare
    return a.slot_index - b.slot_index
  })
}
```

- [ ] **Step 4: Wire sort state into the page**

In `NorthStar.tsx`, import `ArrowDown`, `ArrowUp`, and `ChevronsUpDown` from `lucide-react`.

Add these imports from `NorthStar.helpers.ts`:

```typescript
nextNorthStarSort,
sortNorthStarRows,
type NorthStarSortField,
type NorthStarSortState,
```

Add sort state near the existing local state:

```typescript
const [bprSort, setBprSort] = useState<NorthStarSortState>({ field: 'slot_index', dir: 'asc' })
```

Change the rows memo to:

```typescript
const rows = useMemo(
  () => sortNorthStarRows([...savedDisplayRows, ...draftRows], bprSort),
  [savedDisplayRows, draftRows, bprSort]
)
```

Add the helper components below `MonthlyStarMetric`:

```tsx
function SortIcon({ field, sort }: { field: NorthStarSortField; sort: NorthStarSortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={12} className="text-text2/60" />
  return sort.dir === 'asc' ? <ArrowUp size={12} className="text-accent" /> : <ArrowDown size={12} className="text-accent" />
}

function BprSortableTh({
  field,
  label,
  sort,
  onSort,
  className = '',
}: {
  field: NorthStarSortField
  label: string
  sort: NorthStarSortState
  onSort: (field: NorthStarSortField) => void
  className?: string
}) {
  return (
    <th className={`px-3 py-3 text-left font-semibold ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left uppercase tracking-wider transition hover:text-text1"
        onClick={() => onSort(field)}
      >
        {label}
        <SortIcon field={field} sort={sort} />
      </button>
    </th>
  )
}
```

Change the Owner header to:

```tsx
<BprSortableTh field="owner" label="Owner" sort={bprSort} onSort={field => setBprSort(current => nextNorthStarSort(current, field))} />
```

Keep the Slot column plain in Manage pillars mode so structural slot editing remains predictable.

- [ ] **Step 5: Add the static guard**

Add this test to `NorthStar.static.test.ts`:

```typescript
it('lets BPR rows sort by owner without replacing the default slot order', () => {
  expect(source).toContain('bprSort')
  expect(source).toContain('sortNorthStarRows')
  expect(source).toContain('BprSortableTh')
  expect(source).toContain('field="owner"')
})
```

- [ ] **Step 6: Run the focused tests**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: PASS.

### Task 3: Freeze BPR Headers

**Files:**
- Modify: `app/src/pages/csuite/NorthStar.tsx`
- Modify: `app/src/__tests__/NorthStar.static.test.ts`

- [ ] **Step 1: Write the failing static test**

Add this test to `NorthStar.static.test.ts`:

```typescript
it('keeps BPR table headers sticky inside the scroll container', () => {
  expect(source).toContain('max-h-[72vh] overflow-auto')
  expect(source).toContain('sticky top-0 z-20')
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: FAIL because the BPR table container has only horizontal overflow and the `thead` is not sticky.

- [ ] **Step 3: Add vertical table scrolling and sticky headers**

Change the current table wrapper from:

```tsx
<div className="overflow-x-auto">
```

to:

```tsx
<div className="max-h-[72vh] overflow-auto">
```

Change the `thead` class from:

```tsx
<thead className="bg-surface2/70 text-xs uppercase tracking-wider text-text2">
```

to:

```tsx
<thead className="sticky top-0 z-20 bg-surface2 text-xs uppercase tracking-wider text-text2 shadow-sm">
```

- [ ] **Step 4: Run the focused tests**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: PASS.

### Task 4: Add Conference View

**Files:**
- Modify: `app/src/pages/csuite/NorthStar.tsx`
- Modify: `app/src/__tests__/NorthStar.static.test.ts`

- [ ] **Step 1: Write the failing static test**

Add this test to `NorthStar.static.test.ts`:

```typescript
it('has a read-only conference view for large-screen BPR review', () => {
  expect(source).toContain('conference')
  expect(source).toContain('ConferenceBprView')
  expect(source).toContain('Editable table')
  expect(source).toContain('Large screen')
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: FAIL because the conference view does not exist.

- [ ] **Step 3: Add view mode state**

In `NorthStar.tsx`, add:

```typescript
type BprViewMode = 'table' | 'conference'
```

Add local state:

```typescript
const [bprViewMode, setBprViewMode] = useState<BprViewMode>('table')
```

- [ ] **Step 4: Add the view toggle**

Add this next to the Manage pillars controls in the BPR card header:

```tsx
<div className="flex flex-wrap gap-2">
  <button
    type="button"
    className={bprViewMode === 'table' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
    onClick={() => setBprViewMode('table')}
  >
    Editable table
  </button>
  <button
    type="button"
    className={bprViewMode === 'conference' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
    onClick={() => setBprViewMode('conference')}
  >
    Large screen
  </button>
</div>
```

Keep the existing Manage pillars buttons admin-only.

- [ ] **Step 5: Render either the table or conference view**

Wrap the table block with:

```tsx
{bprViewMode === 'conference' ? (
  <ConferenceBprView rows={rows} />
) : (
  <div className="max-h-[72vh] overflow-auto">
    {/* existing table */}
  </div>
)}
```

- [ ] **Step 6: Add the read-only conference component**

Add this component near the other local components:

```tsx
function ConferenceBprView({ rows }: { rows: NorthStarDisplayRow[] }) {
  return (
    <div className="space-y-3 p-5">
      {rows.map(row => (
        <section key={`${row.slot_index}-${row.id ?? 'draft'}-conference`} className={`rounded-lg border border-border p-4 ${STATUS_ROW_CLASS[row.status]}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-text1">{row.pillar}</div>
              <div className="mt-1 text-sm text-text2">{row.owner?.trim() || 'Unassigned'}</div>
            </div>
            <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <ConferenceField label="Metric" value={row.north_star} />
            <ConferenceField label="Plan" value={row.plan_value} />
            <ConferenceField label="Actual" value={row.actual_mtd} />
            <ConferenceField label="Forecast" value={row.forecast} />
            <ConferenceField label="Constraint now" value={row.constraint_now} />
            <ConferenceField label="This week's move" value={row.weekly_move} />
            <ConferenceField label="Last week" value={row.last_week_result} />
          </div>
        </section>
      ))}
    </div>
  )
}

function ConferenceField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text2">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text1">{value?.trim() || 'Not set'}</div>
    </div>
  )
}
```

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: PASS.

### Task 5: Full Verification And Handoff

**Files:**
- Verify: `app/src/pages/csuite/NorthStar.tsx`
- Verify: `app/src/pages/csuite/NorthStar.helpers.ts`
- Verify: `app/src/__tests__/NorthStar.helpers.test.ts`
- Verify: `app/src/__tests__/NorthStar.static.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```powershell
cd app
npm run test -- NorthStar
```

Expected: all North Star tests pass.

- [ ] **Step 2: Run full tests**

Run:

```powershell
cd app
npm test
```

Expected: all test files pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
cd app
npm run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 4: Browser QA when auth is available**

Run the app and open `/executive/north-star` as an admin or csuite user.

Expected:

- Status labels are `On track`, `Off track with a plan`, and `Blocked`.
- Owner sorting toggles ascending and descending.
- Blank owner rows sort last.
- BPR table headers remain visible while scrolling.
- Large screen view is read-only and readable.
- Editable table view still supports csuite progress edits and admin Manage pillars controls.

- [ ] **Step 5: Update Asana tasks**

For each feedback task, add a completion comment with the files touched and verification commands. Mark the task complete after the evidence is recorded.

