# Vendor Total Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show and sort vendor-level `Total Profit (30d)` in the Vendor View and add it as a fifth summary KPI.

**Architecture:** Reuse the profit total already produced by `buildVendorWindowMetrics()` and expose a nullable `totalProfit30d` property on each vendor summary row. Move the existing display-row comparator into a focused helper so profit null-last sorting is testable without changing data fetching or financial calculations.

**Tech Stack:** React 18, TypeScript, Vitest, existing SKU metric hooks and currency formatters.

---

### Task 1: Test Vendor Profit Sorting Contract

**Files:**
- Modify: `app/src/pages/purchasing/VendorView.helpers.ts`
- Modify: `app/src/__tests__/VendorView.helpers.test.ts`

- [x] **Step 1: Write failing test for nullable 30-day profit ordering**

Add a helper import and test:

```typescript
import { sortVendorSummaryRows } from '../pages/purchasing/VendorView.helpers'

it('sorts total 30-day profit with unavailable vendor values last', () => {
  const rows = [
    { supplier_description: 'Low', totalProfit30d: 20 },
    { supplier_description: 'High', totalProfit30d: 70 },
    { supplier_description: 'Missing', totalProfit30d: null },
  ]

  expect(sortVendorSummaryRows(rows, { field: 'totalProfit30d', dir: 'asc' }).map(row => row.supplier_description))
    .toEqual(['Low', 'High', 'Missing'])
  expect(sortVendorSummaryRows(rows, { field: 'totalProfit30d', dir: 'desc' }).map(row => row.supplier_description))
    .toEqual(['High', 'Low', 'Missing'])
})
```

- [x] **Step 2: Run focused test and confirm it fails**

Run: `npm run test -- src/__tests__/VendorView.helpers.test.ts`

Expected: FAIL because `sortVendorSummaryRows` is not implemented.

- [x] **Step 3: Implement the sortable summary-row helper**

Add an exported helper to `VendorView.helpers.ts` that accepts rows with string, number, or nullable values; compare nulls first so they remain last independent of direction, and use the current numeric/string comparator for present values.

- [x] **Step 4: Run focused test and confirm it passes**

Run: `npm run test -- src/__tests__/VendorView.helpers.test.ts`

Expected: PASS.

### Task 2: Render Total Profit Column And KPI

**Files:**
- Modify: `app/src/pages/purchasing/VendorView.tsx`
- Create: `app/src/__tests__/VendorView.static.test.ts`

- [x] **Step 1: Write failing source guard for approved surface**

Create a static test asserting:

```typescript
expect(source).toContain('totalProfit30d')
expect(source).toContain('label="Total Profit (30d)"')
expect(source).toContain('Total Profit (30d)')
expect(source).toContain('windowMetrics.hasMetrics ? windowMetrics[\'30d\'].profit : null')
```

- [x] **Step 2: Run the guard and confirm it fails**

Run: `npm run test -- src/__tests__/VendorView.static.test.ts`

Expected: FAIL because no headline total-profit UI exists.

- [x] **Step 3: Wire profit into vendor rows and render it**

Modify `VendorView.tsx` to add nullable `totalProfit30d`, replace the inline summary sorting with `sortVendorSummaryRows`, add the sortable `Total Profit (30d)` header and row cell, add a fifth KPI using summed available profit, and adjust the KPI grid/table empty-state column count.

- [x] **Step 4: Run focused and full verification**

Run:

```powershell
npm run test -- src/__tests__/VendorView.helpers.test.ts src/__tests__/VendorView.static.test.ts
npm run test
npm run build
```

Expected: all tests pass and the production build succeeds.
