# TaskModal Margin Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sortable `Margin %` column to the task-creation SKU picker using the shared 30-day accrual margin definition.

**Architecture:** Extend `TaskModal.helpers.ts` with a selector-row enrichment boundary that joins raw inventory rows to `profitBySku` and calculates nullable margin through `deriveFinancialPercentages`. `TaskModal.tsx` will fetch the existing SKU metric bundle, render the enriched rows, and keep all filtering, selection, and row-limit behavior unchanged.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, existing shared financial metric utilities.

---

### Task 1: Enrich And Sort SKU Selector Rows By Margin

**Files:**
- Modify: `app/src/components/tasks/TaskModal.helpers.ts`
- Modify: `app/src/__tests__/TaskModal.helpers.test.ts`

- [x] **Step 1: Write failing tests for margin enrichment and null-last sorting**

Add imports and test cases in `app/src/__tests__/TaskModal.helpers.test.ts`:

```typescript
import {
  buildSkuSelectorRows,
  buildVendorTaskDescription,
  filterSkuSelectorRows,
  sortSkuSelectorRows,
} from '../components/tasks/TaskModal.helpers'

it('enriches selector rows with 30-day accrual margin percentage', () => {
  const rows = buildSkuSelectorRows(
    [makeRecord({ product_code: 'SKU-MARGIN' })],
    new Map([['SKU-MARGIN', { revenue_30d: 200, accrual_profit_30d: 50 }]])
  )

  expect(rows[0].marginPct).toBe(25)
})

it('sets selector margin to null when 30-day revenue is unavailable', () => {
  const rows = buildSkuSelectorRows(
    [makeRecord({ product_code: 'SKU-NO-MARGIN' })],
    new Map([['SKU-NO-MARGIN', { revenue_30d: 0, accrual_profit_30d: 0 }]])
  )

  expect(rows[0].marginPct).toBeNull()
})

it('sorts margin percentage with unavailable values last in both directions', () => {
  const rows = [
    { ...makeRecord({ product_code: 'LOW' }), marginPct: 10 },
    { ...makeRecord({ product_code: 'HIGH' }), marginPct: 40 },
    { ...makeRecord({ product_code: 'MISSING' }), marginPct: null },
  ]

  expect(sortSkuSelectorRows(rows, { field: 'marginPct', dir: 'asc' }, new Set()).map(r => r.product_code))
    .toEqual(['LOW', 'HIGH', 'MISSING'])
  expect(sortSkuSelectorRows(rows, { field: 'marginPct', dir: 'desc' }, new Set()).map(r => r.product_code))
    .toEqual(['HIGH', 'LOW', 'MISSING'])
})
```

- [x] **Step 2: Run the focused tests to confirm they fail for the missing feature**

Run: `npm run test -- src/__tests__/TaskModal.helpers.test.ts`

Expected: FAIL because `buildSkuSelectorRows` and/or the `marginPct` sort field do not exist.

- [x] **Step 3: Implement the selector row enrichment and nullable sorting behavior**

In `app/src/components/tasks/TaskModal.helpers.ts`, add the shared calculation and enriched row type:

```typescript
import { deriveFinancialPercentages } from '@/lib/financialMetrics'

interface SkuSelectorProfitMetric {
  revenue_30d?: number | null
  accrual_profit_30d?: number | null
}

export type SkuSelectorRow = InventoryRecord & {
  marginPct: number | null
}

export function buildSkuSelectorRows(
  records: InventoryRecord[],
  profitBySku?: ReadonlyMap<string, SkuSelectorProfitMetric>
): SkuSelectorRow[] {
  return records.map(record => {
    const profit = profitBySku?.get(record.product_code)
    return {
      ...record,
      marginPct: deriveFinancialPercentages({
        revenue: profit?.revenue_30d ?? 0,
        profit: profit?.accrual_profit_30d ?? 0,
      }).marginPct,
    }
  })
}
```

Extend `SkuSelectorSortField` with `'marginPct'`, update filter/sort row inputs to accept `SkuSelectorRow[]`, and handle nullable sort values before applying direction so `null` is always last:

```typescript
if (av == null && bv == null) return 0
if (av == null) return 1
if (bv == null) return -1
```

- [x] **Step 4: Run the focused tests to confirm helper behavior passes**

Run: `npm run test -- src/__tests__/TaskModal.helpers.test.ts`

Expected: PASS.

### Task 2: Wire Margin Percentage Into The Select SKUs Picker

**Files:**
- Modify: `app/src/components/tasks/TaskModal.tsx`
- Create: `app/src/__tests__/TaskModal.static.test.ts`

- [x] **Step 1: Write a failing source guard for the approved picker rendering**

Create `app/src/__tests__/TaskModal.static.test.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('TaskModal Select SKUs metric columns', () => {
  it('places Margin % after Status and renders unavailable values safely', () => {
    const source = readFileSync(resolve(__dirname, '../components/tasks/TaskModal.tsx'), 'utf8')

    expect(source).toContain('<SortableTh field="marginPct" label="Margin %"')
    expect(source.indexOf('<SortableTh field="status"')).toBeLessThan(source.indexOf('<SortableTh field="marginPct"'))
    expect(source.indexOf('<SortableTh field="marginPct"')).toBeLessThan(source.indexOf('<SortableTh field="on_hand"'))
    expect(source).toContain("r.marginPct == null ? 'N/A'")
    expect(source).toContain('colSpan={11}')
  })
})
```

- [x] **Step 2: Run the new source guard and confirm it fails**

Run: `npm run test -- src/__tests__/TaskModal.static.test.ts`

Expected: FAIL because the `Margin %` column is not rendered yet.

- [x] **Step 3: Connect metrics and render the picker column**

In `app/src/components/tasks/TaskModal.tsx`:

```typescript
import { useSkuMetrics } from '@/hooks/useSkuMetrics'
import {
  buildSkuSelectorRows,
  // existing imports...
} from './TaskModal.helpers'

const { data: skuMetrics } = useSkuMetrics()

const selectorMetricRows = useMemo(
  () => buildSkuSelectorRows(selectableSkus, skuMetrics?.profitBySku),
  [selectableSkus, skuMetrics]
)
```

Filter and sort `selectorMetricRows`, then add the approved header and cell after `Status`:

```tsx
<SortableTh field="status" label="Status" sort={skuSort} onSort={toggleSkuSort} />
<SortableTh field="marginPct" label="Margin %" sort={skuSort} onSort={toggleSkuSort} />
<SortableTh field="on_hand" label="On Hand" sort={skuSort} onSort={toggleSkuSort} />

<td className="tabular-nums">
  {r.marginPct == null ? 'N/A' : `${r.marginPct.toFixed(1)}%`}
</td>
```

Update the empty state to `colSpan={11}`. Do not change the compact selected-SKU list.

- [x] **Step 4: Run focused and full verification**

Run:

```powershell
npm run test -- src/__tests__/TaskModal.helpers.test.ts src/__tests__/TaskModal.static.test.ts
npm run test
npm run build
```

Expected: all tests pass and Vite produces a successful production build.
